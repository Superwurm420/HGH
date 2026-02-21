const DEFAULT_CLASSES = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];
const DAY_MAP = new Map([
  ['montag', 'mo'], ['mo', 'mo'],
  ['dienstag', 'di'], ['di', 'di'],
  ['mittwoch', 'mi'], ['mi', 'mi'],
  ['donnerstag', 'do'], ['do', 'do'],
  ['freitag', 'fr'], ['fr', 'fr'],
]);

function clean(value) {
  return (value ?? '').toString().trim();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function extractRowsFromPdfItems(items, { yTolerance = 2 } = {}) {
  const usable = (Array.isArray(items) ? items : [])
    .map((item) => ({ text: clean(item?.str), x: toNum(item?.x), y: toNum(item?.y) }))
    .filter((item) => item.text && item.x !== null && item.y !== null)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const rows = [];
  for (const item of usable) {
    const row = rows.find((r) => Math.abs(r.y - item.y) <= yTolerance);
    if (!row) {
      rows.push({ y: item.y, items: [item] });
    } else {
      row.items.push(item);
      row.y = (row.y + item.y) / 2;
    }
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => ({
      y: row.y,
      items: row.items.sort((a, b) => a.x - b.x),
      text: row.items.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim(),
    }));
}

function parseTokenLine(text) {
  const parts = text.split(';').map((part) => part.trim()).filter(Boolean);
  const payload = {};
  for (const part of parts) {
    const [key, ...rest] = part.split(':');
    if (!key || !rest.length) continue;
    payload[key.trim().toLowerCase()] = rest.join(':').trim();
  }
  return payload;
}

export function interpretRows(rows, issues = []) {
  const entries = [];
  const classes = new Set();

  for (const row of rows) {
    const payload = parseTokenLine(row.text);
    const classId = clean(payload.class || payload.klasse).toUpperCase();
    const dayRaw = clean(payload.day || payload.tag).toLowerCase();
    const slotId = clean(payload.slot || payload.std || payload.stunde);
    const subject = clean(payload.subject || payload.fach);

    if (!classId || !dayRaw || !slotId || !subject) continue;

    const dayId = DAY_MAP.get(dayRaw);
    if (!dayId) {
      issues.push(`Unbekannter Tag in Zeile: "${row.text}"`);
      continue;
    }

    classes.add(classId);
    entries.push({
      classId,
      dayId,
      slotId,
      subject,
      teacher: clean(payload.teacher || payload.lehrer),
      room: clean(payload.room || payload.raum),
      note: clean(payload.note || payload.notiz),
    });
  }

  if (!entries.length) issues.push('PDF-Interpretation ergab keine Einträge.');
  return { entries, classes: [...classes] };
}

export function validateEntries(entries, { minEntries = 10 } = {}) {
  const issues = [];
  const unique = new Set();

  for (const entry of entries) {
    const key = `${entry.classId}|${entry.dayId}|${entry.slotId}`;
    if (unique.has(key)) {
      issues.push(`Doppelter Eintrag ${key}.`);
      continue;
    }
    unique.add(key);
  }

  if (entries.length < minEntries) {
    issues.push(`Zu wenige Einträge (${entries.length}) für einen vollständigen Stundenplan.`);
  }

  return { ok: issues.length === 0, issues };
}

export function toTimetableModel({ entries, classes }, baseMeta = {}) {
  const classIds = classes.length ? classes : DEFAULT_CLASSES;
  const out = Object.fromEntries(classIds.map((classId) => [classId, { mo: [], di: [], mi: [], do: [], fr: [] }]));

  for (const row of entries) {
    if (!out[row.classId]) out[row.classId] = { mo: [], di: [], mi: [], do: [], fr: [] };
    out[row.classId][row.dayId].push({
      slotId: row.slotId,
      subject: row.subject,
      teacher: row.teacher || '',
      room: row.room || '',
      note: row.note || '',
    });
  }

  for (const classId of Object.keys(out)) {
    for (const dayId of ['mo', 'di', 'mi', 'do', 'fr']) {
      out[classId][dayId].sort((a, b) => compareSlotIds(a.slotId, b.slotId));
    }
  }

  return {
    meta: { ...baseMeta, parser: 'pdf-v2' },
    classes: out,
  };
}

const slotIdCollator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

function isNumericSlotId(value) {
  return /^\d+$/.test(value);
}

function compareSlotIds(a, b) {
  const aText = clean(a);
  const bText = clean(b);

  const aIsNumeric = isNumericSlotId(aText);
  const bIsNumeric = isNumericSlotId(bText);

  if (aIsNumeric && bIsNumeric) return Number(aText) - Number(bText);
  if (aIsNumeric) return -1;
  if (bIsNumeric) return 1;
  if (!aText && !bText) return 0;
  if (!aText) return 1;
  if (!bText) return -1;

  return slotIdCollator.compare(aText, bText);
}

export function parsePdfTimetableV2(raw) {
  const issues = [];
  const rows = extractRowsFromPdfItems(raw?.items || []);
  const interpreted = interpretRows(rows, issues);
  const validation = validateEntries(interpreted.entries);
  issues.push(...validation.issues);

  return {
    ok: validation.ok,
    issues,
    debug: { rowCount: rows.length, interpretedCount: interpreted.entries.length },
    model: toTimetableModel(interpreted, raw?.meta || {}),
  };
}
