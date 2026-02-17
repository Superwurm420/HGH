#!/usr/bin/env node
// Extract text items with x/y positions using pdfjs-dist
// Usage: node tools/pdf-extract-items.js input.pdf out.json

import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const inPdf = process.argv[2];
const outJson = process.argv[3] || 'tmp_pdf_items.json';
if(!inPdf){
  console.error('Usage: node tools/pdf-extract-items.js input.pdf out.json');
  process.exit(2);
}

function norm(s){
  return String(s||'').replace(/\s+/g,' ').trim();
}

(async ()=>{
  const data = new Uint8Array(fs.readFileSync(inPdf));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items = content.items
    .map(it => ({
      str: norm(it.str),
      x: it.transform[4],
      y: it.transform[5]
    }))
    .filter(it => it.str);

  fs.writeFileSync(outJson, JSON.stringify({source: inPdf, items}, null, 2));
  console.log('Wrote', outJson, 'items', items.length);
})();
