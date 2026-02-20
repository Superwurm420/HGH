#!/usr/bin/env node
/**
 * HGH Stundenplan PDF Parser - Coordinate-based
 *
 * Uses pdfjs-dist to extract text items with x/y coordinates,
 * then maps items to the correct class columns using header positions.
 *
 * PDF Structure:
 * - 7 classes: HT11, HT12, HT21, HT22, G11, G21, GT01
 * - 5 days (MO–FR), each with 10 numbered rows in pairs:
 *     Odd rows  (1, 3, 5, 7, 9)  → Subject + Room
 *     Even rows (2, 4, 6, 8, 10) → Teacher
 * - Pairs form double lessons (Doppelstunden):
 *     Rows 1+2 → app slots 1,2
 *     Rows 3+4 → app slots 3,4
 *     Rows 5+6 → app slots 5,6
 *     Rows 7+8 → app slots 8,9  (after Mittagspause)
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
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// === Configuration ===
const CLASS_IDS = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];
const DAY_IDS = ['mo', 'di', 'mi', 'do', 'fr'];

const TIMESLOTS = [
  { id: '1', time: '08:00–08:45' },
  { id: '2', time: '08:45–09:30' },
  { id: '3', time: '09:50–10:35' },
  { id: '4', time: '10:35–11:20' },
  { id: '5', time: '11:40–12:25' },
  { id: '6', time: '12:25–13:10' },
  { id: '7', time: 'Mittagspause' },
  { id: '8', time: '14:10–14:55' },
  { id: '9', time: '14:55–15:40' }
];

// PDF row pair → app slot pair mapping
// PDF rows 1+2 = lesson 1 → app slots 1,2
// PDF rows 3+4 = lesson 2 → app slots 3,4
// PDF rows 5+6 = lesson 3 → app slots 5,6
// PDF rows 7+8 = lesson 4 → app slots 8,9 (after Mittagspause)
// PDF rows 9+10 = lesson 5 → (no app slot, usually empty)
const PAIR_TO_SLOTS = {
  '1': ['1', '2'],
  '3': ['3', '4'],
  '5': ['5', '6'],
  '7': ['8', '9']
};

// === Argument Parsing ===
function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : null;
}

const args = {
  input: process.argv[2],
  out: getArg('--out') || 'data/timetable.json',
  validFrom: getArg('--validFrom') || new Date().toISOString().split('T')[0],
  debug: process.argv.includes('--debug')
};

if (!args.input) {
  console.error('Usage: node tools/pdf-parser-specialized.js <input.pdf> [options]');
  process.exit(1);
}

// === Logging ===
function log(...msgs) { if (args.debug) console.log('[DEBUG]', ...msgs); }

function compactToken(s) {
  return String(s || '').replace(/\s+/g, '').toUpperCase();
}

function canonicalClassId(token) {
  const compact = compactToken(token);
  const aliases = {
    HT11: 'HT11',
    HT12: 'HT12',
    HT21: 'HT21',
    HT22: 'HT22',
    G11: 'G11',
    G21: 'G21',
    GT01: 'GT01',
    GT1: 'GT01'
  };
  return aliases[compact] || null;
}

// === PDF Item Extraction ===
async function extractItems(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map(it => ({
      str: String(it.str || '').replace(/\s+/g, ' ').trim(),
      x: it.transform[4],
      y: it.transform[5],
      width: typeof it.width === 'number' ? it.width : 0
    }))
    .filter(it => it.str);
}

// === Column Detection ===
function findColumns(items) {
  // Find class header positions from first header line.
  const classHeaderItems = items
    .map(it => ({ ...it, classId: canonicalClassId(it.str) }))
    .filter(it => it.classId)
    .sort((a, b) => b.y - a.y);

  const classHeaderY = classHeaderItems.length ? classHeaderItems[0].y : null;
  const headerClassX = {};
  if (classHeaderY != null) {
    for (const it of classHeaderItems) {
      if (Math.abs(it.y - classHeaderY) > 4) continue;
      // If duplicates exist, keep the leftmost occurrence.
      if (headerClassX[it.classId] == null || it.x < headerClassX[it.classId]) {
        headerClassX[it.classId] = it.x;
      }
    }
  }

  // Find R header positions (7 "R" items, typically on header line).
  const rItems = items.filter(it => it.str === 'R');
  const rTop = rItems.length ? Math.max(...rItems.map(it => it.y)) : null;
  const rXs = rItems
    .filter(it => rTop == null || Math.abs(it.y - rTop) <= 8)
    .map(it => it.x)
    .sort((a, b) => a - b);

  if (rXs.length < 7) {
    throw new Error(`Expected 7 R columns, found ${rXs.length}`);
  }

  // Column boundaries: each class column spans from left edge to its R column.
  // Wichtig: Die erste Spalte (HT11) startet je nach PDF teils deutlich weiter
  // links als x=150. Mit einem dynamischen Offset relativ zur ersten R-Markierung
  // vermeiden wir abgeschnittene Fach-/Lehrerwerte in HT11.
  const DATA_LEFT = Math.max(90, rXs[0] - 90);
  const DATA_RIGHT = rXs[6] + 50;

  // Build room anchors per class.
  // Preferred: assign nearest R to class header x.
  // Fallback: keep strict left-to-right order.
  const roomByClass = {};
  const unassignedRX = [...rXs];
  const haveAllHeaders = CLASS_IDS.every(id => headerClassX[id] != null);

  if (haveAllHeaders) {
    for (const classId of CLASS_IDS) {
      const cx = headerClassX[classId];
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let i = 0; i < unassignedRX.length; i++) {
        const dist = Math.abs(unassignedRX[i] - cx);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      roomByClass[classId] = unassignedRX[bestIdx];
      unassignedRX.splice(bestIdx, 1);
    }
  }

  if (Object.keys(roomByClass).length !== CLASS_IDS.length) {
    CLASS_IDS.forEach((id, i) => {
      roomByClass[id] = rXs[i];
    });
  }

  const roomSequence = CLASS_IDS.map(id => roomByClass[id]).sort((a, b) => a - b);
  const columns = CLASS_IDS.map((id) => {
    const roomX = roomByClass[id];
    const roomPos = roomSequence.indexOf(roomX);
    const leftBound = roomPos === 0 ? DATA_LEFT : roomSequence[roomPos - 1];
    const rightBound = roomX;
    return { id, leftBound, rightBound, roomX };
  });

  log('Columns detected:');
  columns.forEach(c => log(`  ${c.id}: subject x=[${Math.round(c.leftBound)}..${Math.round(c.rightBound)}], room x≈${Math.round(c.roomX)}`));

  return columns;
}

// === Day Block Detection ===
function findDayBlocks(items) {
  // Find all "1." slot markers — there should be 5, one per day
  const slot1Items = items
    .filter(it => /^(1\.|1)$/.test(it.str) && it.x < 100) // slot markers are at the left edge
    .sort((a, b) => b.y - a.y); // top to bottom (PDF y increases upward)

  if (slot1Items.length < 5) {
    throw new Error(`Expected 5 day blocks (5× slot "1."), found ${slot1Items.length}`);
  }

  // Deduplicate by y (some PDFs have overlays) and take 5 day starts.
  const dayStarts = [];
  for (const it of slot1Items) {
    if (dayStarts.every(existing => Math.abs(existing.y - it.y) > 4)) {
      dayStarts.push(it);
    }
    if (dayStarts.length === 5) break;
  }

  if (dayStarts.length < 5) {
    throw new Error(`Expected 5 unique day blocks, found ${dayStarts.length}`);
  }

  // Find all slot markers for grouping
  const allSlots = items
    .filter(it => /^\d{1,2}\.?$/.test(it.str) && it.x < 100)
    .map(it => ({ num: parseInt(it.str, 10), y: it.y }));

  // Build day blocks: each block spans from its "1." to its "10."
  const blocks = dayStarts.map((start, dayIdx) => {
    const dayId = DAY_IDS[dayIdx];

    // Find slot items belonging to this day block
    // They are between this day's "1." and the next day's "1." (or bottom of page)
    const yTop = start.y + 5;
    const yBottom = dayIdx < 4 ? dayStarts[dayIdx + 1].y - 5 : -Infinity;

    const daySlots = allSlots
      .filter(s => s.y <= yTop && s.y >= yBottom)
      .sort((a, b) => b.y - a.y); // top to bottom

    // Group by slot number (there may be duplicate numbers from different y-lines)
    const slotYs = {};
    for (const s of daySlots) {
      if (!slotYs[s.num]) slotYs[s.num] = s.y;
    }

    log(`Day ${dayId}: yTop=${Math.round(yTop)}, yBottom=${Math.round(yBottom)}, slots found: ${Object.keys(slotYs).join(',')}`);

    return { dayId, yTop, yBottom, slotYs };
  });

  return blocks;
}

// === Item Lookup ===
function findItemInColumn(items, column, y, yTolerance) {
  // Find the item that falls within the column's x-range and near the given y
  const candidates = items.filter(it =>
    it.x >= column.leftBound - 5 &&
    it.x < column.rightBound - 5 &&
    Math.abs(it.y - y) <= yTolerance
  );

  if (candidates.length === 0) return null;

  // Pick the one closest to y
  candidates.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
  return candidates[0];
}

function findRoomInColumn(items, column, y, yTolerance) {
  // Room items appear near the R column x position, between subject and teacher rows
  const candidates = items.filter(it =>
    Math.abs(it.x - column.roomX) < 20 &&
    Math.abs(it.y - y) <= yTolerance &&
    /^(\d{1,2}|T\d|BS|HS|USF|BL|H|8\/4)$/.test(it.str)
  );

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
  return candidates[0];
}

// === Main Parser ===
function parseTimetable(items, columns, dayBlocks) {
  const classes = {};
  for (const cls of CLASS_IDS) {
    classes[cls] = {};
    for (const day of DAY_IDS) {
      classes[cls][day] = [];
    }
  }

  for (const block of dayBlocks) {
    const { dayId, slotYs } = block;

    // Process slot pairs: (1,2), (3,4), (5,6), (7,8)
    for (const [oddStr, appSlots] of Object.entries(PAIR_TO_SLOTS)) {
      const oddNum = parseInt(oddStr);
      const evenNum = oddNum + 1;

      const subjectY = slotYs[oddNum];
      const teacherY = slotYs[evenNum];

      if (!subjectY) {
        log(`  ${dayId}: No slot ${oddNum} found, skipping pair`);
        continue;
      }

      // Room items appear between subject and teacher rows (~7 units below subject)
      const roomY = subjectY - 7;

      for (const col of columns) {
        // Find subject
        const subjectItem = findItemInColumn(items, col, subjectY, 3);
        let subject = subjectItem?.str || null;

        // Find teacher
        let teacher = null;
        if (teacherY) {
          const teacherItem = findItemInColumn(items, col, teacherY, 3);
          teacher = teacherItem?.str || null;
        }

        // Find room
        const roomItem = findRoomInColumn(items, col, roomY, 5);
        let room = roomItem?.str || null;

        // Filter out #NV, time-like tokens
        if (subject === '#NV') subject = null;
        if (teacher === '#NV') teacher = null;
        if (subject && /^\d{1,2}\.\d{2}/.test(subject)) subject = null; // time token
        if (subject && /^\d{1,2}\.\d{2}\s*-?$/.test(subject)) subject = null;
        // Filter non-teacher items on teacher lines
        if (teacher && /\s/.test(teacher)) teacher = null; // teachers never contain spaces
        if (teacher && /^[A-ZÄÖÜ]+-$/.test(teacher)) teacher = null; // word fragments like "SERIEN-", "UNTER-"
        if (teacher && CLASS_IDS.includes(teacher)) teacher = null; // class names aren't teachers
        if (teacher && /^(USF|PROJEKT|FERTIGUNG)$/i.test(teacher)) teacher = null; // USF fragments

        // Detect special events (Serviceteam, USF-Treffen, etc.)
        const isSpecial = subject && /^(Serviceteam|USF-Treffen)$/i.test(subject);

        // Detect USF project entries: "LUNIDO", "LYS", "Übergabe USF", etc.
        const cleanSubject = subject?.replace(/[""„"]/g, '').trim();
        const isUSF = teacher === 'USF'
          || (cleanSubject && /^(LUNIDO|LYS|Combee|Scutobeat)$/i.test(cleanSubject))
          || (subject && /^(USF|UNTER-|SERIEN-|NEHMENS-|PROJEKT|FERTIGUNG)$/i.test(subject))
          || (subject && /Übergabe\s*USF/i.test(subject));

        // If this is a USF entry, mark as special and clean up
        if (isUSF) {
          subject = subject?.replace(/[""„"]/g, '').trim() || 'USF';
          teacher = null;
          room = null;
        }

        // Filter out remaining pure fragments that aren't real subjects
        if (subject && /^[A-ZÄÖÜ]+-$/.test(subject)) subject = null; // "SERIEN-", "UNTER-", etc.

        // Skip completely empty entries
        if (!subject && !teacher && !room) continue;

        // Create entries for both app slots in the pair
        for (const slotId of appSlots) {
          const entry = {
            slotId,
            subject: subject || null,
            teacher: teacher || null,
            room: room || null
          };
          if (isSpecial || isUSF) entry.note = subject;
          classes[col.id][dayId].push(entry);
        }

        log(`  ${dayId} slots ${appSlots.join(',')}: ${col.id} → "${subject || '—'}" | ${teacher || '—'} | R:${room || '—'}`);
      }
    }

    // Sort entries by slot ID
    for (const cls of CLASS_IDS) {
      classes[cls][dayId].sort((a, b) => Number(a.slotId) - Number(b.slotId));
    }
  }

  // === Detect special events (generic, structure-based) ===
  // Any text item in the data area that wasn't consumed as a regular
  // subject/teacher/room is a potential special event.
  // We identify these by: they contain spaces (unlike teacher abbrevs),
  // or are multi-word, and don't match known structural patterns.
  const STRUCTURAL_PATTERNS = /^(\d{1,2}\.?|R|#NV|\d{1,2}\.\d{2}|—)$/;
  const TEACHER_LIKE = /^[A-ZÄÖÜ]{2,5}(\/[A-ZÄÖÜ]{2,5})?$/; // e.g. "STE", "BER/WEZ"
  const ROOM_LIKE = /^(\d{1,2}|T\d|BS|HS|BL|H|8\/4)$/;
  const USF_FRAGMENT = /^[A-ZÄÖÜ]+-$|^(FERTIGUNG|PROJEKT|SERIENFERTIGUNG|UNTERNEHMENSPROJEKT)$/i;

  // Collect all items already used as subjects, teachers, rooms
  const usedStrings = new Set();
  for (const cls of CLASS_IDS) {
    for (const day of DAY_IDS) {
      for (const e of classes[cls][day]) {
        if (e.subject) usedStrings.add(e.subject);
      }
    }
  }

  // Find candidate special event items
  const dataLeft = columns[0].leftBound - 5;
  const dataRight = columns[columns.length - 1].rightBound + 50;
  const specialCandidates = items.filter(it => {
    if (it.x < dataLeft || it.x > dataRight) return false; // outside data area
    if (it.x < 100) return false; // slot markers at left edge
    if (STRUCTURAL_PATTERNS.test(it.str)) return false;
    if (TEACHER_LIKE.test(it.str)) return false;
    if (ROOM_LIKE.test(it.str)) return false;
    if (USF_FRAGMENT.test(it.str)) return false;
    if (CLASS_IDS.includes(it.str)) return false;
    if (usedStrings.has(it.str)) return false; // already used as subject
    if (/^[""„"]/.test(it.str)) return false; // quoted USF project names (handled above)
    if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(it.str)) return false; // dates like 30.10.2025
    // Must contain a space, or be a recognizable multi-word item
    if (!/\s/.test(it.str) && it.str.length < 8) return false;
    return true;
  });

  function clusterSpecialItems(itemsInBlock) {
    const sorted = itemsInBlock.slice().sort((a, b) => b.y - a.y);
    const clusters = [];

    for (const item of sorted) {
      const itemLeft = item.x;
      const itemRight = item.x + (item.width || 0);

      let target = null;
      for (const cluster of clusters) {
        const yClose = Math.abs(cluster.centerY - item.y) <= 26;
        const xOverlap = itemRight >= (cluster.minX - 40) && itemLeft <= (cluster.maxX + 40);
        if (yClose && xOverlap) {
          target = cluster;
          break;
        }
      }

      if (!target) {
        target = {
          items: [],
          minX: itemLeft,
          maxX: itemRight,
          minY: item.y,
          maxY: item.y,
          centerY: item.y
        };
        clusters.push(target);
      }

      target.items.push(item);
      target.minX = Math.min(target.minX, itemLeft);
      target.maxX = Math.max(target.maxX, itemRight);
      target.minY = Math.min(target.minY, item.y);
      target.maxY = Math.max(target.maxY, item.y);
      target.centerY = target.items.reduce((sum, it) => sum + it.y, 0) / target.items.length;
    }

    return clusters;
  }

  function clusterLabel(cluster) {
    // Rebuild label line-wise (top to bottom), keeping reading order inside each line.
    const lineBuckets = [];
    const byY = cluster.items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    for (const it of byY) {
      let line = lineBuckets.find(l => Math.abs(l.y - it.y) <= 4);
      if (!line) {
        line = { y: it.y, items: [] };
        lineBuckets.push(line);
      }
      line.items.push(it);
    }

    const lines = lineBuckets
      .sort((a, b) => b.y - a.y)
      .map(line => line.items.sort((a, b) => a.x - b.x).map(it => it.str).join(' ').trim())
      .filter(Boolean);

    return lines.join(' – ');
  }

  for (const block of dayBlocks) {
    const itemsInBlock = specialCandidates.filter(it => it.y <= block.yTop && it.y >= block.yBottom);
    const clusters = clusterSpecialItems(itemsInBlock);

    for (const cluster of clusters) {
      const label = clusterLabel(cluster);
      if (!label) continue;

      const coveredColumns = columns.filter(col =>
        cluster.maxX >= (col.leftBound - 30) && cluster.minX <= (col.rightBound + 30)
      );
      if (coveredColumns.length === 0) continue;

      const matchedSlots = [];
      for (const [oddStr, appSlots] of Object.entries(PAIR_TO_SLOTS)) {
        const oddNum = parseInt(oddStr, 10);
        const slotY = block.slotYs[oddNum];
        if (!slotY) continue;

        const spansPair = slotY <= (cluster.maxY + 20) && slotY >= (cluster.minY - 35);
        const nearPair = Math.abs(slotY - ((cluster.minY + cluster.maxY) / 2)) < 32;
        if (spansPair || nearPair) matchedSlots.push(...appSlots);
      }

      // Fallback: nearest pair by vertical distance.
      if (matchedSlots.length === 0) {
        let nearest = null;
        let bestDist = Infinity;
        for (const [oddStr, appSlots] of Object.entries(PAIR_TO_SLOTS)) {
          const oddNum = parseInt(oddStr, 10);
          const slotY = block.slotYs[oddNum];
          if (!slotY) continue;
          const dist = Math.abs(slotY - ((cluster.minY + cluster.maxY) / 2));
          if (dist < bestDist) {
            bestDist = dist;
            nearest = appSlots;
          }
        }
        if (nearest) matchedSlots.push(...nearest);
      }

      if (matchedSlots.length === 0) continue;

      let added = false;
      for (const col of coveredColumns) {
        for (const slotId of [...new Set(matchedSlots)]) {
          const existing = classes[col.id][block.dayId].find(e => e.slotId === slotId);
          if (existing) continue;
          classes[col.id][block.dayId].push({
            slotId,
            subject: label,
            teacher: null,
            room: null,
            note: label
          });
          added = true;
        }
      }

      if (added) {
        log(`  Special event: "${label}" → ${block.dayId}, slots ${[...new Set(matchedSlots)].join(',')}, columns: ${coveredColumns.map(c => c.id).join(',')}`);
      }
    }
  }

  // === Fill empty USF slots ===
  // If a class has any USF/LUNIDO/LYS note in a day, fill all empty
  // slots in that day with USF notes (they're doing their project all day)
  const USF_SUBJECTS = /^(USF|LUNIDO|LYS|Combee|Scutobeat|Übergabe\s*USF)$/i;
  for (const cls of CLASS_IDS) {
    for (const dayId of DAY_IDS) {
      const entries = classes[cls][dayId];
      // Check if any entry in this day is a USF note
      const usfEntry = entries.find(e => e.note && USF_SUBJECTS.test(e.subject));
      if (!usfEntry) continue;

      const usfLabel = usfEntry.subject; // e.g. "LUNIDO" or "USF"
      // Find all slot IDs that should exist
      const allSlotIds = Object.values(PAIR_TO_SLOTS).flat();
      const existingSlotIds = new Set(entries.map(e => e.slotId));

      for (const slotId of allSlotIds) {
        if (!existingSlotIds.has(slotId)) {
          entries.push({
            slotId,
            subject: usfLabel,
            teacher: null,
            room: null,
            note: usfLabel
          });
          log(`  USF fill: ${cls} ${dayId} slot ${slotId} → "${usfLabel}"`);
        }
      }
    }
  }

  // Also detect USF from fragments: if a class has mostly empty days
  // with USF-related fragments in nearby items, mark entire days as USF
  const USF_FRAGMENTS = /^(UNTER-|NEHMENS-|SERIEN-|FERTIGUNG|PROJEKT|USF)$/i;
  for (const col of columns) {
    // Find all USF-related fragment items in this column's x-range
    const colFragments = items.filter(it =>
      it.x >= col.leftBound - 5 && it.x < col.rightBound + 20 &&
      USF_FRAGMENTS.test(it.str)
    );

    if (colFragments.length === 0) continue;

    // Group fragments by day block
    for (const block of dayBlocks) {
      const dayFragments = colFragments.filter(f =>
        f.y <= block.yTop && f.y >= block.yBottom
      );
      if (dayFragments.length === 0) continue;

      // This day has USF fragments — fill empty slots
      const entries = classes[col.id][block.dayId];
      const hasUSF = entries.some(e => e.note && USF_SUBJECTS.test(e.subject));
      if (hasUSF) continue; // Already handled above

      const allSlotIds = Object.values(PAIR_TO_SLOTS).flat();
      const existingSlotIds = new Set(entries.map(e => e.slotId));
      let filled = false;

      for (const slotId of allSlotIds) {
        if (!existingSlotIds.has(slotId)) {
          entries.push({
            slotId,
            subject: 'USF',
            teacher: null,
            room: null,
            note: 'USF'
          });
          filled = true;
        }
      }
      if (filled) {
        log(`  USF fragments in ${col.id} ${block.dayId} → filled empty slots with USF`);
      }
    }
  }

  // Re-sort after adding special events and USF fills
  for (const block of dayBlocks) {
    for (const cls of CLASS_IDS) {
      classes[cls][block.dayId].sort((a, b) => Number(a.slotId) - Number(b.slotId));
    }
  }

  return classes;
}

// === Statistics ===
function generateStats(classes) {
  const stats = { totalEntries: 0, byClass: {}, teachers: new Set(), rooms: new Set(), subjects: new Set() };

  for (const classId of CLASS_IDS) {
    let count = 0;
    for (const dayId of DAY_IDS) {
      const entries = classes[classId][dayId];
      count += entries.length;
      stats.totalEntries += entries.length;
      for (const e of entries) {
        if (e.teacher) stats.teachers.add(e.teacher);
        if (e.room) stats.rooms.add(e.room);
        if (e.subject) stats.subjects.add(e.subject);
      }
    }
    stats.byClass[classId] = count;
  }

  return {
    totalEntries: stats.totalEntries,
    byClass: stats.byClass,
    teachers: [...stats.teachers].sort(),
    rooms: [...stats.rooms].sort(),
    subjects: [...stats.subjects].sort()
  };
}

// === Main ===
(async () => {
  try {
    console.log(`ℹ️  HGH PDF Parser v2.0 (coordinate-based)`);
    console.log(`ℹ️  Input: ${path.basename(args.input)}`);
    console.log('');

    // 1. Extract items with coordinates
    const items = await extractItems(args.input);
    log(`Extracted ${items.length} text items from PDF`);

    // 2. Detect class columns from R headers
    const columns = findColumns(items);

    // 3. Detect 5 day blocks from repeated slot "1." markers
    const dayBlocks = findDayBlocks(items);

    // 4. Parse timetable
    const classes = parseTimetable(items, columns, dayBlocks);

    // 5. Generate statistics
    const stats = generateStats(classes);

    // 6. Build and write output
    const output = {
      meta: {
        school: 'HGH',
        validFrom: args.validFrom,
        updatedAt: new Date().toISOString(),
        source: path.basename(args.input)
      },
      timeslots: TIMESLOTS,
      classes
    };

    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(output, null, 2) + '\n', 'utf8');

    console.log('✅ Parsing complete!');
    console.log('');
    console.log('📊 Statistics:');
    console.log(`   Total entries: ${stats.totalEntries}`);
    console.log(`   Teachers: ${stats.teachers.length} (${stats.teachers.slice(0, 10).join(', ')})`);
    console.log(`   Rooms: ${stats.rooms.length} (${stats.rooms.join(', ')})`);
    console.log(`   Subjects: ${stats.subjects.length}`);
    console.log('');
    Object.entries(stats.byClass).forEach(([cls, count]) => {
      console.log(`   ${cls}: ${count} entries`);
    });
    console.log('');
    console.log(`ℹ️  Output: ${args.out}`);

    if (stats.totalEntries < 100) {
      console.log('');
      console.warn('⚠️  Low entry count! Try running with --debug to inspect.');
    }

  } catch (err) {
    console.error('❌ Parsing failed:', err.message);
    if (args.debug) console.error(err);
    process.exit(1);
  }
})();
