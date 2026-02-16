#!/usr/bin/env node
/*
  Apply extracted room mappings to data/timetable.json.

  Usage:
    node scripts/apply-rooms.js plan/rooms.json data/timetable.json
*/

const fs = require('fs');

const inRooms = process.argv[2];
const inTimetable = process.argv[3] || 'data/timetable.json';
if (!inRooms) {
  console.error('Usage: node scripts/apply-rooms.js plan/rooms.json [data/timetable.json]');
  process.exit(2);
}

function loadJsonStripWarnings(p) {
  const raw = fs.readFileSync(p, 'utf8');
  const cleaned = raw
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('Warning:'))
    .join('\n');
  return JSON.parse(cleaned);
}

const rooms = loadJsonStripWarnings(inRooms);
const tt = JSON.parse(fs.readFileSync(inTimetable, 'utf8'));

const map = rooms.roomsByClass || {};
let updates = 0;

for (const [classId, slots] of Object.entries(map)) {
  const cls = tt.classes?.[classId];
  if (!cls) continue;
  for (const [dayId, rows] of Object.entries(cls)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      const slotId = String(r.slotId);
      const room = slots?.[slotId];
      if (room !== undefined) {
        if (r.room !== room) {
          r.room = room;
          updates++;
        }
      }
    }
  }
}

// meta update
try {
  tt.meta = tt.meta || {};
  tt.meta.updatedAt = new Date().toISOString();
} catch {}

fs.writeFileSync(inTimetable, JSON.stringify(tt, null, 2) + '\n');
console.log(`Updated ${updates} lesson entries with room values.`);
