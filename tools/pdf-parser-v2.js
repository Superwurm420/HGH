#!/usr/bin/env node
/**
 * HGH Stundenplan PDF → JSON Parser (v2.0)
 * 
 * Versteht die Tabellen-Struktur und extrahiert:
 * - 7 Klassen (HT11, HT12, HT21, HT22, G11, G21, GT01)
 * - 5 Tage (Mo, Di, Mi, Do, Fr)
 * - Fächer, Lehrkräfte, Räume
 * 
 * Usage:
 *   node tools/pdf-parser.js <input.pdf> [--out data/timetable.json] [--validFrom 2026-01-19] [--debug]
 */

import fs from 'node:fs';
import path from 'node:path';

// --- Argument Parsing ---
function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

const input = process.argv[2];
const outPath = argValue('--out') || 'data/timetable.json';
const validFrom = argValue('--validFrom') || new Date().toISOString().split('T')[0];
const DEBUG = process.argv.includes('--debug');

if (!input) {
  console.error('❌ Missing input PDF');
  console.error('Usage: node tools/pdf-parser.js <input.pdf> [--out data/timetable.json] [--validFrom YYYY-MM-DD] [--debug]');
  process.exit(1);
}

// --- Config ---
const CLASSES = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];
const DAYS = [
  { id: 'mo', label: 'MO', fullName: 'Montag' },
  { id: 'di', label: 'DI', fullName: 'Dienstag' },
  { id: 'mi', label: 'MI', fullName: 'Mittwoch' },
  { id: 'do', label: 'DO', fullName: 'Donnerstag' },
  { id: 'fr', label: 'FR', fullName: 'Freitag' }
];

const TIMESLOTS = [
  { id: '1', time: '08:00–08:45' },
  { id: '2', time: '08:45–09:30' },
  { id: '3', time: '09:50–10:35' },
  { id: '4', time: '10:35–11:20' },
  { id: '5', time: '11:40–12:25' },
  { id: '6', time: '12:25–13:10' },
  { id: '7', time: 'Mittagspause' },
  { id: '8', time: '14:10–14:55' },
  { id: '9', time: '14:55–15:40' },
  { id: '10', time: '15:45–16:30' }
];

// Bekannte Lehrkräfte (für bessere Erkennung)
const KNOWN_TEACHERS = [
  'STE', 'WED', 'STI', 'BÜ', 'HOFF', 'GRO', 'TAM', 'WEN', 'MEL', 
  'WEZ', 'HOG', 'BER', 'STE/WEN', 'WEZ/BER', 'STI/WEZ'
];

// --- Helper Functions ---
function log(...args) {
  if (DEBUG) console.log('[DEBUG]', ...args);
}

function isTeacherToken(token) {
  // Lehrkräfte: 2-4 Großbuchstaben, optional mit /
  if (KNOWN_TEACHERS.includes(token)) return true;
  return /^[A-ZÄÖÜ]{2,4}(\/[A-ZÄÖÜ]{2,4})?$/.test(token);
}

function isRoomToken(token) {
  // Räume: Nur Ziffern oder Buchstabe+Ziffern
  return /^([A-Z]?\d{1,3}|T\d|BS|HS|USF)$/.test(token);
}

function isNotAvailable(token) {
  return token === '#NV' || token === '#N/A' || token === 'n.v.';
}

function cleanToken(token) {
  return token
    .replace(/[(),;]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- PDF Text Extraction ---
async function extractText(pdfPath) {
  let PDFParse;
  try {
    const mod = await import('pdf-parse');
    PDFParse = mod.PDFParse || mod.default;
  } catch {
    throw new Error('❌ Dependency missing: pdf-parse\nInstall with: npm install pdf-parse');
  }

  if (typeof PDFParse !== 'function') {
    throw new Error('pdf-parse module could not be loaded correctly. Check version compatibility.');
  }

  const buf = fs.readFileSync(pdfPath);
  const uint8 = new Uint8Array(buf);
  const pdf = new PDFParse(uint8, {});
  const result = await pdf.getText();
  return result.pages.map(p => p.text).join('\n') || '';
}

// --- Advanced PDF Parsing (layout-aware) ---
async function extractWithLayout(pdfPath) {
  // pdf-parse v2 does not support custom page renderers.
  // Use basic getText() which already preserves line structure.
  try {
    return await extractText(pdfPath);
  } catch (err) {
    log('Layout extraction failed, falling back to basic extraction:', err.message);
    return null;
  }
}

// --- Table Structure Parser ---
function parseTableStructure(text) {
  log('Starting table structure parsing...');
  
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const result = buildEmptyStructure();
  
  let currentDay = null;
  let currentSlot = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Tag-Erkennung (MO, DI, MI, DO, FR)
    const dayMatch = DAYS.find(d => 
      line.includes(d.label) || 
      line.toUpperCase().includes(d.label) ||
      line.includes(d.fullName)
    );
    
    if (dayMatch) {
      currentDay = dayMatch.id;
      log(`Found day: ${dayMatch.label} (${currentDay})`);
      continue;
    }
    
    // Slot-Erkennung (1., 2., 3., ...)
    const slotMatch = line.match(/^(\d{1,2})\./);
    if (slotMatch) {
      currentSlot = slotMatch[1];
      log(`Found slot: ${currentSlot}`);
      
      // Nächste Zeile(n) nach Slot-Nummer enthalten die Daten
      if (currentDay && currentSlot) {
        const dataLines = extractSlotData(lines, i);
        parseSlotData(result, currentDay, currentSlot, dataLines);
      }
    }
  }
  
  return result;
}

function extractSlotData(lines, startIndex) {
  const data = [];
  
  // Die nächsten 2-3 Zeilen nach der Slot-Nummer enthalten die Daten
  for (let i = startIndex + 1; i < Math.min(startIndex + 4, lines.length); i++) {
    const line = lines[i].trim();
    
    // Stop bei nächstem Slot oder Tag
    if (line.match(/^\d{1,2}\./) || DAYS.some(d => line.includes(d.label))) {
      break;
    }
    
    if (line.length > 0) {
      data.push(line);
    }
  }
  
  return data;
}

function parseSlotData(result, dayId, slotId, dataLines) {
  if (dataLines.length === 0) return;
  
  log(`Parsing slot ${slotId} for day ${dayId}:`, dataLines);
  
  // Zeile 1: Fächer für alle Klassen
  // Zeile 2: Lehrkräfte für alle Klassen
  const subjectsLine = dataLines[0] || '';
  const teachersLine = dataLines[1] || '';
  
  // Splitte nach Klassen (7 Spalten)
  const subjects = splitIntoColumns(subjectsLine, CLASSES.length);
  const teachers = splitIntoColumns(teachersLine, CLASSES.length);
  
  CLASSES.forEach((classId, index) => {
    const subject = cleanSubject(subjects[index]);
    const teacher = cleanTeacher(teachers[index]);
    const room = extractRoom(subjects[index] + ' ' + teachers[index]);
    
    // Nur hinzufügen wenn Daten vorhanden
    if (subject || teacher || room) {
      result[classId][dayId].push({
        slotId,
        subject: subject || null,
        teacher: teacher || null,
        room: room || null
      });
      
      log(`  ${classId}: ${subject} (${teacher}) [${room}]`);
    }
  });
}

function splitIntoColumns(line, numColumns) {
  // Versuche den Text in numColumns Spalten zu splitten
  const tokens = line.split(/\s+/).filter(Boolean);
  const columns = [];
  const tokensPerColumn = Math.ceil(tokens.length / numColumns);
  
  for (let i = 0; i < numColumns; i++) {
    const start = i * tokensPerColumn;
    const end = Math.min((i + 1) * tokensPerColumn, tokens.length);
    columns.push(tokens.slice(start, end).join(' '));
  }
  
  return columns;
}

function cleanSubject(text) {
  if (!text) return null;
  
  text = cleanToken(text);
  
  // Entferne Lehrkräfte und Räume aus Subject
  const tokens = text.split(/\s+/);
  const subjectTokens = tokens.filter(t => 
    !isTeacherToken(t) && 
    !isRoomToken(t) &&
    !isNotAvailable(t)
  );
  
  const subject = subjectTokens.join(' ').trim();
  return subject.length > 0 ? subject : null;
}

function cleanTeacher(text) {
  if (!text) return null;
  
  text = cleanToken(text);
  
  // Extrahiere Lehrkraft-Token
  const tokens = text.split(/\s+/);
  const teacherToken = tokens.find(t => isTeacherToken(t));
  
  if (teacherToken && !isNotAvailable(teacherToken)) {
    return teacherToken;
  }
  
  return null;
}

function extractRoom(text) {
  if (!text) return null;
  
  const tokens = text.split(/\s+/);
  const roomToken = tokens.find(t => isRoomToken(t));
  
  return roomToken || null;
}

// --- Pattern-based Fallback Parser ---
function parseWithPatterns(text) {
  log('Using pattern-based fallback parser...');
  
  const result = buildEmptyStructure();
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Suche nach bekannten Mustern
  for (const line of lines) {
    // Beispiel: "1. 8.00 - 8.45 Fertigungstechnik W1/W2 ... GRO ..."
    const tokens = line.split(/\s+/);
    
    // Finde Lehrkräfte
    const teachers = tokens.filter(t => isTeacherToken(cleanToken(t)));
    
    // Finde Räume
    const rooms = tokens.filter(t => isRoomToken(cleanToken(t)));
    
    log(`Line tokens: teachers=${teachers.length}, rooms=${rooms.length}`);
  }
  
  return result;
}

// --- Empty Structure Builder ---
function buildEmptyStructure() {
  const classes = {};
  
  for (const classId of CLASSES) {
    classes[classId] = {};
    for (const day of DAYS) {
      classes[classId][day.id] = [];
    }
  }
  
  return classes;
}

// --- Statistics ---
function generateStatistics(classes) {
  const stats = {
    totalEntries: 0,
    entriesPerClass: {},
    teachersFound: new Set(),
    roomsFound: new Set(),
    subjectsFound: new Set()
  };
  
  for (const classId of CLASSES) {
    let count = 0;
    
    for (const day of DAYS) {
      const entries = classes[classId][day.id] || [];
      count += entries.length;
      stats.totalEntries += entries.length;
      
      entries.forEach(entry => {
        if (entry.teacher) stats.teachersFound.add(entry.teacher);
        if (entry.room) stats.roomsFound.add(entry.room);
        if (entry.subject) stats.subjectsFound.add(entry.subject);
      });
    }
    
    stats.entriesPerClass[classId] = count;
  }
  
  return {
    totalEntries: stats.totalEntries,
    entriesPerClass: stats.entriesPerClass,
    teachersFound: Array.from(stats.teachersFound).sort(),
    roomsFound: Array.from(stats.roomsFound).sort(),
    subjectsFound: Array.from(stats.subjectsFound).sort().slice(0, 20)
  };
}

// --- Main ---
(async () => {
  try {
    console.log('🔍 HGH Stundenplan Parser v2.0');
    console.log('📄 Input:', path.basename(input));
    console.log('');
    
    // Extract text with layout if possible
    let text = await extractWithLayout(input);
    if (!text) {
      text = await extractText(input);
    }
    
    if (DEBUG) {
      fs.writeFileSync('debug-extracted-text.txt', text, 'utf8');
      console.log('📝 Extracted text saved to: debug-extracted-text.txt');
    }
    
    // Parse table structure
    let classes = parseTableStructure(text);
    
    // Fallback to pattern-based if empty
    const stats = generateStatistics(classes);
    if (stats.totalEntries === 0) {
      console.log('⚠️  Table parser found no data, trying pattern-based fallback...');
      classes = parseWithPatterns(text);
    }
    
    // Build final structure
    const data = {
      meta: {
        school: 'HGH',
        validFrom,
        updatedAt: new Date().toISOString(),
        source: path.basename(input),
        parser: 'v2.0',
        statistics: generateStatistics(classes)
      },
      timeslots: TIMESLOTS,
      classes
    };
    
    // Write output
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    
    console.log('✅ Success!');
    console.log('📊 Statistics:');
    console.log(`   Total entries: ${stats.totalEntries}`);
    console.log(`   Teachers found: ${stats.teachersFound.length}`);
    console.log(`   Rooms found: ${stats.roomsFound.length}`);
    console.log(`   Subjects found: ${stats.subjectsFound.length}`);
    console.log('');
    console.log('📁 Output:', outPath);
    
    if (stats.totalEntries === 0) {
      console.log('');
      console.log('⚠️  WARNING: No entries were extracted!');
      console.log('   Try running with --debug flag to see extracted text:');
      console.log(`   node ${process.argv[1]} ${input} --debug`);
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (DEBUG) {
      console.error(err);
    }
    process.exit(1);
  }
})();
