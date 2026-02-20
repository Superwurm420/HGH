import { CLASSES, DAY_IDS, DEFAULT_TIMESLOTS } from '../config.js';

const EMPTY_DAY = Object.freeze({ mo: [], di: [], mi: [], do: [], fr: [] });

function cloneEmptyDayMap() {
  return {
    mo: [],
    di: [],
    mi: [],
    do: [],
    fr: []
  };
}

export function createEmptyTimetable(classIds = CLASSES) {
  const empty = {};
  for (const classId of classIds) {
    empty[classId] = cloneEmptyDayMap();
  }
  return empty;
}

function sanitizeText(value) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim();
}

function normalizeTimeslots(rawTimeslots, issues) {
  if (!Array.isArray(rawTimeslots) || !rawTimeslots.length) {
    return [...DEFAULT_TIMESLOTS];
  }

  const seen = new Set();
  const out = [];

  for (const slot of rawTimeslots) {
    const id = sanitizeText(slot?.id);
    const time = sanitizeText(slot?.time);

    if (!id || !time) {
      issues.push('Ungültiger Zeitslot (id/time fehlt).');
      continue;
    }
    if (seen.has(id)) {
      issues.push(`Doppelter Zeitslot mit id ${id}.`);
      continue;
    }

    seen.add(id);
    out.push({ id, time });
  }

  return out.length ? out : [...DEFAULT_TIMESLOTS];
}

function normalizeLessonEntry(entry, slotIds, issues, ctx) {
  const slotId = sanitizeText(entry?.slotId);
  if (!slotId) {
    issues.push(`Stunde ohne slotId in ${ctx}.`);
    return null;
  }
  if (!slotIds.has(slotId)) {
    issues.push(`Unbekannter slotId ${slotId} in ${ctx}.`);
  }

  return {
    slotId,
    subject: sanitizeText(entry?.subject) || '—',
    room: sanitizeText(entry?.room),
    teacher: sanitizeText(entry?.teacher),
    note: sanitizeText(entry?.note)
  };
}

function normalizeDay(dayData, slotIds, issues, ctx) {
  if (!Array.isArray(dayData)) return [];

  const normalized = dayData
    .map((entry, index) => normalizeLessonEntry(entry, slotIds, issues, `${ctx} · Eintrag ${index + 1}`))
    .filter(Boolean)
    .sort((a, b) => Number(a.slotId) - Number(b.slotId));

  const seen = new Set();
  return normalized.filter((entry) => {
    if (seen.has(entry.slotId)) {
      issues.push(`Doppelte Stunde slotId ${entry.slotId} in ${ctx}.`);
      return false;
    }
    seen.add(entry.slotId);
    return true;
  });
}

function resolveSameAsRefs(classes, issues) {
  for (const classId of Object.keys(classes)) {
    for (const dayId of DAY_IDS) {
      const dayValue = classes[classId][dayId];
      if (!dayValue || Array.isArray(dayValue) || !dayValue.sameAs) continue;

      const refClass = sanitizeText(dayValue.sameAs);
      if (!refClass || !classes[refClass]) {
        issues.push(`sameAs-Referenz ${refClass || 'leer'} in ${classId}/${dayId} nicht gefunden.`);
        classes[classId][dayId] = [];
        continue;
      }
      classes[classId][dayId] = [...classes[refClass][dayId]];
    }
  }
}

function normalizeClasses(rawClasses, slotIds, issues) {
  const src = rawClasses && typeof rawClasses === 'object' ? rawClasses : {};
  const classIds = Object.keys(src);
  const fallbackClassIds = classIds.length ? classIds : [...CLASSES];
  const classes = createEmptyTimetable(fallbackClassIds);

  for (const classId of fallbackClassIds) {
    const classData = src[classId];
    if (!classData || typeof classData !== 'object') continue;

    for (const dayId of DAY_IDS) {
      const dayRaw = classData[dayId];
      if (dayRaw && !Array.isArray(dayRaw) && dayRaw.sameAs) {
        classes[classId][dayId] = { sameAs: sanitizeText(dayRaw.sameAs) };
        continue;
      }
      classes[classId][dayId] = normalizeDay(dayRaw, slotIds, issues, `${classId}/${dayId}`);
    }
  }

  resolveSameAsRefs(classes, issues);
  return classes;
}

export function parseAndNormalizeTimetable(rawData) {
  const issues = [];

  if (!rawData || typeof rawData !== 'object') {
    return {
      ok: false,
      issues: ['Stundenplan-Datei ist leer oder kein JSON-Objekt.'],
      model: {
        meta: {},
        timeslots: [...DEFAULT_TIMESLOTS],
        classes: createEmptyTimetable(),
        classIds: [...CLASSES]
      }
    };
  }

  const timeslots = normalizeTimeslots(rawData.timeslots, issues);
  const slotIds = new Set(timeslots.map((slot) => slot.id));
  const classes = normalizeClasses(rawData.classes, slotIds, issues);
  const classIds = Object.keys(classes);

  const hasAnyEntry = classIds.some((classId) =>
    DAY_IDS.some((dayId) => Array.isArray(classes[classId][dayId]) && classes[classId][dayId].length > 0)
  );

  const model = {
    meta: rawData.meta && typeof rawData.meta === 'object' ? rawData.meta : {},
    timeslots,
    classes,
    classIds
  };

  if (!hasAnyEntry) {
    issues.push('Keine Unterrichtseinträge erkannt. Bitte Datei/Format prüfen.');
  }

  return {
    ok: hasAnyEntry,
    issues,
    model
  };
}

export function hasTimetableEntries(classes) {
  if (!classes || typeof classes !== 'object') return false;
  return Object.values(classes).some((classDays) =>
    Object.values(classDays || EMPTY_DAY).some((entries) => Array.isArray(entries) && entries.length > 0)
  );
}
