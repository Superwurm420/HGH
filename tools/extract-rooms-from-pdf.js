#!/usr/bin/env node
/*
  Extract room codes from the timetable PDF using pdfjs-dist positional text.

  Heuristic: For each slot row, room codes are printed on a second line below the lesson text.
  We locate the slot label y positions ("1.", "2.", ...), then find the closest room token
  near each class' room-column x coordinate at y = slotY - ROOM_Y_OFFSET.

  Usage:
    node tools/extract-rooms-from-pdf.js input.pdf > rooms.json
*/

import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist');

const inPdf = process.argv[2];
if (!inPdf) {
  console.error('Usage: node tools/extract-rooms-from-pdf.js input.pdf');
  process.exit(2);
}

const ALLOWED_ROOMS = new Set(['1','2','3','4','5','6','7','8','9','10','BL','T1','T2','H']);

// class room-column centers (x positions of the "R" headers)
const CLASS_COLS = [
  { id: 'HT11', x: 187.46 },
  { id: 'HT12', x: 288.05 },
  { id: 'HT21', x: 398.35 },
  { id: 'HT22', x: 511.87 },
  { id: 'G11',  x: 614.26 },
  { id: 'G21',  x: 713.40 },
  { id: 'GT01', x: 812.52 },
];

const COL_TOL = 18; // x tolerance
const Y_TOL = 0.35; // y tolerance
const ROOM_Y_OFFSET = 3.84; // observed delta between lesson line and room line

function norm(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function roundY(y) {
  return Math.round(y * 100) / 100;
}

(async () => {
  const data = new Uint8Array(fs.readFileSync(inPdf));
  const doc = await pdfjsLib.getDocument({ data }).promise;

  // The provided PDF is a single-page overview timetable.
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items = content.items
    .map((it) => ({
      str: norm(it.str),
      x: it.transform[4],
      y: it.transform[5],
    }))
    .filter((it) => it.str);

  // Find slot label y positions: tokens like "1.", "2.", ... "10."
  const slotLabelItems = items.filter((it) => /^\d{1,2}\.$/.test(it.str));
  const slotLessonY = {}; // slotId -> y
  for (const it of slotLabelItems) {
    const slotId = it.str.replace('.', '');
    // only accept ids 1-10
    if (!/^([1-9]|10)$/.test(slotId)) continue;
    // keep the largest y (top-most) if duplicates appear
    if (!slotLessonY[slotId] || it.y > slotLessonY[slotId]) slotLessonY[slotId] = it.y;
  }

  // Derive room y positions
  const slotRoomY = {};
  for (const [slotId, y] of Object.entries(slotLessonY)) {
    slotRoomY[slotId] = roundY(y - ROOM_Y_OFFSET);
  }

  function findRoomAt(x, y) {
    const cands = items.filter(
      (it) =>
        Math.abs(it.y - y) <= Y_TOL &&
        Math.abs(it.x - x) <= COL_TOL &&
        ALLOWED_ROOMS.has(it.str)
    );
    if (!cands.length) return '';
    cands.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    return cands[0].str;
  }

  const roomsByClass = {};
  for (const cls of CLASS_COLS) {
    roomsByClass[cls.id] = {};
    for (const slotId of Object.keys(slotRoomY).sort((a,b)=>Number(a)-Number(b))) {
      const y = slotRoomY[slotId];
      roomsByClass[cls.id][slotId] = findRoomAt(cls.x, y);
    }
  }

  const result = {
    source: inPdf,
    slotLessonY,
    slotRoomY,
    roomsByClass,
  };

  process.stdout.write(JSON.stringify(result, null, 2));
})();
