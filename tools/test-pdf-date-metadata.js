#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { extractTimetablePdfDates } from './pdf-date-metadata.js';

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

const pdfFiles = fs.readdirSync('plan').filter(name => name.toLowerCase().endsWith('.pdf'));
if (!pdfFiles.length) {
  fail('Keine PDF-Dateien im Verzeichnis plan/ gefunden.');
}

const records = [];
for (const name of pdfFiles) {
  const full = path.join('plan', name);
  const meta = await extractTimetablePdfDates(full);
  if (!meta.validFrom) fail(`${name}: validFrom nicht erkannt.`);
  if (!meta.updatedDate) fail(`${name}: updatedDate nicht erkannt.`);
  records.push({ name, ...meta });
}

records.sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1));
console.log('✅ PDF-Datumsmetadaten erkannt:');
for (const rec of records) {
  console.log(`   ${rec.name} → validFrom=${rec.validFrom}, updated=${rec.updatedDate}`);
}
