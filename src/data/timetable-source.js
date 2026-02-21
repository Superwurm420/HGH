import { PATHS } from '../config/paths.js';
import { parsePdfTimetableV2 } from '../parsers/pdf/pdf-timetable-v2.js';

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

export async function loadTimetableSource() {
  const debug = { source: 'json', notes: [] };

  try {
    const pdfRaw = await fetchJson(PATHS.content.timetablePdfRawJson);
    const parsed = parsePdfTimetableV2(pdfRaw);
    debug.notes.push(...parsed.issues);

    if (parsed.ok) {
      debug.source = 'pdf-v2';
      return { data: parsed.model, debug };
    }

    debug.notes.push('Fallback auf content/stundenplan.json wegen fehlgeschlagener PDF-Validierung.');
  } catch (error) {
    debug.notes.push(`PDF-Rohdaten nicht verfügbar: ${error.message}`);
  }

  const data = await fetchJson(PATHS.content.timetableJson);
  return { data, debug };
}
