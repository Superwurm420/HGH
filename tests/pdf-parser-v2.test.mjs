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

const loose = parsePdfTimetableV2(load('pdf-raw-loose-layout.json'));
if (!loose.ok) {
  throw new Error(`Expected loose-layout fixture to pass, got issues: ${loose.issues.join('; ')}`);
}

const specials = loose.model?.meta?.specialEvents || [];
if (!specials.length) {
  throw new Error('Expected special events to be detected in loose-layout fixture');
}

console.log('pdf-parser-v2 fixtures passed');
