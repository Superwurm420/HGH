#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const INPUT_DIR = 'data/bulletins';
const OUTPUT_JSON = 'data/bulletin.json';

function parseDateInput(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v}T00:00:00`;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(v)) return v.replace(' ', 'T');
  const dt = new Date(v);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toISOString();
}

function parseBulletinFile(raw, sourceName) {
  const lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
  const data = {
    id: sourceName,
    title: '',
    type: 'info',
    startsAt: '',
    endsAt: '',
    linkUrl: '',
    linkLabel: 'Mehr erfahren',
    message: '',
    enabled: true,
    source: sourceName
  };

  let bodyStart = lines.findIndex(line => line.trim() === '---');
  if (bodyStart === -1) bodyStart = lines.length;

  for (let i = 0; i < bodyStart; i += 1) {
    const line = lines[i];
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim().toLowerCase();
    const value = line.slice(sep + 1).trim();

    if (key === 'title') data.title = value;
    else if (key === 'type') data.type = value || 'info';
    else if (key === 'start') data.startsAt = parseDateInput(value);
    else if (key === 'end') data.endsAt = parseDateInput(value);
    else if (key === 'link') data.linkUrl = value;
    else if (key === 'linklabel') data.linkLabel = value || 'Mehr erfahren';
  }

  const body = lines.slice(bodyStart + 1).join('\n').trim();
  data.message = body;

  if (!data.title) data.title = path.basename(sourceName, path.extname(sourceName));
  if (!data.message) return null;
  return data;
}

function listBulletinFiles() {
  if (!fs.existsSync(INPUT_DIR)) return [];
  return fs.readdirSync(INPUT_DIR)
    .filter(name => name.toLowerCase().endsWith('.txt'))
    .filter(name => name.toLowerCase() !== 'readme.txt')
    .sort((a, b) => a.localeCompare(b, 'de'));
}

function main() {
  const files = listBulletinFiles();
  const items = [];

  for (const file of files) {
    const full = path.join(INPUT_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    const item = parseBulletinFile(raw, file);
    if (item) items.push(item);
  }

  items.sort((a, b) => {
    const aTs = a.startsAt ? new Date(a.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bTs = b.startsAt ? new Date(b.startsAt).getTime() : Number.MAX_SAFE_INTEGER;
    return aTs - bTs || a.title.localeCompare(b.title, 'de');
  });

  const payload = {
    updatedAt: new Date().toISOString(),
    items
  };

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Ingested ${items.length} bulletin item(s) into ${OUTPUT_JSON}`);
}

main();
