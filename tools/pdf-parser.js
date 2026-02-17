#!/usr/bin/env node
/**
 * PDF → timetable.json generator (HGH)
 *
 * Usage:
 *   node tools/pdf-parser.js <input.pdf> [--out data/timetable.json] [--validFrom 2026-01-19]
 *
 * Notes:
 * - This is a *best effort* parser scaffold. PDFs differ wildly.
 * - It tries to extract text and then recognize tokens:
 *   - teacher abbreviations: 2–4 letters (incl. umlauts), e.g. STI, WED, BÜ, MEL, HOG
 *   - subjects: longer words or phrases (Deutsch, Mathematik, Modul ...)
 */

import fs from 'node:fs';
import path from 'node:path';

function argValue(flag){
  const idx = process.argv.indexOf(flag);
  if(idx === -1) return null;
  return process.argv[idx+1] ?? null;
}

const input = process.argv[2];
const outPath = argValue('--out') || 'data/timetable.json';
const validFrom = argValue('--validFrom') || null;

if(!input){
  console.error('Missing input PDF. Usage: node tools/pdf-parser.js <input.pdf> [--out data/timetable.json]');
  process.exit(1);
}

async function extractText(pdfPath){
  // Lazy import: pdf-parse is common in Node.
  // If not installed, give a helpful error.
  let PDFParse;
  try{
    const mod = await import('pdf-parse');
    PDFParse = mod.PDFParse || mod.default;
  } catch {
    throw new Error('Dependency missing: pdf-parse. Install with: npm i -D pdf-parse');
  }

  const buf = fs.readFileSync(pdfPath);
  const data = new Uint8Array(buf);
  const parser = new PDFParse(data);
  const result = await parser.getText();
  return result.text || '';
}

function isTeacherToken(tok){
  // 2–4 letters, allow umlauts/ß. Examples: BÜ, STI, HOG
  return /^[A-ZÄÖÜẞ]{2,4}$/.test(tok);
}

function normalizeSpace(s){
  return s.replace(/\s+/g,' ').trim();
}

function guessRoomToken(tok){
  // Simple room heuristic: digits or patterns like R101, 6, A12
  return /^(?:[A-Z]\d{1,3}|\d{1,3})$/.test(tok);
}

function buildEmptyStructure(){
  const classes = ['HT11','HT12','HT21','HT22','G11','G21','GT01'];
  const days = ['mo','di','mi','do','fr'];
  const res = {};
  for(const c of classes){
    res[c] = {};
    for(const d of days) res[c][d] = [];
  }
  return res;
}

function parseToTimetable(text){
  // Scaffold parser:
  // We only create an empty structure and embed extracted text in meta for debugging.
  // A real implementation would need the PDF layout rules (class/day headings, slots).
  const classes = buildEmptyStructure();

  const tokens = normalizeSpace(text)
    .split(' ')
    .map(t => t.replace(/[(),;]+/g,'').trim())
    .filter(Boolean);

  const teachers = new Set();
  const rooms = new Set();
  const subjects = new Set();

  for(const t of tokens){
    if(isTeacherToken(t)) teachers.add(t);
    else if(guessRoomToken(t)) rooms.add(t);
    else if(t.length >= 5 && /^[A-Za-zÄÖÜäöüß]/.test(t)) subjects.add(t);
  }

  return {
    meta: {
      school: 'HGH',
      validFrom,
      updatedAt: new Date().toISOString(),
      source: path.basename(input),
      hints: {
        teachersDetected: Array.from(teachers).slice(0,50),
        roomsDetected: Array.from(rooms).slice(0,50),
        subjectsDetected: Array.from(subjects).slice(0,50)
      }
    },
    timeslots: [
      { id: '1', time: '08:00–08:45' },
      { id: '2', time: '08:45–09:30' },
      { id: '3', time: '09:50–10:35' },
      { id: '4', time: '10:35–11:20' },
      { id: '5', time: '11:40–12:25' },
      { id: '6', time: '12:25–13:10' },
      { id: '7', time: 'Mittagspause' },
      { id: '8', time: '14:10–14:55' },
      { id: '9', time: '14:55–15:40' }
    ],
    classes
  };
}

(async () => {
  const text = await extractText(input);
  const data = parseToTimetable(text);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${outPath}`);
})();
