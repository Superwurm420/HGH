#!/usr/bin/env node
/**
 * Automatische Stundenplan-Pipeline:
 * - erkennt die zuletzt hochgeladene Plan-PDF in /plan (oder --input)
 * - probiert mehrere Parser und nimmt das beste Ergebnis
 * - validiert das Ergebnis (Mindestqualität)
 * - schreibt data/timetable.json atomar
 * - entfernt alte Stundenplan-PDF-Dateien (keep=1 standard)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractTimetablePdfDates } from './pdf-date-metadata.js';

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

function extractSchoolYearHint(fileName) {
  const m = normalizeName(fileName).match(/(?:hj|sj)?[_\s-]?([0-9]{4})[_\s-]([0-9]{2,4})/);
  if (!m) return null;

  const startYear = Number(m[1]);
  const endRaw = Number(m[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endRaw)) return null;

  const normalizedEnd = endRaw < 100 ? Math.floor(startYear / 100) * 100 + endRaw : endRaw;
  return Number.isFinite(normalizedEnd) ? startYear * 10000 + normalizedEnd : null;
}

async function listPdfFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir)
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        full,
        mtimeMs: stat.mtimeMs,
        weekHint: extractWeekHint(name),
        schoolYearHint: extractSchoolYearHint(name),
        isLikelyPlan: hasScheduleKeyword(name)
      };
    });

  const enriched = await Promise.all(files.map(async (file) => {
    try {
      const meta = await extractTimetablePdfDates(file.full);
      return {
        ...file,
        validFrom: meta.validFrom,
        updatedDate: meta.updatedDate
      };
    } catch {
      return file;
    }
  }));

  enriched.sort(comparePlanRecency);
  return enriched;
}

function dateNum(dateStr) {
  if (!dateStr) return -1;
  const t = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(t) ? t : -1;
}


function comparePlanRecency(a, b) {
  const validCmp = dateNum(b.validFrom) - dateNum(a.validFrom);
  if (validCmp !== 0) return validCmp;

  const updatedCmp = dateNum(b.updatedDate) - dateNum(a.updatedDate);
  if (updatedCmp !== 0) return updatedCmp;

  const schoolYearCmp = (b.schoolYearHint || -1) - (a.schoolYearHint || -1);
  if (schoolYearCmp !== 0) return schoolYearCmp;

  const weekCmp = (b.weekHint || -1) - (a.weekHint || -1);
  if (weekCmp !== 0) return weekCmp;

  const mtimeCmp = b.mtimeMs - a.mtimeMs;
  if (mtimeCmp !== 0) return mtimeCmp;

  return b.name.localeCompare(a.name, 'de');
}

function pickLatestPdf(files) {
  if (!files.length) return null;
  const planCandidates = files.filter(f => f.isLikelyPlan);
  if (!planCandidates.length) return files[0];

  planCandidates.sort(comparePlanRecency);

  return planCandidates[0];
}

function summarizeQuality(data) {
  const summary = {
    entries: 0,
    withTeacher: 0,
    withRoom: 0,
    specials: 0,
    classDayCoverage: 0,
    validClassCount: 0,
    entriesByClass: {},
    dayCoverageByClass: {}
  };

  if (!data || typeof data !== 'object' || typeof data.classes !== 'object') return summary;

  for (const classId of CLASS_IDS) {
    const cls = data.classes[classId];
    if (!cls || typeof cls !== 'object') continue;

    summary.validClassCount += 1;
    let classEntries = 0;
    let classCoverage = 0;

    for (const dayId of DAY_IDS) {
      const dayRows = Array.isArray(cls[dayId]) ? cls[dayId] : [];
      if (dayRows.length > 0) {
        summary.classDayCoverage += 1;
        classCoverage += 1;
      }

      for (const row of dayRows) {
        summary.entries += 1;
        classEntries += 1;
        if (row?.teacher) summary.withTeacher += 1;
        if (row?.room) summary.withRoom += 1;
        if (row?.note) summary.specials += 1;
      }
    }

    summary.entriesByClass[classId] = classEntries;
    summary.dayCoverageByClass[classId] = classCoverage;
  }

  return summary;
}

function calculateMedian(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function imbalancePenalty(quality) {
  const counts = Object.values(quality.entriesByClass || {});
  if (!counts.length) return 0;

  const median = calculateMedian(counts);
  if (median <= 0) return 0;

  let penalty = 0;
  for (const count of counts) {
    if (count >= median * 0.5) continue;
    penalty += (median * 0.5 - count) * 1.5;
  }
  return penalty;
}

function scoreTimetable(data) {
  const q = summarizeQuality(data);
  if (q.entries === 0 || q.validClassCount === 0) return -1;

  const imbalance = imbalancePenalty(q);
  return (
    q.entries +
    q.withTeacher * 0.5 +
    q.withRoom * 0.25 +
    q.specials * 0.2 +
    q.classDayCoverage * 2 -
    imbalance
  );
}

function countWarnings(output) {
  if (!output) return 0;
  const lines = String(output)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  let count = 0;
  for (const line of lines) {
    if (!/^warning:/i.test(line)) continue;
    if (/^warning:\s*tt:\s*undefined function:/i.test(line)) continue;
    count += 1;
  }

  return count;
}

function runParser(parserScript, inputPdf, validFrom) {
  const tempOut = path.join('data', `.tmp-${path.basename(parserScript, '.js')}.json`);
  const parserValidFrom = validFrom || new Date().toISOString().split('T')[0];
  const result = spawnSync(process.execPath, [parserScript, inputPdf, '--out', tempOut, '--validFrom', parserValidFrom], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    return { parserScript, ok: false, error: result.stderr || result.stdout || 'unknown parser error', tempOut };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(tempOut, 'utf8'));
    const quality = summarizeQuality(parsed);
    const warningCount = countWarnings(`${result.stderr || ''}\n${result.stdout || ''}`);
    const score = scoreTimetable(parsed) - warningCount * 0.5;
    return { parserScript, ok: true, score, quality, warningCount, parsed, tempOut };
  } catch (err) {
    return { parserScript, ok: false, error: err.message, tempOut };
  }
}

function cleanupTempOutputs(results) {
  for (const r of results) {
    if (!r?.tempOut) continue;
    if (!fs.existsSync(r.tempOut)) continue;
    fs.rmSync(r.tempOut, { force: true });
  }
}

function ensureMinimumQuality(best) {
  const q = best.quality;
  const minEntries = 80;
  const minCoverage = 20;
  const minClassCoverage = 2;

  if (q.entries < minEntries) {
    throw new Error(`Timetable quality too low: only ${q.entries} entries (expected >= ${minEntries}).`);
  }
  if (q.classDayCoverage < minCoverage) {
    throw new Error(`Timetable coverage too low: ${q.classDayCoverage} class-day cells (expected >= ${minCoverage}).`);
  }

  const classCounts = Object.values(q.entriesByClass || {});
  if (classCounts.length) {
    const median = calculateMedian(classCounts);
    const minExpected = Math.max(8, Math.floor(median * 0.35));
    for (const [classId, count] of Object.entries(q.entriesByClass)) {
      if (count < minExpected) {
        throw new Error(`Class ${classId} has suspiciously few entries (${count}; expected >= ${minExpected}).`);
      }
    }
  }

  for (const [classId, coverage] of Object.entries(q.dayCoverageByClass || {})) {
    if (coverage < minClassCoverage) {
      throw new Error(`Class ${classId} has too little day coverage (${coverage}; expected >= ${minClassCoverage}).`);
    }
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
  const sorted = scheduleFiles.slice().sort(comparePlanRecency);

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

async function main() {
  const inputPdf = argValue('--input');
  const dryRun = process.argv.includes('--dry-run');
  const keep = Number(argValue('--keep') || 1);

  let selectedPdf = inputPdf;
  const allPdfs = await listPdfFiles(PLAN_DIR);

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

  let selectedMeta = allPdfs.find(f => f.full === selectedPdf);
  if (!selectedMeta) {
    try {
      const meta = await extractTimetablePdfDates(selectedPdf);
      selectedMeta = { full: selectedPdf, validFrom: meta.validFrom, updatedDate: meta.updatedDate };
    } catch {
      selectedMeta = { full: selectedPdf };
    }
  }

  const effectiveValidFrom = selectedMeta?.validFrom || new Date().toISOString().split('T')[0];

  console.log(`Using PDF: ${selectedPdf}`);
  if (selectedMeta?.validFrom || selectedMeta?.updatedDate) {
    console.log(`Detected PDF dates: validFrom=${selectedMeta?.validFrom || 'n/a'}, updated=${selectedMeta?.updatedDate || 'n/a'}`);
  }

  const parserResults = PARSER_CANDIDATES.map(p => runParser(p, selectedPdf, effectiveValidFrom));
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
  console.log(`Quality: entries=${best.quality.entries}, coverage=${best.quality.classDayCoverage}, teacher=${best.quality.withTeacher}, rooms=${best.quality.withRoom}, warnings=${best.warningCount || 0}`);

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

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
