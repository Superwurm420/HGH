#!/usr/bin/env node
/**
 * HGH timetable PDF → content/stundenplan.json
 *
 * This parser uses PDF text items with x/y coordinates (pdfjs-dist).
 * It is tailored to the school PDF layout you provided:
 * - Single page
 * - Day blocks MO/DI/MI/DO/FR stacked vertically
 * - Each block contains multiple "slot" rows (1.–10.)
 * - Each slot row has subject columns for classes + separate "R" columns for rooms
 * - Teacher tokens are 2–4 uppercase letters (incl. umlauts) and appear on separate rows.
 *
 * Usage:
 *   node tools/pdf-to-timetable-v2.js <input.pdf> [--out content/stundenplan.json] [--validFrom 2026-01-19]
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const DAYS = [
  { id: 'mo', label: 'MO' },
  { id: 'di', label: 'DI' },
  { id: 'mi', label: 'MI' },
  { id: 'do', label: 'DO' },
  { id: 'fr', label: 'FR' },
];

const CLASS_IDS = ['HT11','HT12','HT21','HT22','G11','G21','GT01'];

function argValue(flag){
  const idx = process.argv.indexOf(flag);
  if(idx === -1) return null;
  return process.argv[idx+1] ?? null;
}

function norm(s){
  return String(s||'').replace(/\s+/g,' ').trim();
}

function isTeacherToken(tok){
  return /^[A-ZÄÖÜẞ]{2,4}$/.test(tok);
}

function slotIdFromToken(tok){
  const m = /^([0-9]{1,2})\.$/.exec(tok);
  if(!m) return null;
  const n = Number(m[1]);
  if(n>=1 && n<=10) return String(n);
  return null;
}

function near(a,b,tol){
  return Math.abs(a-b) <= tol;
}

function groupLines(items){
  const map = new Map();
  for(const it of items){
    const y = Math.round(it.y);
    if(!map.has(y)) map.set(y, []);
    map.get(y).push(it);
  }
  for(const arr of map.values()) arr.sort((a,b)=>a.x-b.x);
  return map;
}

async function extractItems(pdfPath){
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map(it => ({ str: norm(it.str), x: it.transform[4], y: it.transform[5] }))
    .filter(it => it.str);
}

function findHeaderPositions(items){
  // Class headers are on one line and include all class ids
  const headerLine = items
    .filter(it => ['HT11','HT12','HT21','HT22','G11','G21','GT 01'].includes(it.str));

  // If pdf splits GT 01 we still handle below.
  const classX = {};
  for(const it of headerLine){
    if(it.str === 'GT 01') classX.GT01 = it.x;
    else classX[it.str] = it.x;
  }

  // Room headers are "R" tokens, 7 of them
  const rLine = items.filter(it => it.str === 'R');
  // pick 7 distinct x positions
  const xs = [...new Set(rLine.map(it => Math.round(it.x*100)/100))].sort((a,b)=>a-b);
  const roomX = {};
  if(xs.length >= 7){
    // assign by order to class order
    for(let i=0;i<7;i++) roomX[CLASS_IDS[i]] = xs[i];
  }

  return { classX, roomX };
}

function findDayBands(lineMap){
  const dayY = {};
  for(const [y, arr] of lineMap.entries()){
    const tok = arr.find(it => ['MO','DI','MI','DO','FR'].includes(it.str))?.str;
    if(tok && dayY[tok] == null) dayY[tok] = y;
  }

  const ordered = DAYS
    .map(d => ({...d, y: dayY[d.label]}))
    .filter(d => typeof d.y === 'number')
    .sort((a,b)=>b.y-a.y);

  const bands = [];
  for(let i=0;i<ordered.length;i++){
    const cur = ordered[i];
    const next = ordered[i+1];
    bands.push({ dayId: cur.id, yTop: cur.y + 30, yBottom: (next ? next.y - 30 : -Infinity) });
  }
  return bands;
}

function getSlotLines(lineMap, band){
  const ys = [...lineMap.keys()]
    .filter(y => y < band.yTop && y > band.yBottom)
    .sort((a,b)=>b-a);

  const slotLines = [];
  for(const y of ys){
    const line = lineMap.get(y);
    if(!line || line.length < 4) continue;
    const slotId = slotIdFromToken(line[0].str);
    if(!slotId) continue;
    slotLines.push({ y, slotId, line });
  }
  return slotLines;
}

function pickTokenAtX(line, x, tol){
  // prefer token whose left edge x is nearest to target x
  let best=null, bestD=Infinity;
  for(const it of line){
    const d = Math.abs(it.x - x);
    if(d < bestD){ bestD=d; best=it; }
  }
  if(best && bestD <= tol) return best;
  return null;
}

function buildEmpty(){
  const classes = {};
  for(const c of CLASS_IDS){
    classes[c] = { mo: [], di: [], mi: [], do: [], fr: [] };
  }
  return classes;
}

function buildTimeslots(){
  return [
    { id: '1', time: '08:00–08:45' },
    { id: '2', time: '08:45–09:30' },
    { id: '3', time: '09:50–10:35' },
    { id: '4', time: '10:35–11:20' },
    { id: '5', time: '11:40–12:25' },
    { id: '6', time: '12:25–13:10' },
    { id: '7', time: 'Mittagspause' },
    { id: '8', time: '14:10–14:55' },
    { id: '9', time: '14:55–15:40' },
    { id: '10', time: '15:45–16:30' },
  ];
}

function parse(items, validFrom, inputPath){
  const { classX, roomX } = findHeaderPositions(items);
  const lineMap = groupLines(items);
  const bands = findDayBands(lineMap);

  const classes = buildEmpty();

  // Heuristic: For each day band, we look at each slotId.
  // For that slot, we pick the nearest *subject line* (often the first occurrence of this slot within the band)
  // and then look for a nearby *teacher line* with same slotId that mostly contains teacher tokens.

  for(const band of bands){
    const slotLines = getSlotLines(lineMap, band);
    // group by slotId
    const bySlot = new Map();
    for(const sl of slotLines){
      if(!bySlot.has(sl.slotId)) bySlot.set(sl.slotId, []);
      bySlot.get(sl.slotId).push(sl);
    }

    for(const [slotId, lines] of bySlot.entries()){
      // sort by y desc (top to bottom)
      lines.sort((a,b)=>b.y-a.y);

      // choose subjectLine: the one with most non-teacher words (or longer strings)
      let subjectLine = lines[0];
      let teacherLine = null;

      function scoreAsSubject(line){
        // count tokens that are not teacher tokens and not time bits
        let score=0;
        for(const it of line){
          const s=it.str;
          if(s==='-'||s==='Zeit'||s==='Std.'||s==='TAG') continue;
          if(slotIdFromToken(s)) continue;
          if(/^[0-9]{1,2}\.[0-9]{2}$/.test(s)) continue;
          if(/^[0-9]{1,2}\.[0-9]{2}\s*-?$/.test(s)) continue;
          if(isTeacherToken(s)) continue;
          if(s.length>=5) score += 2;
          else score += 1;
        }
        return score;
      }

      function scoreAsTeacher(line){
        let t=0;
        for(const it of line){
          if(isTeacherToken(it.str)) t++;
        }
        return t;
      }

      let bestSub = -1;
      for(const cand of lines){
        const sc = scoreAsSubject(cand.line);
        if(sc > bestSub){ bestSub=sc; subjectLine=cand; }
      }

      // pick teacher line: among other lines with same slotId, the one with most teacher tokens
      let bestTeach = 0;
      for(const cand of lines){
        if(cand === subjectLine) continue;
        const sc = scoreAsTeacher(cand.line);
        if(sc > bestTeach){ bestTeach=sc; teacherLine=cand; }
      }
      if(bestTeach < 2) teacherLine = null; // not confident

      for(const classId of CLASS_IDS){
        const sx = classX[classId] ?? null;
        const rx = roomX[classId] ?? null;
        if(sx == null || rx == null) continue;

        const subjTok = pickTokenAtX(subjectLine.line, sx, 35);
        let subject = subjTok?.str ?? null;
        if(subject === '#NV') subject = null;

        const roomTok = pickTokenAtX(subjectLine.line, rx, 18);
        const room = roomTok ? roomTok.str : null;

        let teacher = null;
        if(teacherLine){
          const teachTok = pickTokenAtX(teacherLine.line, sx, 35);
          if(teachTok && isTeacherToken(teachTok.str)) teacher = teachTok.str;
        }

        if(subject || teacher || room){
          classes[classId][band.dayId].push({ slotId, subject, teacher, room });
        }
      }
    }
  }

  // sort and remove empty rows
  for(const c of CLASS_IDS){
    for(const d of ['mo','di','mi','do','fr']){
      classes[c][d] = classes[c][d]
        .filter(r => r.subject || r.teacher || r.room)
        .sort((a,b)=>Number(a.slotId)-Number(b.slotId));
    }
  }

  return {
    meta: {
      school: 'HGH',
      validFrom: validFrom || null,
      updatedAt: new Date().toISOString(),
      source: path.basename(inputPath),
    },
    timeslots: buildTimeslots(),
    classes
  };
}

async function main(){
  const input = process.argv[2];
  const out = argValue('--out') || 'content/stundenplan.json';
  const validFrom = argValue('--validFrom') || null;

  if(!input){
    console.error('Usage: node tools/pdf-to-timetable-v2.js <input.pdf> [--out content/stundenplan.json] [--validFrom YYYY-MM-DD]');
    process.exit(2);
  }

  const items = await extractItems(input);
  const data = parse(items, validFrom, input);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Wrote', out);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
