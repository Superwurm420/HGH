#!/usr/bin/env node
/*
  Convert the HGH timetable PDF (1 page) into timetable.json.
  Heuristic based on x positions of columns.

  Usage:
    node pdf-to-timetable.js <input.pdf> <output.json>
*/

const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');

const DAYS = [
  { id: 'mo', label: 'MO' },
  { id: 'di', label: 'DI' },
  { id: 'mi', label: 'MI' },
  { id: 'do', label: 'DO' },
  { id: 'fr', label: 'FR' },
];

const CLASS_IDS = ['HT11','HT12','HT21','HT22','G11','G21','GT01'];

// Derived from header row positions in the PDF you sent.
// These are the x positions for the *subject* columns.
const SUBJECT_X = {
  HT11: 101.54,
  HT12: 202.25,
  HT21: 300.17,
  HT22: 409.99,
  G11: 523.99,
  G21: 621.94,
  GT01: 719.86,
};

// Room column x positions ("R" columns)
const ROOM_X = {
  HT11: 190.37,
  HT12: 289.73,
  HT21: 398.47,
  HT22: 510.31,
  G11: 611.50,
  G21: 709.42,
  GT01: 807.36,
};

function clampTol(a, b, tol){
  return Math.abs(a-b) <= tol;
}

function nearestKeyByX(x, map, tol){
  let best = null;
  let bestD = Infinity;
  for(const [k,v] of Object.entries(map)){
    const d = Math.abs(x - v);
    if(d < bestD){ bestD = d; best = k; }
  }
  if(bestD <= tol) return best;
  return null;
}

function normalizeStr(s){
  return String(s || '').replace(/\s+/g,' ').trim();
}

function slotIdFromToken(tok){
  const m = /^([0-9]{1,2})\.$/.exec(tok);
  if(!m) return null;
  const n = Number(m[1]);
  if(n>=1 && n<=10) return String(n);
  return null;
}

async function extractItems(pdfPath){
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjsLib.getDocument({data}).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map(it => ({ str: normalizeStr(it.str), x: it.transform[4], y: it.transform[5] }))
    .filter(it => it.str);
}

function groupLines(items){
  // group by rounded y (works for this PDF)
  const map = new Map();
  for(const it of items){
    const y = Math.round(it.y);
    if(!map.has(y)) map.set(y, []);
    map.get(y).push(it);
  }
  // sort each line left-to-right
  for(const arr of map.values()) arr.sort((a,b)=>a.x-b.x);
  return map;
}

function findDayBands(lineMap){
  // day markers appear as standalone tokens at left
  const dayY = {};
  for(const [y, arr] of lineMap.entries()){
    if(arr.length === 1 && ['MO','DI','MI','DO','FR'].includes(arr[0].str)){
      dayY[arr[0].str] = y;
    }
    // sometimes there are other tokens on same line, be lenient
    if(arr.some(it => ['MO','DI','MI','DO','FR'].includes(it.str))){
      const token = arr.find(it => ['MO','DI','MI','DO','FR'].includes(it.str))?.str;
      if(token && dayY[token] == null) dayY[token] = y;
    }
  }
  const ordered = DAYS
    .map(d => ({...d, y: dayY[d.label]}))
    .filter(d => typeof d.y === 'number')
    .sort((a,b)=>b.y-a.y);

  // bands: for each day, yTop = its marker y, yBottom = next marker y
  const bands = [];
  for(let i=0;i<ordered.length;i++){
    const cur = ordered[i];
    const next = ordered[i+1];
    bands.push({ dayId: cur.id, yTop: cur.y + 20, yBottom: (next ? next.y - 20 : -Infinity) });
  }
  return bands;
}

function parseBand(lines, band){
  const rows = []; // {slotId, classId, subject?, teacher?, room?}

  // pick line ys within band
  const ys = [...lines.keys()].filter(y => y < band.yTop && y > band.yBottom).sort((a,b)=>b-a);

  for(const y of ys){
    const line = lines.get(y);
    if(!line || line.length < 4) continue;

    // detect a slot line (starts with "N." at x~40)
    const firstTok = line[0].str;
    const slotId = slotIdFromToken(firstTok);
    if(!slotId) continue;

    // ignore slot 10 (#NV etc) still parsed

    // for each class column, take the item nearest to its subject x on this line
    for(const classId of CLASS_IDS){
      const subj = line.find(it => nearestKeyByX(it.x, {[classId]: SUBJECT_X[classId]}, 25) === classId);
      if(subj){
        // room might be in a separate "R" column; find token near ROOM_X on same y
        const roomTok = line.find(it => clampTol(it.x, ROOM_X[classId], 15));
        const room = roomTok ? roomTok.str : null;

        // Heuristic: teacher is usually a short token (2-4 letters) in some PDFs on a different line.
        // In this PDF, many teacher tokens appear on the *next* line with same slot.
        rows.push({ dayId: band.dayId, slotId, classId, subject: subj.str, room });
      }
    }
  }

  return rows;
}

function buildTimetable(parsedRows){
  const timetable = {};
  for(const c of CLASS_IDS){
    timetable[c] = { mo: [], di: [], mi: [], do: [], fr: [] };
  }

  for(const r of parsedRows){
    const target = timetable[r.classId]?.[r.dayId];
    if(!target) continue;

    // ignore empty/#NV
    const subj = r.subject;
    if(!subj || subj === '#NV') continue;

    // store as subject + teacher + room (room only for now)
    target.push({
      slotId: r.slotId,
      subject: subj,
      teacher: null,
      room: r.room
    });
  }

  // ensure deterministic ordering
  for(const c of CLASS_IDS){
    for(const d of ['mo','di','mi','do','fr']){
      timetable[c][d].sort((a,b)=>Number(a.slotId)-Number(b.slotId));
    }
  }

  return timetable;
}

async function main(){
  const [,, inPdf, outJson] = process.argv;
  if(!inPdf || !outJson){
    console.error('Usage: node pdf-to-timetable.js <input.pdf> <output.json>');
    process.exit(2);
  }

  const items = await extractItems(inPdf);
  const lines = groupLines(items);
  const bands = findDayBands(lines);

  let parsed = [];
  for(const band of bands){
    parsed = parsed.concat(parseBand(lines, band));
  }

  const meta = {
    school: 'HGH',
    source: 'pdf',
    validFrom: null,
    updatedAt: new Date().toISOString(),
    input: inPdf
  };

  const out = {
    meta,
    classes: buildTimetable(parsed)
  };

  fs.writeFileSync(outJson, JSON.stringify(out, null, 2));
  console.log('Wrote', outJson);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
