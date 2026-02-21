import { readFileSync } from 'node:fs';
import { compareSlotIds, parsePdfTimetableV2 } from '../src/parsers/pdf/pdf-timetable-v2.js';

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
  ],
}, { minEntries: 1 });
if (!mixedSlots.ok) {
  throw new Error(`Expected mixed slot fixture to pass, got issues: ${mixedSlots.issues.join('; ')}`);
}
const orderedSlots = mixedSlots.model.classes.HT11.mo.map((entry) => entry.slotId);
const expectedOrder = ['2', '10', 'A2'];
if (JSON.stringify(orderedSlots) !== JSON.stringify(expectedOrder)) {
  throw new Error(`Unexpected slot order ${JSON.stringify(orderedSlots)} expected ${JSON.stringify(expectedOrder)}`);
}

const directSort = ['A2', '10', '2'].sort(compareSlotIds);
if (JSON.stringify(directSort) !== JSON.stringify(expectedOrder)) {
  throw new Error(`Comparator order mismatch ${JSON.stringify(directSort)} expected ${JSON.stringify(expectedOrder)}`);
}

console.log('pdf-parser-v2 fixtures passed');
