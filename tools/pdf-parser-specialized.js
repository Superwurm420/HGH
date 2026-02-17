#!/usr/bin/env node
/**
 * HGH Stundenplan PDF Parser v2 – Positionsbasiert via pdfjs-dist
 *
 * Nutzt X/Y-Koordinaten der PDF-Textitems, um die Tabellenstruktur
 * exakt zu rekonstruieren (Fach, Lehrer, Raum pro Klasse und Slot).
 *
 * Usage:
 *   node tools/pdf-parser-specialized.js <input.pdf> [options]
 *
 * Options:
 *   --out <path>         Output JSON file (default: data/timetable.json)
 *   --validFrom <date>   Valid from date (default: today)
 *   --debug              Show debug output
 */

import fs from 'node:fs';
import path from 'node:path';

// === Configuration ===
const CONFIG = {
  classes: ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'],
  days: ['MO', 'DI', 'MI', 'DO', 'FR'],
  dayMapping: { 'MO': 'mo', 'DI': 'di', 'MI': 'mi', 'DO': 'do', 'FR': 'fr' },
  timeslots: [
    { id: '1', time: '08:00–08:45' },
    { id: '2', time: '08:45–09:30' },
    { id: '3', time: '09:50–10:35' },
    { id: '4', time: '10:35–11:20' },
    { id: '5', time: '11:40–12:25' },
    { id: '6', time: '12:25–13:10' },
    { id: '7', time: '14:10–14:55' },
    { id: '8', time: '14:55–15:40' },
    { id: '9', time: '15:45–16:30' },
    { id: '10', time: '16:30–17:15' }
  ],
  // Slot-Nummern, die Fächer tragen (ungerade = Fach-Zeile der Doppelstunde)
  subjectSlots: ['1', '3', '5', '7', '9'],
  // Slot-Nummern, die Lehrer tragen (gerade = Lehrer-Zeile der Doppelstunde)
  teacherSlots: ['2', '4', '6', '8', '10'],
  knownTeachers: [
    'STE', 'WED', 'STI', 'BÜ', 'HOFF', 'GRO', 'TAM',
    'WEN', 'MEL', 'WEZ', 'HOG', 'BER', 'PET'
  ]
};

// === Argument Parsing ===
const args = {
  input: process.argv[2],
  out: getArg('--out') || 'data/timetable.json',
  validFrom: getArg('--validFrom') || new Date().toISOString().split('T')[0],
  debug: process.argv.includes('--debug')
};

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

if (!args.input) {
  console.error('Usage: node pdf-parser-specialized.js <input.pdf> [options]');
  process.exit(1);
}

// === Logging ===
function log(...msgs) {
  if (args.debug) console.log('[DEBUG]', ...msgs);
}

// === PDF Extraction via pdfjs-dist ===
async function extractPdfItems(pdfPath) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const buffer = fs.readFileSync(pdfPath);
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const items = content.items
    .filter(i => i.str?.trim())
    .map(i => ({
      text: i.str.trim(),
      x: Math.round(i.transform[4]),
      y: Math.round(i.transform[5]),
    }));

  await doc.destroy();
  return items;
}

// === Column Detection ===
// Die Tabellenstruktur ist: [Fach-Spalte][Raum-Spalte] pro Klasse.
// Die Raum-Spalte ("R"-Header) markiert die Grenze: Items LINKS davon = Fach/Lehrer,
// Items AM R-Header (±8px) = Raumnummer, Items RECHTS = nächste Klasse.
const ROOM_HALF_WIDTH = 8;

function detectColumns(items) {
  const classPositions = {};
  for (const cls of CONFIG.classes) {
    const match = items.find(i =>
      i.text === cls || (i.text === 'GT 01' && cls === 'GT01')
    );
    if (match) classPositions[cls] = match.x;
  }

  log('Class header positions:', classPositions);

  const tagItem = items.find(i => i.text === 'TAG');
  if (!tagItem) throw new Error('TAG header not found');

  const roomHeaders = items
    .filter(i => i.text === 'R' && Math.abs(i.y - tagItem.y) < 3)
    .sort((a, b) => a.x - b.x);

  log('Room header positions:', roomHeaders.map(r => r.x));

  const sortedClasses = CONFIG.classes
    .filter(c => classPositions[c] !== undefined)
    .sort((a, b) => classPositions[a] - classPositions[b]);

  if (roomHeaders.length !== sortedClasses.length) {
    console.warn(`Warning: ${roomHeaders.length} room headers for ${sortedClasses.length} classes`);
  }

  const columns = [];
  for (let i = 0; i < sortedClasses.length; i++) {
    const cls = sortedClasses[i];
    const roomX = roomHeaders[i]?.x || classPositions[cls] + 60;
    const prevRoomX = i > 0 ? roomHeaders[i - 1].x : 77; // after time columns

    // Subject area: from after prev room to before this room
    const subjectMin = prevRoomX + ROOM_HALF_WIDTH;
    const subjectMax = roomX - ROOM_HALF_WIDTH;
    // Room area: ±ROOM_HALF_WIDTH around roomX
    const roomMin = roomX - ROOM_HALF_WIDTH;
    const roomMax = roomX + ROOM_HALF_WIDTH;

    columns.push({ classId: cls, subjectMin, subjectMax, roomX, roomMin, roomMax });
  }

  log('Columns:', columns.map(c =>
    `${c.classId}: subj=${c.subjectMin}-${c.subjectMax}, room=${c.roomMin}-${c.roomMax}`
  ));
  return columns;
}

// === Row Detection ===
// Gruppiert Items nach Y-Position (mit Toleranz)
function groupByRow(items, tolerance = 3) {
  const sorted = [...items].sort((a, b) => b.y - a.y); // top to bottom
  const rows = [];
  let currentRow = null;

  for (const item of sorted) {
    if (!currentRow || Math.abs(currentRow.y - item.y) > tolerance) {
      currentRow = { y: item.y, items: [] };
      rows.push(currentRow);
    }
    currentRow.items.push(item);
  }

  // Sort items within each row left to right
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }

  return rows;
}

// === Slot Detection ===
// Erkennt Zeilen die mit "1.", "2.", etc. beginnen
function isSlotRow(row) {
  const first = row.items[0];
  if (!first) return null;
  const match = first.text.match(/^(\d{1,2})\.$/);
  return match ? match[1] : null;
}

// === Day Detection ===
function isDayRow(row) {
  for (const item of row.items) {
    if (CONFIG.days.includes(item.text) && item.x < 30) {
      return item.text;
    }
  }
  return null;
}

// === Not Available Check ===
function isNA(text) {
  const t = text.toUpperCase().trim();
  return t === '#NV' || t === '#N/A' || t === 'N.V.';
}

// === Teacher Check ===
function isTeacher(text) {
  const t = text.trim();
  if (CONFIG.knownTeachers.includes(t)) return true;
  if (t.includes('/')) {
    return t.split('/').every(p =>
      CONFIG.knownTeachers.includes(p) || /^[A-ZÄÖÜ]{2,4}$/.test(p)
    );
  }
  return /^[A-ZÄÖÜ]{2,5}$/.test(t);
}

// === Main Parser ===
function parseItems(items, columns) {
  const rows = groupByRow(items);
  const result = buildEmptyStructure();

  let currentDay = null;

  for (const row of rows) {
    // Day markers can share a row with slot data (y within tolerance).
    // Don't skip the row, just note the day marker.
    isDayRow(row); // logged for debug

    // Detect slot row (first item must be "N.")
    // If day marker is on same row, the slot number may not be first item.
    // Check all items for a slot number pattern.
    let slotId = isSlotRow(row);
    if (!slotId) {
      // Maybe the slot number isn't the first item (day marker is first)
      const slotItem = row.items.find(i => /^\d{1,2}\.$/.test(i.text) && i.x >= 30 && i.x <= 45);
      if (slotItem) slotId = slotItem.text.replace('.', '');
    }
    if (!slotId) continue;

    // Track day transitions: slot "1" means next day
    if (slotId === '1') {
      currentDay = currentDay === null ? 0 : currentDay + 1;
      if (currentDay >= CONFIG.days.length) break;
      log(`=== Day ${CONFIG.days[currentDay]} ===`);
    }

    if (currentDay === null || currentDay >= CONFIG.days.length) continue;

    const dayId = CONFIG.dayMapping[CONFIG.days[currentDay]];

    // Subject line (1,3,5,7,9) or teacher line (2,4,6,8,10)?
    const isSubjectLine = CONFIG.subjectSlots.includes(slotId);
    // Paired slot for double lessons: 1+2→1, 3+4→3, etc.
    const pairedSlotId = isSubjectLine ? slotId : String(Number(slotId) - 1);

    // Data items (exclude slot number and time columns at x < 85)
    const dataItems = row.items.filter(i => i.x > 85);

    // Room row: separate Y-level ~3-5px below subject line with room numbers
    const roomRow = isSubjectLine ? findRoomRow(rows, row.y) : null;

    for (const col of columns) {
      // Subject/Teacher items: in this class's subject range
      const contentItems = dataItems.filter(i =>
        i.x >= col.subjectMin && i.x <= col.subjectMax
      );
      // Room items: near this class's room header
      const roomItems = roomRow
        ? roomRow.items.filter(i => i.x >= col.roomMin && i.x <= col.roomMax)
        : dataItems.filter(i => i.x >= col.roomMin && i.x <= col.roomMax);

      if (contentItems.length === 0 && roomItems.length === 0) continue;

      const text = contentItems.map(i => i.text).join(' ').trim();
      const roomText = roomItems.map(i => i.text).join('').trim();

      // Skip empty or #NV entries
      if ((!text || isNA(text)) && (!roomText || isNA(roomText))) continue;

      if (isSubjectLine) {
        result[col.classId][dayId].push({
          slotId: pairedSlotId,
          subject: (text && !isNA(text)) ? text : null,
          teacher: null,
          room: (roomText && !isNA(roomText)) ? roomText : null
        });
        log(`  ${col.classId} slot ${pairedSlotId}: subject="${text}" room="${roomText}"`);
      } else {
        // Teacher line: update existing entry from subject line
        const existing = result[col.classId][dayId].find(e => e.slotId === pairedSlotId);
        if (existing) {
          if (text && !isNA(text)) existing.teacher = text;
          if (roomText && !isNA(roomText) && !existing.room) existing.room = roomText;
        } else if (text && !isNA(text)) {
          result[col.classId][dayId].push({
            slotId: pairedSlotId,
            subject: null,
            teacher: text,
            room: (roomText && !isNA(roomText)) ? roomText : null
          });
        }
        log(`  ${col.classId} slot ${pairedSlotId}: teacher="${text}" room="${roomText}"`);
      }
    }
  }

  return result;
}

// Find room number rows (they sit 3-6px below subject lines)
function findRoomRow(allRows, subjectY) {
  return allRows.find(r =>
    r.y < subjectY && r.y > subjectY - 8 &&
    r.items.some(i => /^\d{1,2}$/.test(i.text) || /^(BS|USF|HS|\d\/\d)$/.test(i.text))
  );
}

function buildEmptyStructure() {
  const structure = {};
  for (const classId of CONFIG.classes) {
    structure[classId] = {};
    for (const day of CONFIG.days) {
      structure[classId][CONFIG.dayMapping[day]] = [];
    }
  }
  return structure;
}

// === Statistics ===
function generateStats(classes) {
  const stats = { totalEntries: 0, byClass: {}, teachers: new Set(), rooms: new Set(), subjects: new Set() };

  for (const classId of CONFIG.classes) {
    let count = 0;
    for (const dayId of Object.keys(classes[classId])) {
      const entries = classes[classId][dayId];
      count += entries.length;
      stats.totalEntries += entries.length;
      entries.forEach(e => {
        if (e.teacher) stats.teachers.add(e.teacher);
        if (e.room) stats.rooms.add(e.room);
        if (e.subject) stats.subjects.add(e.subject);
      });
    }
    stats.byClass[classId] = count;
  }

  return {
    totalEntries: stats.totalEntries,
    byClass: stats.byClass,
    teachers: Array.from(stats.teachers).sort(),
    rooms: Array.from(stats.rooms).sort(),
    subjects: Array.from(stats.subjects).sort()
  };
}

// === Main ===
(async () => {
  try {
    console.log(`HGH PDF Parser v2 - Position-based`);
    console.log(`Input: ${path.basename(args.input)}`);
    console.log('');

    // Extract positioned text items
    const items = await extractPdfItems(args.input);
    log(`Extracted ${items.length} text items from PDF`);

    // Detect column structure
    const columns = detectColumns(items);

    // Parse timetable
    const classes = parseItems(items, columns);

    // Generate statistics
    const stats = generateStats(classes);

    // Build output
    const output = {
      meta: {
        school: 'HGH',
        validFrom: args.validFrom,
        updatedAt: new Date().toISOString(),
        source: path.basename(args.input),
        parser: 'specialized-v2.0'
      },
      timeslots: CONFIG.timeslots,
      classes
    };

    // Write output
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf8');

    console.log('Parsing complete!');
    console.log('');
    console.log('Statistics:');
    console.log(`  Total entries: ${stats.totalEntries}`);
    console.log(`  Teachers: ${stats.teachers.length} (${stats.teachers.slice(0, 10).join(', ')}${stats.teachers.length > 10 ? '...' : ''})`);
    console.log(`  Rooms: ${stats.rooms.length} (${stats.rooms.join(', ')})`);
    console.log(`  Subjects: ${stats.subjects.length}`);
    console.log('');
    Object.entries(stats.byClass).forEach(([cls, count]) => {
      console.log(`  ${cls}: ${count} entries`);
    });
    console.log('');
    console.log(`Output: ${args.out}`);

    if (stats.totalEntries < 50) {
      console.log('');
      console.warn('WARNING: Low entry count! Parser may not have recognized the PDF correctly.');
      console.warn('Try running with --debug to inspect.');
    }

  } catch (err) {
    console.error('Parsing failed:', err.message);
    if (args.debug) console.error(err);
    process.exit(1);
  }
})();
