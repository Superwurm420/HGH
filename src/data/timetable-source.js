import { PATHS } from '../config/paths.js';
import { parsePdfTimetableV2 } from '../parsers/pdf/pdf-timetable-v2.js';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function readTimestamp(value) {
  if (!value || typeof value !== 'string') return Number.NaN;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? Number.NaN : ts;
}

function pickPreferredSource({ jsonData, pdfData }) {
  const jsonTs = readTimestamp(jsonData?.meta?.updatedAt) || readTimestamp(jsonData?.meta?.validFrom);
  const pdfTs = readTimestamp(pdfData?.meta?.updatedAt) || readTimestamp(pdfData?.meta?.validFrom);

  if (!Number.isNaN(jsonTs) && !Number.isNaN(pdfTs)) {
    return jsonTs >= pdfTs ? 'json' : 'pdf';
  }

  if (!Number.isNaN(jsonTs)) return 'json';
  if (!Number.isNaN(pdfTs)) return 'pdf';

  return 'pdf';
}

export async function loadTimetableSource() {
  const debug = { source: 'json', notes: [] };
  let parsedPdf = null;

  try {
    const pdfRaw = await fetchJson(PATHS.content.timetablePdfRawJson);
    parsedPdf = parsePdfTimetableV2(pdfRaw);
    debug.notes.push(...parsedPdf.issues);
    debug.notes.push(`PDF-Zeilen: ${parsedPdf.debug.rowCount}, Einträge: ${parsedPdf.debug.interpretedCount}, Sondertermine: ${parsedPdf.debug.specialEventCount}`);

    if (!parsedPdf.ok) debug.notes.push('Fallback auf content/stundenplan.json wegen fehlgeschlagener PDF-Validierung.');
  } catch (error) {
    debug.notes.push(`PDF-Rohdaten nicht verfügbar: ${error.message}`);
  }

  const data = await fetchJson(PATHS.content.timetableJson);

  if (parsedPdf?.ok) {
    const preferred = pickPreferredSource({ jsonData: data, pdfData: parsedPdf.model });
    debug.source = preferred === 'pdf' ? 'pdf-v2' : 'json';
    if (preferred === 'json') {
      debug.notes.push('JSON hat ein neueres Datum als PDF-Rohdaten und wird daher bevorzugt.');
      return { data, debug };
    }
    debug.notes.push('PDF-Rohdaten sind aktueller als JSON und werden verwendet.');
    return { data: parsedPdf.model, debug };
  }

  return { data, debug };
}
