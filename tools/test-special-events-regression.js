#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const inputPdf = process.argv[2] || 'plan/Stundenplan_kw_45_Hj1_2025_26.pdf';
const outFile = '/tmp/hgh-special-regression.json';

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(inputPdf)) {
  fail(`Input PDF not found: ${inputPdf}`);
}

const run = spawnSync(process.execPath, ['tools/pdf-parser-specialized.js', inputPdf, '--out', outFile], {
  encoding: 'utf8'
});

if (run.status !== 0) {
  fail(`Parser run failed:\n${run.stderr || run.stdout}`);
}

const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));

function getNotes(classId, dayId) {
  return (data.classes?.[classId]?.[dayId] || []).filter(e => e.note).map(e => ({ slotId: String(e.slotId), note: e.note }));
}

function assertNotes(classId, dayId, expectedSlots, expectedLabel) {
  const notes = getNotes(classId, dayId)
    .filter(n => n.note === expectedLabel)
    .map(n => n.slotId)
    .sort((a, b) => Number(a) - Number(b));

  const expected = expectedSlots.map(String).sort((a, b) => Number(a) - Number(b));
  if (JSON.stringify(notes) !== JSON.stringify(expected)) {
    fail(`${classId} ${dayId} expected ${expectedLabel} in slots [${expected.join(', ')}], got [${notes.join(', ')}]`);
  }
}

function assertHT11HasSubjectData() {
  const all = ['mo', 'di', 'mi', 'do', 'fr'].flatMap(day => data.classes?.HT11?.[day] || []);
  const withSubject = all.filter(e => e.subject && e.subject !== '—').length;
  const withTeacher = all.filter(e => e.teacher).length;
  if (withSubject < 10 || withTeacher < 10) {
    fail(`HT11 seems regressed (withSubject=${withSubject}, withTeacher=${withTeacher})`);
  }
}

// Regression checks for known special events on KW45 plan.
assertNotes('G21', 'mo', ['3', '4', '5', '6'], 'BBS Nienburg – 9.50 - 13.10 Uhr');
assertNotes('GT01', 'mo', ['3', '4', '5', '6'], 'BBS Nienburg – 9.50 - 13.10 Uhr');
assertNotes('HT11', 'di', ['8', '9'], 'Serviceteam');
assertNotes('HT12', 'di', ['8', '9'], 'Serviceteam');
assertNotes('HT21', 'di', ['8', '9'], 'USF-Treffen');
assertNotes('HT22', 'di', ['8', '9'], 'USF-Treffen');
assertNotes('G21', 'di', ['8', '9'], 'Serviceteam');
assertNotes('GT01', 'di', ['8', '9'], 'Serviceteam');
assertHT11HasSubjectData();

console.log(`✅ Regression checks passed for ${path.basename(inputPdf)}`);
