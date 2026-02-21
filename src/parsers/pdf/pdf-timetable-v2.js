const DEFAULT_CLASSES = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];
const DAY_MAP = new Map([
  ['montag', 'mo'], ['mo', 'mo'],
  ['dienstag', 'di'], ['di', 'di'],
  ['mittwoch', 'mi'], ['mi', 'mi'],
  ['donnerstag', 'do'], ['do', 'do'],
  ['freitag', 'fr'], ['fr', 'fr']
]);
const DAY_IDS = ['mo', 'di', 'mi', 'do', 'fr'];
const SPECIAL_KEYWORDS = [
  'projekt', 'projekttag', 'blockunterricht', 'block', 'prüfung', 'klausur', 'ausfall',
  'entfall', 'exkursion', 'interne', 'schulung', 'serviceteam', 'praktikum'
];

function clean(value) {
  return (value ?? '').toString().replace(/\s+/g, ' ').trim();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isTeacherToken(token) {
  return /^[A-ZÄÖÜ]{2,6}$/.test(token || '');
}

function normalizeSlotToken(token) {
  const value = clean(token).replace(',', '-');
  if (/^\d{1,2}$/.test(value)) return [value];
  const match = value.match(/^(\d{1,2})\s*[-/]\s*(\d{1,2})$/);
  if (!match) return [];

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 6) return [];

  return Array.from({ length: (end - start) + 1 }, (_, idx) => String(start + idx));
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

function detectSpecialTerm(subject, note) {
  const value = `${subject} ${note}`.toLowerCase();
  return SPECIAL_KEYWORDS.some((keyword) => value.includes(keyword));
}

function parseTokenPayload(payload, rowText = '') {
  const classId = clean(payload.class || payload.klasse).toUpperCase();
  const dayRaw = clean(payload.day || payload.tag).toLowerCase();
  const slotValues = normalizeSlotToken(clean(payload.slot || payload.std || payload.stunde));
  const subject = clean(payload.subject || payload.fach);

  if (!classId || !dayRaw || !slotValues.length || !subject) return [];

  const dayId = DAY_MAP.get(dayRaw);
  if (!dayId) return [];

  const teacher = clean(payload.teacher || payload.lehrer);
  const room = clean(payload.room || payload.raum);
  const note = clean(payload.note || payload.notiz);
  const isSpecial = detectSpecialTerm(subject, note) || (!teacher && !room && subject.length > 20);

  return slotValues.map((slotId) => ({
    classId,
    dayId,
    slotId,
    subject,
    teacher,
    room,
    note,
    isSpecial,
    sourceText: rowText
  }));
}

function parseLooseLine(text) {
  const normalized = clean(text);
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/);
  const classIndex = tokens.findIndex((token) => /^[A-Z]{1,3}\d{2}$/.test(token));
  if (classIndex < 0) return [];

  const classId = tokens[classIndex];
  const dayIndex = tokens.findIndex((token, idx) => idx > classIndex && DAY_MAP.has(token.toLowerCase()));
  if (dayIndex < 0) return [];

  const dayId = DAY_MAP.get(tokens[dayIndex].toLowerCase());
  const slotIndex = tokens.findIndex((token, idx) => idx > dayIndex && normalizeSlotToken(token).length > 0);
  if (slotIndex < 0) return [];

  const slotValues = normalizeSlotToken(tokens[slotIndex]);
  const afterSlot = tokens.slice(slotIndex + 1);
  if (!afterSlot.length) return [];

  const teacherIndex = afterSlot.findIndex(isTeacherToken);
  const teacher = teacherIndex >= 0 ? afterSlot[teacherIndex] : '';
  const room = teacherIndex >= 0 ? clean(afterSlot.slice(teacherIndex + 1).join(' ')) : '';
  const subjectTokens = teacherIndex >= 0 ? afterSlot.slice(0, teacherIndex) : afterSlot;
  const subject = clean(subjectTokens.join(' '));
  if (!subject) return [];

  const note = '';
  const isSpecial = detectSpecialTerm(subject, note) || (!teacher && !room && subject.length > 20);
  return slotValues.map((slotId) => ({
    classId,
    dayId,
    slotId,
    subject,
    teacher,
    room,
    note,
    isSpecial,
    sourceText: normalized
  }));
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
      continue;
    }
    row.items.push(item);
    row.y = (row.y + item.y) / 2;
  }

  return rows
    .sort((a, b) => a.y - b.y)
    .map((row) => ({
      y: row.y,
      items: row.items.sort((a, b) => a.x - b.x),
      text: row.items.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim()
    }));
}

function dedupeAndClassify(entries, issues) {
  const byKey = new Map();
  const specialEvents = [];

  for (const entry of entries) {
    const key = `${entry.classId}|${entry.dayId}|${entry.slotId}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
    } else if (existing.subject !== entry.subject || existing.teacher !== entry.teacher || existing.room !== entry.room) {
      issues.push(`Konflikt für ${key}; nutze ersten Eintrag und ergänze Hinweis.`);
      const conflictNote = clean([existing.note, `Konflikt: ${entry.subject}`].filter(Boolean).join(' | '));
      byKey.set(key, { ...existing, note: conflictNote || existing.note });
    }

    if (entry.isSpecial) {
      specialEvents.push({
        classId: entry.classId,
        dayId: entry.dayId,
        slotId: entry.slotId,
        label: entry.subject,
        note: entry.note
      });
    }
  }

  return {
    entries: [...byKey.values()],
    specialEvents
  };
}

export function interpretRows(rows, issues = []) {
  const parsedEntries = [];
  const classes = new Set();

  for (const row of rows) {
    let extracted = parseTokenPayload(parseTokenLine(row.text), row.text);
    if (!extracted.length) extracted = parseLooseLine(row.text);
    if (!extracted.length) continue;

    for (const entry of extracted) {
      if (!DAY_IDS.includes(entry.dayId)) {
        issues.push(`Unbekannter Tag in Zeile: "${row.text}"`);
        continue;
      }
      classes.add(entry.classId);
      parsedEntries.push(entry);
    }
  }

  const { entries, specialEvents } = dedupeAndClassify(parsedEntries, issues);
  if (!entries.length) issues.push('PDF-Interpretation ergab keine Einträge.');
  return { entries, classes: [...classes], specialEvents };
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

export function toTimetableModel({ entries, classes, specialEvents }, baseMeta = {}) {
  const classIds = classes.length ? classes : DEFAULT_CLASSES;
  const out = Object.fromEntries(classIds.map((classId) => [classId, { mo: [], di: [], mi: [], do: [], fr: [] }]));

  for (const row of entries) {
    if (!out[row.classId]) out[row.classId] = { mo: [], di: [], mi: [], do: [], fr: [] };
    out[row.classId][row.dayId].push({
      slotId: row.slotId,
      subject: row.subject,
      teacher: row.teacher || '',
      room: row.room || '',
      note: row.note || ''
    });
  }

  for (const classId of Object.keys(out)) {
    for (const dayId of DAY_IDS) {
      out[classId][dayId].sort((a, b) => Number(a.slotId) - Number(b.slotId));
    }
  }

  return {
    meta: {
      ...baseMeta,
      parser: 'pdf-v2',
      specialEvents
    },
    classes: out
  };
}

export function parsePdfTimetableV2(raw) {
  const issues = [];

  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      issues: ['PDF-Rohdaten fehlen oder sind ungültig.'],
      debug: { rowCount: 0, interpretedCount: 0, specialEventCount: 0 },
      model: toTimetableModel({ entries: [], classes: [], specialEvents: [] }, {})
    };
  }

  const rows = extractRowsFromPdfItems(raw.items || []);
  const interpreted = interpretRows(rows, issues);
  const validation = validateEntries(interpreted.entries);
  issues.push(...validation.issues);

  return {
    ok: validation.ok,
    issues,
    debug: {
      rowCount: rows.length,
      interpretedCount: interpreted.entries.length,
      specialEventCount: interpreted.specialEvents.length
    },
    model: toTimetableModel(interpreted, raw.meta || {})
  };
}
