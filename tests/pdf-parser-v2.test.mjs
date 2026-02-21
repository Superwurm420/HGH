import { readFileSync } from 'node:fs';
import { parsePdfTimetableV2 } from '../src/parsers/pdf/pdf-timetable-v2.js';

function load(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
}

const valid = parsePdfTimetableV2(load('pdf-raw-valid.json'));
if (!valid.ok) {
  throw new Error(`Expected valid fixture to pass, got issues: ${valid.issues.join('; ')}`);
}

const invalid = parsePdfTimetableV2(load('pdf-raw-invalid.json'));
if (invalid.ok) {
  throw new Error('Expected invalid fixture to fail validation');
}


const mixedSlots = parsePdfTimetableV2({
  meta: { source: 'mixed.pdf' },
  items: [
    { str: 'class:HT11;day:mo;slot:A2;subject:Projekt', x: 10, y: 10 },
    { str: 'class:HT11;day:mo;slot:10;subject:Mathe', x: 10, y: 15 },
    { str: 'class:HT11;day:mo;slot:2;subject:Deutsch', x: 10, y: 20 },
    { str: 'class:HT11;day:di;slot:1;subject:Chemie', x: 10, y: 25 },
    { str: 'class:HT11;day:di;slot:2;subject:Chemie', x: 10, y: 30 },
    { str: 'class:HT11;day:mi;slot:1;subject:Physik', x: 10, y: 35 },
    { str: 'class:HT11;day:mi;slot:2;subject:Physik', x: 10, y: 40 },
    { str: 'class:HT11;day:do;slot:1;subject:Informatik', x: 10, y: 45 },
    { str: 'class:HT11;day:do;slot:2;subject:Informatik', x: 10, y: 50 },
    { str: 'class:HT11;day:fr;slot:1;subject:Sport', x: 10, y: 55 },
  ],
});
if (!mixedSlots.ok) {
  throw new Error(`Expected mixed slot fixture to pass, got issues: ${mixedSlots.issues.join('; ')}`);
}
const orderedSlots = mixedSlots.model.classes.HT11.mo.map((entry) => entry.slotId);
const expectedOrder = ['2', '10', 'A2'];
if (JSON.stringify(orderedSlots) !== JSON.stringify(expectedOrder)) {
  throw new Error(`Unexpected slot order ${JSON.stringify(orderedSlots)} expected ${JSON.stringify(expectedOrder)}`);
}



const slotEdgeCases = parsePdfTimetableV2({
  meta: { source: 'mixed-edge.pdf' },
  items: [
    { str: 'class:HT12;day:mo;slot:02;subject:Deutsch', x: 10, y: 10 },
    { str: 'class:HT12;day:mo;slot:A2;subject:Projekt', x: 10, y: 15 },
    { str: 'class:HT12;day:mo;slot:2A;subject:Projekt', x: 10, y: 20 },
    { str: 'class:HT12;day:mo;slot:2;subject:Mathe', x: 10, y: 25 },
    { str: 'class:HT12;day:di;slot:1;subject:Chemie', x: 10, y: 30 },
    { str: 'class:HT12;day:di;slot:2;subject:Chemie', x: 10, y: 35 },
    { str: 'class:HT12;day:mi;slot:1;subject:Physik', x: 10, y: 40 },
    { str: 'class:HT12;day:mi;slot:2;subject:Physik', x: 10, y: 45 },
    { str: 'class:HT12;day:do;slot:1;subject:Informatik', x: 10, y: 50 },
    { str: 'class:HT12;day:fr;slot:1;subject:Sport', x: 10, y: 55 },
  ],
});
if (!slotEdgeCases.ok) {
  throw new Error(`Expected edge slot fixture to pass, got issues: ${slotEdgeCases.issues.join('; ')}`);
}
const edgeOrder = slotEdgeCases.model.classes.HT12.mo.map((entry) => entry.slotId);
const expectedEdgeOrder = ['02', '2', '2A', 'A2'];
if (JSON.stringify(edgeOrder) !== JSON.stringify(expectedEdgeOrder)) {
  throw new Error(`Unexpected edge slot order ${JSON.stringify(edgeOrder)} expected ${JSON.stringify(expectedEdgeOrder)}`);
}

console.log('pdf-parser-v2 fixtures passed');
