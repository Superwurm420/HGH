import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

function normalizeText(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function parseGermanDateToken(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;

  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== year || (dt.getUTCMonth() + 1) !== month || dt.getUTCDate() !== day) return null;

  return iso;
}

function collectDateItems(items) {
  return items
    .filter(it => /\d{1,2}\.\d{1,2}\.\d{2,4}/.test(it.str))
    .map(it => ({ ...it, parsed: parseGermanDateToken(it.str) }))
    .filter(it => it.parsed);
}

function getBounds(items) {
  if (!items.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const item of items) {
    if (item.x < minX) minX = item.x;
    if (item.x > maxX) maxX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.y > maxY) maxY = item.y;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY
  };
}

function findTopLeftDate(dateItems, bounds) {
  if (!dateItems.length) return null;

  const leftLimit = bounds.minX + bounds.width * 0.45;
  const topLimit = bounds.minY + bounds.height * 0.45;

  const preferred = dateItems
    .filter(d => d.x <= leftLimit && d.y >= topLimit)
    .sort((a, b) => (a.x - b.x) || (b.y - a.y))[0];

  if (preferred) return preferred;

  return dateItems
    .slice()
    .sort((a, b) => (a.x - b.x) || (b.y - a.y))[0] || null;
}

function findValidFrom(items, dateItems, bounds) {
  // Stundenplan-Layout: gültig-ab Datum steht links im Kopfbereich.
  const topLeftDate = findTopLeftDate(dateItems, bounds);
  if (topLeftDate?.parsed) {
    return { value: topLeftDate.parsed, raw: topLeftDate.str };
  }

  // Fallback: Prefer explicit inline label containing the date.
  const inline = items
    .filter(it => /gültig\s*ab/i.test(it.str))
    .map(it => ({ ...it, parsed: parseGermanDateToken(it.str) }))
    .find(it => it.parsed);

  if (inline?.parsed) {
    return { value: inline.parsed, raw: inline.str };
  }

  // Fallback: "Gültig ab" token + nearest date on same row / to the right.
  const label = items
    .filter(it => /gültig\s*ab/i.test(it.str))
    .sort((a, b) => b.y - a.y || a.x - b.x)[0] || null;

  if (!label) return { value: null, raw: null };

  const nearest = dateItems
    .filter(d => Math.abs(d.y - label.y) <= 14 && d.x >= (label.x - 20))
    .sort((a, b) => (a.x - b.x) || (Math.abs(a.y - label.y) - Math.abs(b.y - label.y)))[0]
    || null;

  return {
    value: nearest?.parsed || null,
    raw: nearest?.str || label.str
  };
}

function findUpdatedDate(dateItems) {
  // Bottom-right document date.
  const bottomRightDate = dateItems
    .slice()
    .sort((a, b) => (a.y - b.y) || (b.x - a.x))[0] || null;

  return {
    value: bottomRightDate?.parsed || null,
    raw: bottomRightDate?.str || null
  };
}

export async function extractTimetablePdfDates(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();

  const items = content.items
    .map(it => ({
      str: normalizeText(it.str),
      x: it.transform[4],
      y: it.transform[5]
    }))
    .filter(it => it.str);

  const bounds = getBounds(items);
  const dateItems = collectDateItems(items);
  const validFrom = findValidFrom(items, dateItems, bounds);
  const updated = findUpdatedDate(dateItems);

  return {
    validFrom: validFrom.value,
    updatedDate: updated.value,
    validFromRaw: validFrom.raw,
    updatedDateRaw: updated.raw
  };
}
