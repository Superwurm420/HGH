#!/usr/bin/env node
/**
 * Automatische Stundenplan-Pipeline:
 * - erkennt neueste PDF in /plan (oder --input)
 * - probiert mehrere Parser und nimmt das beste Ergebnis
 * - schreibt data/timetable.json
 * - entfernt alte PDF-Dateien (keep=1 standard)
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

function listPdfFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, full, mtimeMs: stat.mtimeMs, isLikelyPlan: hasScheduleKeyword(name) };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pickLatestPdf(files) {
  if (!files.length) return null;
  const preferred = files.find(f => f.isLikelyPlan);
  return preferred || files[0];
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
    const score = scoreTimetable(parsed);
    return { parserScript, ok: true, score, parsed, tempOut };
  } catch (err) {
    return { parserScript, ok: false, error: err.message };
  }
}

function scoreTimetable(data) {
  if (!data || typeof data !== 'object' || typeof data.classes !== 'object') return -1;

  let entries = 0;
  let withTeacher = 0;
  let withRoom = 0;
  let specials = 0;
  for (const cls of Object.values(data.classes)) {
    for (const day of Object.values(cls || {})) {
      for (const row of day || []) {
        entries += 1;
        if (row.teacher) withTeacher += 1;
        if (row.room) withRoom += 1;
        if (row.note) specials += 1;
      }
    }
  }

  if (entries === 0) return 0;

  // Höhere Punkte für dichte, vollständige Daten + erkannte Sonderfälle.
  return entries + withTeacher * 0.5 + withRoom * 0.25 + specials * 0.2;
}

function cleanupTempOutputs(results) {
  for (const r of results) {
    if (r?.tempOut && fs.existsSync(r.tempOut)) {
      fs.rmSync(r.tempOut, { force: true });
    }
  }
}

function pruneOldPdfs(allFiles, keepCount, activePdf, dryRun) {
  const toDelete = allFiles
    .filter(f => f.full !== activePdf)
    .slice(Math.max(0, keepCount - 1));

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

  if (dryRun) {
    console.log(`[dry-run] would write ${OUTPUT_JSON}`);
  } else {
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(best.parsed, null, 2) + '\n', 'utf8');
    console.log(`Wrote ${OUTPUT_JSON}`);
  }

  cleanupTempOutputs(parserResults);

  if (allPdfs.length > 1) {
    const removed = pruneOldPdfs(allPdfs, Number.isFinite(keep) && keep > 0 ? keep : 1, selectedPdf, dryRun);
    if (!removed) console.log('No old PDFs to remove.');
  } else {
    console.log('No old PDFs to remove.');
  }
}

main();
