#!/usr/bin/env node
/**
 * Automatische Stundenplan-Pipeline:
 * - erkennt die wahrscheinlich neueste Plan-PDF in /plan (oder --input)
 * - probiert mehrere Parser und nimmt das beste Ergebnis
 * - validiert das Ergebnis (Mindestqualität)
 * - schreibt data/timetable.json atomar
 * - entfernt alte Stundenplan-PDF-Dateien (keep=1 standard)
 *
 * Usage:
 *   node tools/ingest-latest-timetable.js
 *   node tools/ingest-latest-timetable.js --input plan/foo.pdf
 *   node tools/ingest-latest-timetable.js --keep 2
 *   node tools/ingest-latest-timetable.js --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PLAN_DIR = 'plan';
const OUTPUT_JSON = 'data/timetable.json';
const PARSER_CANDIDATES = [
  'tools/pdf-parser-specialized.js',
  'tools/pdf-to-timetable-v2.js'
];
const CLASS_IDS = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];
const DAY_IDS = ['mo', 'di', 'mi', 'do', 'fr'];

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function normalizeName(name) {
  return String(name || '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, '');
}

function hasScheduleKeyword(fileName) {
  const normalized = normalizeName(fileName);
  return /(stundenplan|plan|kw|hj|sonderplan|vertretung)/.test(normalized);
}

function extractWeekHint(fileName) {
  const m = normalizeName(fileName).match(/kw[_\s-]?([0-9]{1,2})/);
  if (!m) return null;
  const week = Number(m[1]);
  return Number.isFinite(week) ? week : null;
}

function listPdfFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        full,
        mtimeMs: stat.mtimeMs,
        weekHint: extractWeekHint(name),
        isLikelyPlan: hasScheduleKeyword(name)
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pickLatestPdf(files) {
  if (!files.length) return null;
  const planCandidates = files.filter(f => f.isLikelyPlan);
  if (!planCandidates.length) return files[0];

  // Primär nach KW im Dateinamen, sekundär nach mtime.
  const withWeek = planCandidates.filter(f => f.weekHint != null);
  if (withWeek.length) {
    withWeek.sort((a, b) => (b.weekHint - a.weekHint) || (b.mtimeMs - a.mtimeMs));
    return withWeek[0];
  }
  return planCandidates[0];
}

function summarizeQuality(data) {
  const summary = {
    entries: 0,
    withTeacher: 0,
    withRoom: 0,
    specials: 0,
    classDayCoverage: 0,
    validClassCount: 0
  };

  if (!data || typeof data !== 'object' || typeof data.classes !== 'object') return summary;

  for (const classId of CLASS_IDS) {
    const cls = data.classes[classId];
    if (!cls || typeof cls !== 'object') continue;
    summary.validClassCount += 1;

    for (const dayId of DAY_IDS) {
      const dayRows = Array.isArray(cls[dayId]) ? cls[dayId] : [];
      if (dayRows.length > 0) summary.classDayCoverage += 1;

      for (const row of dayRows) {
        summary.entries += 1;
        if (row?.teacher) summary.withTeacher += 1;
        if (row?.room) summary.withRoom += 1;
        if (row?.note) summary.specials += 1;
      }
    }
  }

  return summary;
}

function scoreTimetable(data) {
  const q = summarizeQuality(data);
  if (q.entries === 0 || q.validClassCount === 0) return -1;

  // Dichte + Datenvollständigkeit + Flächenabdeckung (Klasse×Tag).
  return (
    q.entries +
    q.withTeacher * 0.5 +
    q.withRoom * 0.25 +
    q.specials * 0.2 +
    q.classDayCoverage * 2
  );
}

function runParser(parserScript, inputPdf) {
  const tempOut = path.join('data', `.tmp-${path.basename(parserScript, '.js')}.json`);
  const validFrom = new Date().toISOString().split('T')[0];
  const result = spawnSync(process.execPath, [parserScript, inputPdf, '--out', tempOut, '--validFrom', validFrom], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    return { parserScript, ok: false, error: result.stderr || result.stdout || 'unknown parser error' };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(tempOut, 'utf8'));
    const quality = summarizeQuality(parsed);
    const score = scoreTimetable(parsed);
    return { parserScript, ok: true, score, quality, parsed, tempOut };
  } catch (err) {
    return { parserScript, ok: false, error: err.message, tempOut };
  }
}

function cleanupTempOutputs(results) {
  for (const r of results) {
    if (r?.tempOut && fs.existsSync(r.tempOut)) {
      fs.rmSync(r.tempOut, { force: true });
    }
  }
}

function ensureMinimumQuality(best) {
  const q = best.quality;
  const minEntries = 80;
  const minCoverage = 20; // 7 Klassen * 5 Tage => max 35

  if (q.entries < minEntries) {
    throw new Error(`Timetable quality too low: only ${q.entries} entries (expected >= ${minEntries}).`);
  }
  if (q.classDayCoverage < minCoverage) {
    throw new Error(`Timetable coverage too low: ${q.classDayCoverage} class-day cells (expected >= ${minCoverage}).`);
  }
}

function writeOutputAtomically(targetPath, data) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function pruneOldPdfs(allFiles, keepCount, activePdf, dryRun) {
  const keepSafe = Number.isFinite(keepCount) && keepCount > 0 ? Math.floor(keepCount) : 1;
  const scheduleFiles = allFiles.filter(f => f.isLikelyPlan || f.full === activePdf);

  const sorted = scheduleFiles.slice().sort((a, b) => b.mtimeMs - a.mtimeMs);

  const keepSet = new Set([activePdf]);
  for (const file of sorted) {
    if (keepSet.size >= keepSafe) break;
    keepSet.add(file.full);
  }

  const toDelete = sorted.filter(f => !keepSet.has(f.full));

  for (const file of toDelete) {
    if (dryRun) {
      console.log(`[dry-run] remove old PDF: ${file.full}`);
    } else {
      fs.rmSync(file.full, { force: true });
      console.log(`Removed old PDF: ${file.full}`);
    }
  }

  return toDelete.length;
}

function main() {
  const inputPdf = argValue('--input');
  const dryRun = process.argv.includes('--dry-run');
  const keep = Number(argValue('--keep') || 1);

  let selectedPdf = inputPdf;
  const allPdfs = listPdfFiles(PLAN_DIR);

  if (!selectedPdf) {
    const chosen = pickLatestPdf(allPdfs);
    if (!chosen) {
      console.error(`No PDF found in ${PLAN_DIR}/`);
      process.exit(1);
    }
    selectedPdf = chosen.full;
  }

  if (!fs.existsSync(selectedPdf)) {
    console.error(`Input PDF not found: ${selectedPdf}`);
    process.exit(1);
  }

  console.log(`Using PDF: ${selectedPdf}`);

  const parserResults = PARSER_CANDIDATES.map(p => runParser(p, selectedPdf));
  const successful = parserResults.filter(r => r.ok);

  if (!successful.length) {
    cleanupTempOutputs(parserResults);
    console.error('All parser candidates failed:');
    for (const r of parserResults) {
      console.error(`- ${r.parserScript}: ${r.error}`);
    }
    process.exit(1);
  }

  successful.sort((a, b) => b.score - a.score);
  const best = successful[0];
  console.log(`Selected parser: ${best.parserScript} (score=${best.score.toFixed(2)})`);
  console.log(`Quality: entries=${best.quality.entries}, coverage=${best.quality.classDayCoverage}, teacher=${best.quality.withTeacher}, rooms=${best.quality.withRoom}`);

  try {
    ensureMinimumQuality(best);
  } catch (err) {
    cleanupTempOutputs(parserResults);
    console.error(`Rejected parsed result: ${err.message}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`[dry-run] would write ${OUTPUT_JSON}`);
  } else {
    writeOutputAtomically(OUTPUT_JSON, best.parsed);
    console.log(`Wrote ${OUTPUT_JSON}`);
  }

  cleanupTempOutputs(parserResults);

  if (allPdfs.length > 1) {
    const removed = pruneOldPdfs(allPdfs, keep, selectedPdf, dryRun);
    if (!removed) console.log('No old PDFs to remove.');
  } else {
    console.log('No old PDFs to remove.');
  }
}

main();
