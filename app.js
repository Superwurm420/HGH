/* HGH Schüler-PWA – vanilla JS, performance-optimiert & vereinfacht */

const APP = {
  name: 'HGH Hildesheim',
  version: '1.2.0',
  storageKeys: {
    theme: 'hgh_theme',
    classId: 'hgh_class',
    dayId: 'hgh_day',
    timetableCache: 'hgh_timetable_cache_v1',
    timetableCacheTs: 'hgh_timetable_cache_ts',
    announcementsCache: 'hgh_announcements_cache_v1'
  },
  routes: ['home', 'timetable', 'week', 'links'],
  constants: {
    COUNTDOWN_INTERVAL: 30000,
    ANNOUNCEMENTS_INTERVAL: 1000,
    ANNOUNCEMENTS_PREVIEW_LIMIT: 3,
    AUTO_REFRESH_INTERVAL: 5 * 60 * 1000,
    MIN_REFRESH_GAP: 60 * 1000
  }
};

// --- Data ---------------------------------------------------------------

// id === name, daher reichen Strings
const CLASSES = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];

const DAYS = [
  { id: 'mo', label: 'Montag' },
  { id: 'di', label: 'Dienstag' },
  { id: 'mi', label: 'Mittwoch' },
  { id: 'do', label: 'Donnerstag' },
  { id: 'fr', label: 'Freitag' }
];

const DAY_IDS = ['mo', 'di', 'mi', 'do', 'fr'];


const DEFAULT_TIMESLOTS = [
  { id: '1', time: '08:00–08:45' },
  { id: '2', time: '08:45–09:30' },
  { id: '3', time: '09:50–10:35' },
  { id: '4', time: '10:35–11:20' },
  { id: '5', time: '11:40–12:25' },
  { id: '6', time: '12:25–13:10' },
  { id: '7', time: 'Mittagspause' },
  { id: '8', time: '14:10–14:55' },
  { id: '9', time: '14:55–15:40' }
];

// Pre-computed Lookup-Strukturen (einmalig statt wiederholter .find()-Aufrufe)
const DOUBLE_PAIRS = { '1': '2', '3': '4', '5': '6', '8': '9' };
const SECOND_SLOTS = new Set(Object.values(DOUBLE_PAIRS));
const WEEK_PAIRS = [
  { first: '1', second: '2' },
  { first: '3', second: '4' },
  { first: '5', second: '6' },
  { first: '8', second: '9' }
];
const ROUTES_SET = new Set(APP.routes);
const DAY_NUM_MAP = { 1: 'mo', 2: 'di', 3: 'mi', 4: 'do', 5: 'fr' };
const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];
const WEEKDAY_LABELS = {
  mo: 'Montag',
  di: 'Dienstag',
  mi: 'Mittwoch',
  do: 'Donnerstag',
  fr: 'Freitag',
  sa: 'Samstag',
  so: 'Sonntag'
};
const CORS_PROXY = 'https://corsproxy.io/?url=';
const FUN_MESSAGES_URL = './data/fun-messages.json';
const ANNOUNCEMENTS_INDEX_URL = './data/announcements/index.json';
const MESSAGE_PHASES = ['beforeSchool', 'beforeLesson', 'duringLesson', 'betweenBlocks', 'lunch', 'afterSchool', 'weekend', 'holiday', 'noLessons'];
const CALENDAR_VISIBLE_WINDOW_DAYS = {
  past: 30,
  future: 400,
};
const DEFAULT_FUN_MESSAGES = {
  default: {
    beforeSchool: ['Guten Morgen – dein Tag startet gleich. ☀️'],
    beforeLesson: ['Gleich geht die nächste Stunde los. ⏱️'],
    duringLesson: ['Volle Konzentration in {subject}. 📚'],
    betweenBlocks: ['Kleine Pause – dann weiter. 💪'],
    lunch: ['Mittagspause – lass es dir schmecken! 🍽️'],
    afterSchool: ['Unterricht vorbei – guten Feierabend! 👋'],
    weekend: ['Wochenende-Modus aktiv – {weekdayLabel} gehört dir. 😎'],
    holiday: ['{holidayName} heute – genieße den freien Tag! 🎉'],
    noLessons: ['Für {weekdayLabel} sind keine Stunden geplant. 📅']
  }
};

// --- Calendar config ----------------------------------------------------

const CAL_CONFIGS = [
  {
    id: 'jahreskalender',
    label: 'Jahreskalender',
    icsUrl: 'https://calendar.google.com/calendar/ical/r1d6av3let2sjbfthapb5i87sg%40group.calendar.google.com/public/basic.ics',
    color: '#58b4ff',
  },
  {
    id: 'klausurenkalender',
    label: 'Klausurenkalender',
    icsUrl: 'https://calendar.google.com/calendar/ical/2jbkl2auqim9pb150rnd6tpnl8%40group.calendar.google.com/public/basic.ics',
    color: '#ff9966',
  },
];

// --- State --------------------------------------------------------------

const state = {
  timeslots: DEFAULT_TIMESLOTS,
  timeslotMap: new Map(DEFAULT_TIMESLOTS.map(s => [s.id, s])),
  timetable: null,
  classIds: [...CLASSES],
  selectedDayId: null,
  currentRoute: 'home',
  els: {},
  isLoading: false,
  autoRefreshTimer: null,
  lastSignature: null,
  lastRefreshAt: 0,
  installPromptEvent: null,
  countdownTimer: null,
  announcementsTimer: null,
  funMessages: DEFAULT_FUN_MESSAGES,
  currentPdfHref: null,
  hasTimetableData: false,
  announcements: [],
  announcementIssues: [],
  announcementsShowAll: false,
  cal: {
    events: {},
    enabled: {},
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    selectedDate: null,
  },
};

// --- Utils --------------------------------------------------------------

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Fachname bei '/' umbrechen → zwei Zeilen
function formatSubject(str) {
  if (!str) return '—';
  return str.split('/').map(p => escapeHtml(p.trim())).join('<br>');
}

// ISO-Kalenderwoche berechnen
function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getTodayId() {
  return DAY_NUM_MAP[new Date().getDay()] || 'mo';
}

function isWeekday() {
  const d = new Date().getDay();
  return d >= 1 && d <= 5;
}

function getDateByDayOffset(base, offsetDays) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

function getEasterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function getHolidayLabel(date) {
  const year = date.getFullYear();
  const fmt = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const fixed = {
    '01-01': 'Neujahr',
    '05-01': 'Tag der Arbeit',
    '10-03': 'Tag der Deutschen Einheit',
    '10-31': 'Reformationstag',
    '12-25': '1. Weihnachtstag',
    '12-26': '2. Weihnachtstag'
  };

  if (fixed[fmt]) return fixed[fmt];

  const easter = getEasterSunday(year);
  const movable = [
    { offset: -2, label: 'Karfreitag' },
    { offset: 1, label: 'Ostermontag' },
    { offset: 39, label: 'Christi Himmelfahrt' },
    { offset: 50, label: 'Pfingstmontag' }
  ];

  for (const h of movable) {
    const d = getDateByDayOffset(easter, h.offset);
    if (d.toDateString() === date.toDateString()) return h.label;
  }

  return '';
}

function safeSetText(el, text) {
  if (el) el.textContent = text;
}

// localStorage-Helper: eliminiert repetitive try/catch-Blöcke
function storageGet(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); }
  catch { /* quota/private mode */ }
}

function formatTeacherRoom(teacher, room) {
  const parts = [];
  if (teacher) parts.push(teacher);
  if (room) parts.push(String(room));
  return parts.join(' / ');
}

function isValidTimetableData(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.timeslots && !Array.isArray(data.timeslots)) return false;
  if (data.classes && typeof data.classes !== 'object') return false;
  return true;
}

function getAvailableClasses() {
  if (Array.isArray(state.classIds) && state.classIds.length) return state.classIds;
  return CLASSES;
}

// Befüllt ein <select> mit Klassen-Optionen (DRY)
function populateClassSelect(sel) {
  if (!sel) return;
  const classIds = getAvailableClasses();
  sel.innerHTML = classIds.map(c =>
    `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
  ).join('');
}

function parseAnnouncementDate(value, endOfDay = false) {
  if (!value || typeof value !== 'string') return null;
  const input = value.trim();

  let y; let mo; let d; let h; let mi;
  let hasTime = false;

  let m = input.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}))?$/);
  if (m) {
    [, y, mo, d, h, mi] = m;
    hasTime = typeof h !== 'undefined';
  } else {
    m = input.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
    if (!m) return null;
    [, d, mo, y, h, mi] = m;
    hasTime = typeof h !== 'undefined';
  }

  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = hasTime ? Number(h) : (endOfDay ? 23 : 0);
  const minute = hasTime ? Number(mi) : (endOfDay ? 59 : 0);
  const second = hasTime ? 0 : (endOfDay ? 59 : 0);
  const ms = hasTime ? 0 : (endOfDay ? 999 : 0);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, second, ms);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function announcementHasTime(value) {
  return typeof value === 'string' && /(?:[T\s]|\s)(\d{1,2}):(\d{2})$/.test(value.trim());
}

function formatAnnouncementDateLabel(rawValue, endOfDayFallback = false) {
  const date = parseAnnouncementDate(rawValue, endOfDayFallback);
  if (!date) return '';

  const dateLabel = date.toLocaleDateString('de-DE');
  if (announcementHasTime(rawValue)) {
    const timeLabel = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')} Uhr`;
    return `${dateLabel}, ${timeLabel}`;
  }
  return dateLabel;
}

function isAnnouncementActive(item, now = new Date()) {
  if (!item || item.visible === false) return false;

  const start = parseAnnouncementDate(item.startDate, false);
  const end = parseAnnouncementDate(item.endDate, true);

  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function normalizeAnnouncementItem(item, index = 0) {
  const title = (item?.title || item?.titel || item?.ueberschrift || '').toString().trim();
  const text = (item?.text || item?.inhalt || item?.nachricht || '').toString().trim();
  const sortRaw = item?.sortOrder ?? item?.sort ?? item?.reihenfolge;
  const sortOrder = Number.isFinite(Number(sortRaw)) ? Number(sortRaw) : index;
  const visibleRaw = typeof item?.visible !== 'undefined' ? item.visible : item?.sichtbar;

  const location = (item?.location || item?.ort || item?.raum || '').toString().trim();

  return {
    id: (item?.id || item?.name || `announcement-${index + 1}`).toString(),
    title: title || 'Ankündigung',
    text: text || '',
    location,
    startDate: typeof (item?.startDate ?? item?.start ?? item?.beginn) === 'string' ? String(item?.startDate ?? item?.start ?? item?.beginn).trim() : '',
    endDate: typeof (item?.endDate ?? item?.ende ?? item?.end) === 'string' ? String(item?.endDate ?? item?.ende ?? item?.end).trim() : '',
    visible: parseBooleanLike(visibleRaw, true),
    sortOrder
  };
}

function normalizeAnnouncements(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, idx) => normalizeAnnouncementItem(item, idx))
    .filter(item => item.text && isAnnouncementActive(item))
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      const aEnd = parseAnnouncementDate(a.endDate, true)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bEnd = parseAnnouncementDate(b.endDate, true)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aEnd - bEnd;
    });
}

function getAnnouncementTimeLabel(item) {
  const start = parseAnnouncementDate(item.startDate, false);
  const end = parseAnnouncementDate(item.endDate, false);

  const startLabel = formatAnnouncementDateLabel(item.startDate, false);
  const endLabel = formatAnnouncementDateLabel(item.endDate, false);

  if (start && end) {
    return `${startLabel} – ${endLabel}`;
  }
  if (start) {
    return `ab ${startLabel}`;
  }
  if (end) {
    return `bis ${endLabel}`;
  }
  return 'ohne Datum';
}


function getAnnouncementStatus(item, now = new Date()) {
  const start = parseAnnouncementDate(item.startDate, false);
  const end = parseAnnouncementDate(item.endDate, true);

  if (start && now < start) return 'upcoming';
  if ((start && now >= start) || (!start && end && now <= end)) return 'active';
  return 'timeless';
}

function getNextAnnouncement(now = new Date()) {
  const upcoming = state.announcements
    .map(item => ({ item, start: parseAnnouncementDate(item.startDate, false) }))
    .filter(x => x.start && x.start > now)
    .sort((a, b) => a.start - b.start);
  return upcoming[0]?.item || null;
}

function parseBooleanLike(value, fallback = true) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'ja') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'nein') return false;
  return fallback;
}

function parseAnnouncementTxt(content) {
  const lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
  const meta = {};
  const bodyLines = [];
  let inBody = false;

  for (const line of lines) {
    if (!inBody && line.trim() === '---') {
      inBody = true;
      continue;
    }

    if (!inBody) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = match[2].trim();
      meta[key] = value;
      continue;
    }

    bodyLines.push(line);
  }

  const bodyText = bodyLines.join('\n').trim();
  if (bodyText) meta.text = bodyText;

  if (Object.keys(meta).length === 0) return null;
  if (!meta.text) {
    const fallbackText = String(content || '').trim();
    if (fallbackText) meta.text = fallbackText;
  }

  if (typeof meta.visible !== 'undefined') meta.visible = parseBooleanLike(meta.visible, true);
  if (typeof meta.sortOrder !== 'undefined') {
    const n = Number(meta.sortOrder);
    if (Number.isFinite(n)) meta.sortOrder = n;
  }

  return meta;
}

function parseAnnouncementByFileType(fileName, content) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.txt')) return parseAnnouncementTxt(content);
  if (lower.endsWith('.json')) return JSON.parse(content);

  try { return JSON.parse(content); }
  catch { return parseAnnouncementTxt(content); }
}

function collectAnnouncementIssuesFromItem(item, fileName) {
  const issues = [];
  const title = (item?.title || item?.titel || item?.ueberschrift || '').toString().trim();
  const text = (item?.text || item?.inhalt || item?.nachricht || '').toString().trim();
  const startSource = item?.startDate ?? item?.start ?? item?.beginn;
  const endSource = item?.endDate ?? item?.ende ?? item?.end;
  const startRaw = typeof startSource === 'string' ? String(startSource).trim() : '';
  const endRaw = typeof endSource === 'string' ? String(endSource).trim() : '';

  if (!title) issues.push(`Titel fehlt in Datei: ${fileName}`);
  if (!text) issues.push(`Text fehlt in Datei: ${fileName}`);

  if (startRaw && !parseAnnouncementDate(startRaw, false)) {
    issues.push(`Ungültiges Startdatum in Datei: ${fileName}`);
  }

  if (endRaw && !parseAnnouncementDate(endRaw, true)) {
    issues.push(`Ungültiges Enddatum in Datei: ${fileName}`);
  }

  const start = parseAnnouncementDate(startRaw, false);
  const end = parseAnnouncementDate(endRaw, true);
  if (start && end && start > end) {
    issues.push(`Startdatum liegt nach Enddatum in Datei: ${fileName}`);
  }

  return issues;
}

async function loadAnnouncements() {
  let rawItems = null;
  state.announcementIssues = [];

  try {
    const indexResp = await fetch(ANNOUNCEMENTS_INDEX_URL, { cache: 'no-cache' });
    if (!indexResp.ok) throw new Error(`HTTP ${indexResp.status}`);

    const indexData = await indexResp.json();
    const files = Array.isArray(indexData?.files) ? indexData.files : [];

    const loaded = await Promise.all(files.map(async (file) => {
      const name = typeof file === 'string' ? file : file?.file;
      if (!name) return null;

      const resp = await fetch(`./data/announcements/${name}`, { cache: 'no-cache' });
      if (!resp.ok) {
        state.announcementIssues.push(`Datei fehlt oder nicht lesbar: ${name}`);
        return null;
      }

      try {
        const content = await resp.text();
        const parsed = parseAnnouncementByFileType(name, content);
        if (!parsed) {
          state.announcementIssues.push(`Datei ohne gültigen Inhalt: ${name}`);
          return null;
        }

        const itemIssues = collectAnnouncementIssuesFromItem(parsed, name);
        for (const issue of itemIssues) state.announcementIssues.push(issue);

        return parsed;
      } catch {
        state.announcementIssues.push(`Formatfehler in Datei: ${name}`);
        return null;
      }
    }));

    rawItems = loaded.filter(Boolean);
    storageSet(APP.storageKeys.announcementsCache, JSON.stringify(rawItems));
  } catch (e) {
    console.warn('Ankündigungen konnten nicht vom Netzwerk geladen werden:', e);
    state.announcementIssues.push('Ankündigungen wurden aus dem Cache geladen.');
    try {
      const cached = storageGet(APP.storageKeys.announcementsCache);
      if (cached) rawItems = JSON.parse(cached);
    } catch {
      rawItems = [];
    }
  }

  state.announcementsShowAll = false;
  state.announcements = normalizeAnnouncements(rawItems || []);
}

// --- Theme --------------------------------------------------------------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  storageSet(APP.storageKeys.theme, theme);
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#0b5cff');
}

function initTheme() {
  const saved = storageGet(APP.storageKeys.theme);
  if (saved === 'light' || saved === 'dark') return applyTheme(saved);
  const prefersLight = window.matchMedia?.('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}

function initThemeToggle() {
  state.els.darkToggle?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });
}

// --- Timetable loader ---------------------------------------------------

function ensureEmptyTimetable() {
  const empty = {};
  for (const c of CLASSES) {
    empty[c] = { mo: [], di: [], mi: [], do: [], fr: [] };
  }
  return empty;
}

function applyTimetableData(data) {
  if (!isValidTimetableData(data)) {
    state.timeslots = DEFAULT_TIMESLOTS;
    state.timeslotMap = new Map(DEFAULT_TIMESLOTS.map(s => [s.id, s]));
    state.timetable = ensureEmptyTimetable();
    return;
  }

  if (Array.isArray(data?.timeslots) && data.timeslots.length) {
    state.timeslots = data.timeslots;
  } else {
    state.timeslots = DEFAULT_TIMESLOTS;
  }
  state.timeslotMap = new Map(state.timeslots.map(s => [s.id, s]));

  const classes = data?.classes || ensureEmptyTimetable();
  const dynamicClassIds = Object.keys(classes || {});
  state.classIds = dynamicClassIds.length ? dynamicClassIds : [...CLASSES];

  // sameAs-Referenzen auflösen
  for (const cls of Object.keys(classes)) {
    for (const day of DAY_IDS) {
      const entry = classes[cls][day];
      if (entry && !Array.isArray(entry) && entry.sameAs) {
        const ref = classes[entry.sameAs]?.[day];
        classes[cls][day] = Array.isArray(ref) ? ref : [];
      }
    }
  }

  state.timetable = classes;
  state.hasTimetableData = Object.values(classes).some(cls =>
    Object.values(cls || {}).some(day => Array.isArray(day) && day.length > 0)
  );

  // PDF-Links aktualisieren
  state.currentPdfHref = data?.meta?.source ? `./plan/${data.meta.source}` : null;
  for (const link of qsa('a[data-pdf-link]')) {
    if (state.currentPdfHref) {
      link.href = state.currentPdfHref;
      link.removeAttribute('aria-disabled');
    } else {
      link.href = '#';
      link.setAttribute('aria-disabled', 'true');
    }
  }

  // Aktualisierungsdatum anzeigen
  const lastUpdEl = qs('#ttLastUpdated');
  if (lastUpdEl && data?.meta?.updatedAt) {
    const d = new Date(data.meta.updatedAt);
    lastUpdEl.textContent = `Aktualisiert ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  }
}

function getTimetableSignature(data) {
  const m = data?.meta || {};
  const count = data?.classes ? Object.keys(data.classes).length : 0;
  return `${m.updatedAt || 'n/a'}|${m.source || 'n/a'}|${count}`;
}

async function loadTimetable({ forceNetwork = false } = {}) {
  if (state.isLoading) return { source: 'skip' };
  state.isLoading = true;

  let lastError = null;

  if (!forceNetwork && navigator.onLine === false) {
    lastError = new Error('offline');
  } else {
    try {
      const res = await fetch('./data/timetable.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!isValidTimetableData(data)) throw new Error('Ungültige Datenstruktur');

      const sig = getTimetableSignature(data);
      const changed = sig !== state.lastSignature;

      applyTimetableData(data);
      state.lastSignature = sig;
      state.lastRefreshAt = Date.now();

      storageSet(APP.storageKeys.timetableCache, JSON.stringify(data));
      storageSet(APP.storageKeys.timetableCacheTs, new Date().toISOString());

      state.isLoading = false;
      return { source: 'network', changed };
    } catch (e) {
      lastError = e;
      console.warn('Netzwerk-Fehler:', e);
    }
  }

  // Cache-Fallback
  try {
    const cached = storageGet(APP.storageKeys.timetableCache);
    if (cached) {
      const data = JSON.parse(cached);
      if (!isValidTimetableData(data)) throw new Error('Ungültige Cache-Daten');

      const sig = getTimetableSignature(data);
      const changed = sig !== state.lastSignature;

      applyTimetableData(data);
      state.lastSignature = sig;
      state.isLoading = false;
      return { source: 'cache', changed };
    }
  } catch (e) {
    console.warn('Cache-Fehler:', e);
  }

  applyTimetableData({ timeslots: DEFAULT_TIMESLOTS, classes: ensureEmptyTimetable() });
  state.lastSignature = null;
  state.isLoading = false;
  return { source: 'empty', changed: true };
}

async function refreshTimetableIfNeeded({ forceNetwork = false, silent = false } = {}) {
  if (!forceNetwork && Date.now() - state.lastRefreshAt < APP.constants.MIN_REFRESH_GAP) return;

  const result = await loadTimetable({ forceNetwork });
  if (result.source === 'skip') return;

  if (result.changed || result.source === 'empty') {
    render();
    if (!silent) console.log(`[Timetable] Aktualisiert via ${result.source}`);
  }
}

function initAutoRefresh() {
  if (state.autoRefreshTimer) clearInterval(state.autoRefreshTimer);

  const refresh = () => {
    if (document.hidden || !navigator.onLine) return;
    refreshTimetableIfNeeded({ forceNetwork: true, silent: true });
  };

  state.autoRefreshTimer = setInterval(refresh, APP.constants.AUTO_REFRESH_INTERVAL);

  // Visibility + Online als Trigger
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
  window.addEventListener('online', refresh);
}

// --- Navigation ---------------------------------------------------------

function setRoute(route) {
  state.currentRoute = route;
  for (const b of state.els.navItems) {
    b.setAttribute('aria-current', b.dataset.route === route ? 'page' : 'false');
  }
  for (const v of state.els.views) {
    v.hidden = v.dataset.view !== route;
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  history.replaceState?.(null, '', `#${route}`);
}

function initNav() {
  for (const btn of state.els.navItems) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setRoute(btn.dataset.route);
    });
  }

  window.addEventListener('hashchange', () => {
    const route = (location.hash || '#home').slice(1);
    if (ROUTES_SET.has(route)) setRoute(route);
  });

  const initial = (location.hash || '#home').slice(1);
  setRoute(ROUTES_SET.has(initial) ? initial : 'home');
}

// --- Renderer -----------------------------------------------------------

function render() {
  renderTimetable();
  renderTodayPreview();
  renderWeek();
  renderAnnouncements();
}

function renderTimetable() {
  const classId = state.els.classSelect?.value || 'HT11';
  const dayId = state.selectedDayId || getTodayId();
  const body = state.els.timetableBody;
  if (!body) return;

  if (!state.hasTimetableData) {
    body.innerHTML = `
      <div class="timetableEmpty" role="status">
        <p>Keine Stundenplan-Daten verfügbar.</p>
        <button class="btn secondary" id="retryInline" type="button">Erneut laden</button>
      </div>`;
    qs('#retryInline')?.addEventListener('click', async () => {
      const btn = qs('#retryInline');
      if (btn) { btn.disabled = true; btn.textContent = 'Lädt…'; }
      await loadTimetable({ forceNetwork: true });
      render();
    });
    return;
  }

  const rows = state.timetable?.[classId]?.[dayId] || [];
  if (!rows.length) {
    body.innerHTML = `
      <div class="tr trPlaceholder" role="row" aria-live="polite" aria-label="Kein Unterricht">
        <div class="td tdTime"><span class="timeFrom">—</span><span class="small muted">—</span></div>
        <div class="td">Kein Unterricht</div>
        <div class="td tdMeta"><small>—</small><small class="muted">—</small></div>
      </div>`;
    return;
  }
  const bySlot = new Map(rows.map(r => [r.slotId, r]));
  const skip = new Set();
  const currentPairStart = getCurrentPairStartSlot(dayId);

  const metaCell = (teacher, room) => {
    const t = teacher ? teacher.split('/').map(x => `<small>${escapeHtml(x.trim())}</small>`).join('<br>') : '<small>—</small>';
    const r = room ? `<small class="muted">${escapeHtml(String(room))}</small>` : '<small class="muted">&nbsp;</small>';
    return `<div class="td tdMeta"><div>${t}</div><div>${r}</div></div>`;
  };

  const slotsToRender = state.timeslots.filter(s => s.id !== '7' && rows.some(r => r.slotId === s.id || r.slotId === DOUBLE_PAIRS[s.id]));

  body.innerHTML = slotsToRender.map(s => {
    if (skip.has(s.id)) return '';

    const r = bySlot.get(s.id);
    const secondId = DOUBLE_PAIRS[s.id];
    const secondSlot = secondId ? state.timeslotMap.get(secondId) : null;
    const hasSecondRow = secondId ? bySlot.has(secondId) : false;
    const noteClass = r?.note ? ' note' : '';
    const currentClass = currentPairStart === s.id ? ' current' : '';

    if (r && secondSlot && hasSecondRow) {
      skip.add(secondId);
      const timeFrom = s.time.split('–')[0];
      const timeTo = secondSlot.time.split('–')[1];
      return `
        <div class="tr${noteClass}${currentClass}" role="row" aria-label="Stunde ${escapeHtml(s.id)}+${escapeHtml(secondId)}">
          <div class="td tdTime"><span class="timeFrom">${escapeHtml(timeFrom)}</span><span class="small muted">${escapeHtml(timeTo)}</span></div>
          <div class="td">${formatSubject(r?.subject)}</div>
          ${metaCell(r?.teacher, r?.room)}
        </div>`;
    }

    const [tFrom, tTo] = s.time.split('–');
    return `
      <div class="tr${noteClass}${currentClass}" role="row" aria-label="Stunde ${escapeHtml(s.id)}: ${escapeHtml(s.time)}">
        <div class="td tdTime"><span class="timeFrom">${escapeHtml(tFrom)}</span>${tTo ? `<span class="small muted">${escapeHtml(tTo)}</span>` : ''}</div>
        <div class="td">${formatSubject(r?.subject)}</div>
        ${metaCell(r?.teacher, r?.room)}
      </div>`;
  }).join('');
}

function renderTodayPreview() {
  const todayId = getTodayId();
  const { todayWeekday, todayPreview: list } = state.els;
  if (!list) return;

  const classId = state.els.todayClassSelect?.value || storageGet(APP.storageKeys.classId) || 'HT11';
  const displayDate = new Date();
  const dayLabel = !isWeekday() ? 'Nächster Schultag (Montag)' : (DAYS.find(d => d.id === todayId)?.label || 'Heute');
  const dateLabel = displayDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  safeSetText(todayWeekday, `${dayLabel}, ${dateLabel} · KW ${getISOWeek(displayDate)}`);

  const allRows = (state.timetable?.[classId]?.[todayId] || [])
    .filter(r => r.slotId !== '7');

  // Nur erste Stunde jedes Doppelstunden-Paares behalten
  const merged = allRows.filter(r => !SECOND_SLOTS.has(r.slotId)).slice(0, 4);

  if (!merged.length) {
    list.innerHTML = `
      <div class="listItem listItemPlaceholder" role="status" aria-live="polite">
        <div>
          <div class="small muted">Std. —</div>
          <div class="timeFrom">—</div>
        </div>
        <div class="subjectCol">
          <div>Kein Unterricht</div>
          <div class="sub muted">Für diesen Tag sind keine Stunden eingetragen.</div>
        </div>
        <div class="metaCol">
          <div class="sub">—</div>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = merged.map(r => {
    const subject = r?.subject ?? '—';
    const teacherLines = r?.teacher ? r.teacher.split('/').map(t => escapeHtml(t.trim())) : [];
    const roomStr = r?.room ? escapeHtml(String(r.room)) : '';
    const teacherHtml = teacherLines.length ? teacherLines.join('<br>') : '—';

    const secondId = DOUBLE_PAIRS[r.slotId];
    const slotLabel = secondId ? `${r.slotId}/${secondId}` : r.slotId;
    const noteClass = r.note ? ' note' : '';
    const noteHtml = r.note ? `<div class="sub">${escapeHtml(r.note)}</div>` : '';

    const firstSlot = state.timeslotMap.get(r.slotId);
    let timeFrom, timeTo;
    if (secondId) {
      timeFrom = (firstSlot?.time || '').split('–')[0];
      timeTo = (state.timeslotMap.get(secondId)?.time || '').split('–')[1];
    } else {
      [timeFrom, timeTo] = (firstSlot?.time || '').split('–');
    }

    return `
    <div class="listItem${noteClass}">
      <div>
        <div class="small muted">Std. ${escapeHtml(slotLabel)}</div>
        <div class="timeFrom">${escapeHtml(timeFrom || '—')}</div>
        ${timeTo ? `<div class="small muted">${escapeHtml(timeTo)}</div>` : ''}
      </div>
      <div class="subjectCol">
        <div>${formatSubject(subject)}</div>
        ${noteHtml}
      </div>
      <div class="metaCol">
        <div class="sub">${teacherHtml}</div>
        ${roomStr ? `<div class="sub">${roomStr}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderAnnouncements() {
  const card = state.els.announcementsCard;
  const list = state.els.announcementsList;
  const issuesEl = state.els.announcementsIssues;
  const nextEl = state.els.announcementsNext;
  const moreBtn = state.els.announcementsMoreBtn;

  if (!card || !list || !issuesEl || !nextEl || !moreBtn) return;

  card.hidden = false;

  if (!state.announcements.length) {
    list.innerHTML = '<article class="announcementItem" role="listitem"><h3>Aktuell keine Termine/Ankündigungen</h3></article>';
    issuesEl.hidden = true;
    issuesEl.innerHTML = '';
    nextEl.hidden = true;
    nextEl.innerHTML = '';
    moreBtn.hidden = true;
    moreBtn.onclick = null;
    return;
  }

  if (state.announcementIssues.length) {
    issuesEl.hidden = false;
    issuesEl.innerHTML = `<strong>Hinweis:</strong><ul>${state.announcementIssues.map(msg => `<li>${escapeHtml(msg)}</li>`).join('')}</ul>`;
  } else {
    issuesEl.hidden = true;
    issuesEl.innerHTML = '';
  }

  const nextItem = getNextAnnouncement();
  if (nextItem) {
    nextEl.hidden = false;
    nextEl.innerHTML = `
      <p class="announcementNextLabel">Nächster Termin</p>
      <h3>${escapeHtml(nextItem.title)}</h3>
      <p class="announcementMeta">${escapeHtml(getAnnouncementTimeLabel(nextItem))}</p>
      <p class="announcementCountdown announcementCountdown--upcoming">${escapeHtml(getAnnouncementCountdownLabel(nextItem))}</p>
    `;
  } else {
    nextEl.hidden = true;
    nextEl.innerHTML = '';
  }

  const limit = APP.constants.ANNOUNCEMENTS_PREVIEW_LIMIT; // aktuell 3
  const visibleItems = state.announcementsShowAll ? state.announcements : state.announcements.slice(0, limit);

  list.innerHTML = visibleItems.map((item) => {
    const status = getAnnouncementStatus(item);
    const locationHtml = item.location ? `<p class="announcementLocation">Ort: ${escapeHtml(item.location)}</p>` : '';
    return `
      <article class="announcementItem" role="listitem">
        <p class="announcementMeta">${escapeHtml(getAnnouncementTimeLabel(item))}</p>
        <p class="announcementCountdown announcementCountdown--${escapeHtml(status)}" data-announcement-id="${escapeHtml(item.id)}"></p>
        <h3>${escapeHtml(item.title)}</h3>
        ${locationHtml}
        <p>${escapeHtml(item.text)}</p>
      </article>
    `;
  }).join('');

  if (state.announcements.length > 3) {
    moreBtn.hidden = false;
    moreBtn.textContent = state.announcementsShowAll ? 'Weniger anzeigen' : `Mehr anzeigen (${state.announcements.length - limit})`;
    moreBtn.onclick = () => {
      state.announcementsShowAll = !state.announcementsShowAll;
      renderAnnouncements();
    };
  } else {
    moreBtn.hidden = true;
    moreBtn.onclick = null;
  }

  updateAnnouncementCountdowns();
}

// --- Selects ------------------------------------------------------------

function setActiveDayButton(dayId) {
  for (const btn of state.els.dayButtons || []) {
    const active = btn.dataset.day === dayId;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  }
}

function updateCurrentDayInfo() {
  const el = state.els.currentDayInfo;
  if (!el) return;

  const selectedDayId = state.selectedDayId || getTodayId();
  const day = DAYS.find(d => d.id === selectedDayId);
  if (!day) {
    el.textContent = '—';
    return;
  }

  const today = new Date();
  const todayDayNum = today.getDay();
  const selectedDayNum = DAYS.findIndex(d => d.id === selectedDayId) + 1;
  const diff = selectedDayNum - todayDayNum;

  const selectedDate = new Date(today);
  selectedDate.setHours(0, 0, 0, 0);
  selectedDate.setDate(today.getDate() + diff);

  const dateLabel = selectedDate.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  const href = state.currentPdfHref || '#';
  const disabledAttr = state.currentPdfHref ? '' : ' aria-disabled="true"';
  el.innerHTML = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener" data-pdf-link${disabledAttr}>${escapeHtml(day.label)}, ${escapeHtml(dateLabel)} · KW ${getISOWeek(selectedDate)}</a>`;
}

// Synchronisiert beide Klassen-Selects und speichert
function syncClassSelects(changedSel) {
  const val = changedSel.value;
  storageSet(APP.storageKeys.classId, val);

  const other = (changedSel === state.els.classSelect) ? state.els.weekClassSelect : state.els.classSelect;
  if (other) other.value = val;
  if (state.els.todayClassSelect && state.els.todayClassSelect !== changedSel) {
    state.els.todayClassSelect.value = val;
  }

  render();
}

function initSelects() {
  const { classSelect, todayClassSelect } = state.els;
  if (!classSelect) return;

  populateClassSelect(classSelect);
  populateClassSelect(todayClassSelect);

  const classIds = getAvailableClasses();
  const fallbackClass = classIds[0] || 'HT11';
  const savedClass = storageGet(APP.storageKeys.classId) || fallbackClass;
  const savedDay = storageGet(APP.storageKeys.dayId) || getTodayId();

  const initialClass = classIds.includes(savedClass) ? savedClass : fallbackClass;
  classSelect.value = initialClass;
  if (todayClassSelect) todayClassSelect.value = initialClass;

  state.selectedDayId = DAY_IDS.includes(savedDay) ? savedDay : 'mo';
  setActiveDayButton(state.selectedDayId);
  updateCurrentDayInfo();

  classSelect.addEventListener('change', () => syncClassSelects(classSelect));
  todayClassSelect?.addEventListener('change', () => {
    const val = todayClassSelect.value;
    storageSet(APP.storageKeys.classId, val);
    classSelect.value = val;
    if (state.els.weekClassSelect) state.els.weekClassSelect.value = val;
    render();
  });

  for (const btn of state.els.dayButtons || []) {
    btn.addEventListener('click', () => {
      const dayId = btn.dataset.day;
      if (!dayId) return;
      state.selectedDayId = dayId;
      storageSet(APP.storageKeys.dayId, dayId);
      setActiveDayButton(dayId);
      updateCurrentDayInfo();
      renderTimetable();
    });
  }

}

// --- Countdown ----------------------------------------------------------

function parseSlotRange(range, base = new Date()) {
  const m = String(range).match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  if (!m) return null;

  const [sh, sm] = m[1].split(':').map(Number);
  const [eh, em] = m[2].split(':').map(Number);

  const start = new Date(base); start.setHours(sh, sm, 0, 0);
  const end = new Date(base); end.setHours(eh, em, 0, 0);
  return { start, end };
}

function diffMinsCeil(a, b) {
  return Math.max(0, Math.ceil((b - a) / 60000));
}
function formatCountdownDistance(ms) {
  const totalMins = Math.max(0, Math.ceil(ms / 60000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  const parts = [];
  if (days) parts.push(`${days} Tag${days === 1 ? '' : 'e'}`);
  if (hours) parts.push(`${hours} Std`);
  parts.push(`${mins} Min`);
  return parts.join(' ');
}

function getAnnouncementCountdownLabel(item, now = new Date()) {
  const start = parseAnnouncementDate(item.startDate, false);
  const end = parseAnnouncementDate(item.endDate, true);

  if (start && now < start) {
    return `Startet in ${formatCountdownDistance(start - now)}`;
  }

  if (start && end && now >= start && now <= end) {
    return `Läuft gerade · endet in ${formatCountdownDistance(end - now)}`;
  }

  if (start && !end && now >= start) {
    return 'Bereits gestartet';
  }

  if (!start && end && now <= end) {
    return `Endet in ${formatCountdownDistance(end - now)}`;
  }

  return 'Ohne Termin';
}

function updateAnnouncementCountdowns(now = new Date()) {
  for (const el of qsa('[data-announcement-id]')) {
    const item = state.announcements.find(a => a.id === el.dataset.announcementId);
    if (!item) continue;
    const status = getAnnouncementStatus(item, now);
    el.classList.remove('announcementCountdown--upcoming', 'announcementCountdown--active', 'announcementCountdown--timeless');
    el.classList.add(`announcementCountdown--${status}`);
    el.textContent = getAnnouncementCountdownLabel(item, now);
  }
}


function getDayRanges(base = new Date()) {
  const ranges = [];
  for (const s of state.timeslots) {
    if (s.id === '7') continue;
    const r = parseSlotRange(s.time, base);
    if (r) ranges.push({ slotId: s.id, ...r });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function getClassDayRanges(classId, dayId, base = new Date()) {
  const rows = (state.timetable?.[classId]?.[dayId] || [])
    .filter(r => r && r.slotId && String(r.slotId) !== '7');

  const uniqueBySlot = new Map(rows.map(r => [String(r.slotId), r]));

  return [...uniqueBySlot.values()]
    .map(r => {
      const slot = state.timeslotMap.get(String(r.slotId));
      const range = parseSlotRange(slot?.time || '', base);
      return range ? { slotId: String(r.slotId), ...range } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function getCurrentPairStartSlot(dayId, now = new Date()) {
  if (!isWeekday() || dayId !== getTodayId()) return null;
  const ranges = getDayRanges(now);
  const current = ranges.find(r => now >= r.start && now < r.end);
  if (!current) return null;

  for (const pair of WEEK_PAIRS) {
    if (current.slotId === pair.first || current.slotId === pair.second) return pair.first;
  }
  return current.slotId;
}

function updateCountdown() {
  const { nowTime: nowEl, countdownText: textEl } = state.els;
  const now = new Date();
  updateAnnouncementCountdowns(now);
  if (!nowEl || !textEl) return;

  nowEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!isWeekday()) { textEl.textContent = 'Schönes Wochenende! 🎉'; return; }

  const classId = state.els.todayClassSelect?.value || state.els.classSelect?.value || 'HT11';
  const dayId = getTodayId();
  const ranges = getClassDayRanges(classId, dayId, now);

  if (!ranges.length) {
    textEl.textContent = 'Kein Unterricht';
    return;
  }

  if (now < ranges[0].start) {
    textEl.textContent = `Unterricht startet in ${diffMinsCeil(now, ranges[0].start)} Min`;
    return;
  }

  if (now >= ranges[ranges.length - 1].end) {
    textEl.textContent = 'Schultag vorbei 👋';
    return;
  }

  const currentIndex = ranges.findIndex(r => now >= r.start && now < r.end);
  const current = currentIndex >= 0 ? ranges[currentIndex] : null;
  if (current) {
    const partnerId = DOUBLE_PAIRS[current.slotId];
    const partner = partnerId ? ranges.find(r => r.slotId === partnerId) : null;
    textEl.textContent = `Unterricht endet in ${diffMinsCeil(now, partner ? partner.end : current.end)} Min`;
    return;
  }

  const nextIndex = ranges.findIndex(r => now < r.start);
  const next = nextIndex >= 0 ? ranges[nextIndex] : null;
  if (next) {
    textEl.textContent = `Pause endet in ${diffMinsCeil(now, next.start)} Min`;
    return;
  }

  textEl.textContent = 'Schultag vorbei 👋';
}

function chooseMessage(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const daySeed = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return list[Number(daySeed) % list.length] || list[0];
}

function toMessageList(input, fallback = []) {
  if (Array.isArray(input)) return input.filter(Boolean).map(x => String(x));
  if (typeof input === 'string' && input.trim()) return [input.trim()];
  return [...fallback];
}

function normalizeMessageBuckets(raw) {
  const fallback = DEFAULT_FUN_MESSAGES.default;
  const common = toMessageList(raw?.all);
  const normalized = {};

  for (const phase of MESSAGE_PHASES) {
    const merged = [
      ...toMessageList(raw?.[phase], fallback[phase]),
      ...common
    ];
    normalized[phase] = merged.length ? merged : [...fallback[phase]];
  }

  return normalized;
}

function formatFunMessage(msg, ctx) {
  return String(msg)
    .replaceAll('{classId}', ctx.classId)
    .replaceAll('{subject}', ctx.subject)
    .replaceAll('{nextSubject}', ctx.nextSubject)
    .replaceAll('{slotLabel}', ctx.slotLabel)
    .replaceAll('{holidayName}', ctx.holidayName)
    .replaceAll('{weekdayLabel}', ctx.weekdayLabel);
}

function getMessagePhase(now, scheduleRows) {
  const holidayName = getHolidayLabel(now);
  if (holidayName) return 'holiday';
  if (!isWeekday()) return 'weekend';
  if (!scheduleRows.length) return 'noLessons';

  const parsed = scheduleRows
    .map(r => ({ row: r, range: parseSlotRange(state.timeslotMap.get(String(r.slotId))?.time || '', now) }))
    .filter(x => x.range)
    .sort((a, b) => a.range.start - b.range.start);

  if (!parsed.length) return now.getHours() < 15 ? 'beforeSchool' : 'afterSchool';

  if (now < parsed[0].range.start) return 'beforeSchool';
  if (now >= parsed[parsed.length - 1].range.end) return 'afterSchool';

  const current = parsed.find(x => now >= x.range.start && now < x.range.end);
  if (current) return 'duringLesson';

  const next = parsed.find(x => now < x.range.start);
  if (next) {
    const minutesToNext = diffMinsCeil(now, next.range.start);
    if (minutesToNext >= 25) return 'lunch';
    return 'beforeLesson';
  }

  return 'betweenBlocks';
}

function getFunMessage(now = new Date()) {
  const classId = state.els.todayClassSelect?.value || state.els.classSelect?.value || 'HT11';
  const activeDayId = state.currentRoute === 'timetable' && state.selectedDayId ? state.selectedDayId : getTodayId();
  const rows = (state.timetable?.[classId]?.[activeDayId] || []).filter(r => r && r.subject);
  const parsed = rows
    .map(r => ({ row: r, range: parseSlotRange(state.timeslotMap.get(String(r.slotId))?.time || '', now) }))
    .filter(x => x.range)
    .sort((a, b) => a.range.start - b.range.start);

  const phase = getMessagePhase(now, rows);
  const defaultBuckets = normalizeMessageBuckets(state.funMessages?.default);
  const pool = defaultBuckets[phase];

  const current = parsed.find(x => now >= x.range.start && now < x.range.end);
  const next = parsed.find(x => now < x.range.start);
  const slotLabel = current ? `Std. ${current.row.slotId}` : (next ? `Std. ${next.row.slotId}` : 'heute');
  const ctx = {
    classId,
    subject: current?.row?.subject || next?.row?.subject || 'dem Unterricht',
    nextSubject: next?.row?.subject || 'deiner nächsten Stunde',
    slotLabel,
    holidayName: getHolidayLabel(now) || 'Feiertag',
    weekdayLabel: WEEKDAY_LABELS[activeDayId] || WEEKDAY_LABELS[getTodayId()] || 'heute'
  };

  return formatFunMessage(chooseMessage(pool), ctx);
}

async function loadFunMessages() {
  try {
    const res = await fetch(FUN_MESSAGES_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    const json = await res.json();
    state.funMessages = {
      default: normalizeMessageBuckets(json?.default)
    };
  } catch {
    state.funMessages = DEFAULT_FUN_MESSAGES;
  }
}

function initCountdown() {
  const tick = () => {
    updateCountdown();
    safeSetText(state.els.funMessage, getFunMessage());
  };
  tick();
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(tick, APP.constants.COUNTDOWN_INTERVAL);

  if (state.announcementsTimer) clearInterval(state.announcementsTimer);
  state.announcementsTimer = setInterval(() => updateAnnouncementCountdowns(new Date()), APP.constants.ANNOUNCEMENTS_INTERVAL);
}

// --- Network indicator --------------------------------------------------

function updateNetworkIndicator() {
  const { netIndicator: ind, netLabel: label } = state.els;
  if (!ind || !label) return;
  const online = navigator.onLine;
  ind.dataset.status = online ? 'online' : 'offline';
  label.textContent = online ? 'Online' : 'Offline';
}

function initNetworkIndicator() {
  updateNetworkIndicator();
  window.addEventListener('online', updateNetworkIndicator);
  window.addEventListener('offline', updateNetworkIndicator);
}

function initPdfLinkGuards() {
  const disabledLinkSelector = 'a[data-pdf-link][aria-disabled="true"]';

  document.addEventListener('click', (e) => {
    const disabledPdfLink = e.target.closest?.(disabledLinkSelector);
    if (disabledPdfLink) e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const disabledPdfLink = e.target.closest?.(disabledLinkSelector);
    if (!disabledPdfLink) return;
    e.preventDefault();
  });
}

// --- Calendar -----------------------------------------------------------

function parseICSDate(s) {
  if (!s) return null;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  if (s.includes('T')) {
    const m = s.match(/^\d{8}T(\d{2})(\d{2})(\d{2})?Z?$/);
    const h = m ? +m[1] : 0;
    const mi = m ? +m[2] : 0;
    const sec = m && m[3] ? +m[3] : 0;
    return s.endsWith('Z') ? new Date(Date.UTC(y, mo, d, h, mi, sec)) : new Date(y, mo, d, h, mi, sec);
  }
  return new Date(y, mo, d);
}

function isMidnightTimestamp(raw) {
  const m = raw?.match(/^\d{8}T(\d{2})(\d{2})(\d{2})?Z?$/);
  if (!m) return false;
  return m[1] === '00' && m[2] === '00' && (!m[3] || m[3] === '00');
}

function isPseudoAllDayEvent(dtstartRaw, dtendRaw, start, end) {
  if (!start || !end) return false;
  if (!dtstartRaw?.includes('T') || !dtendRaw?.includes('T')) return false;
  if (!isMidnightTimestamp(dtstartRaw) || !isMidnightTimestamp(dtendRaw)) return false;
  const durationMs = end.getTime() - start.getTime();
  return durationMs >= 864e5 && durationMs % 864e5 === 0;
}

function parseICSTimestampKey(raw) {
  if (!raw) return '';
  const dateOnly = raw.match(/^\d{8}$/);
  if (dateOnly) return `${raw}T000000`;
  const timed = raw.match(/^(\d{8}T\d{6})Z?$/);
  return timed ? timed[1] : raw;
}

function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const unescape = s => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
  const events = [];
  const cancellations = new Set();
  const cancellationStarts = new Set();
  const now = new Date();
  const minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - CALENDAR_VISIBLE_WINDOW_DAYS.past);
  const maxDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + CALENDAR_VISIBLE_WINDOW_DAYS.future);
  const blocks = unfolded.split('BEGIN:VEVENT');

  const readProps = (vevent) => {
    const props = [];
    const lines = vevent.split(/\r?\n/);
    for (const line of lines) {
      const sep = line.indexOf(':');
      if (sep <= 0) continue;
      const left = line.slice(0, sep);
      const value = line.slice(sep + 1).trim();
      const [name] = left.split(';');
      props.push({ name: name.toUpperCase(), value });
    }
    return {
      first(name) {
        return props.find(p => p.name === name.toUpperCase()) || null;
      },
    };
  };

  for (let i = 1; i < blocks.length; i++) {
    const end = blocks[i].indexOf('END:VEVENT');
    const vevent = end >= 0 ? blocks[i].slice(0, end) : blocks[i];
    const props = readProps(vevent);
    const status = (props.first('STATUS')?.value || '').toUpperCase();
    const uid = props.first('UID')?.value || '';
    const recurrenceIdRaw = props.first('RECURRENCE-ID')?.value || '';
    const recurrenceKey = `${uid}|${parseICSTimestampKey(recurrenceIdRaw)}`;

    if (status === 'CANCELLED') {
      if (uid && recurrenceIdRaw) {
        cancellations.add(recurrenceKey);
        const recurrenceDate = parseICSDate(recurrenceIdRaw);
        if (recurrenceDate && !Number.isNaN(recurrenceDate.getTime())) {
          cancellationStarts.add(`${uid}|${recurrenceDate.getTime()}`);
        }
      }
      continue;
    }

    const dtstartRaw = props.first('DTSTART')?.value || '';
    if (!dtstartRaw) continue;
    const dtendRaw = props.first('DTEND')?.value || '';

    const title = unescape(props.first('SUMMARY')?.value || '') || '(Kein Titel)';
    const allDayFromDateType = !dtstartRaw.includes('T');
    const start = parseICSDate(dtstartRaw);
    const end2 = dtendRaw ? parseICSDate(dtendRaw) : start;
    if (!start || Number.isNaN(start.getTime())) continue;

    const eventEnd = end2 && !Number.isNaN(end2.getTime()) ? end2 : start;
    if (eventEnd < start) continue;

    const durationMs = eventEnd.getTime() - start.getTime();
    if (durationMs > 180 * 864e5) continue;

    const allDay = allDayFromDateType || isPseudoAllDayEvent(dtstartRaw, dtendRaw, start, eventEnd);
    if (eventEnd < minDate || start > maxDate) continue;

    events.push({
      uid,
      recurrenceIdKey: parseICSTimestampKey(recurrenceIdRaw),
      title,
      start,
      end: eventEnd,
      allDay
    });
  }

  const seen = new Set();
  return events.filter(ev => {
    if (ev.uid && ev.recurrenceIdKey && cancellations.has(`${ev.uid}|${ev.recurrenceIdKey}`)) return false;
    if (ev.uid && cancellationStarts.has(`${ev.uid}|${ev.start.getTime()}`)) return false;
    let key;
    if (ev.uid) {
      key = `${ev.uid}|${ev.recurrenceIdKey || ev.start.getTime()}|${ev.end?.getTime() || ''}|${ev.allDay}`;
    } else {
      key = `${ev.title}|${ev.start.getTime()}|${ev.end?.getTime() || ''}|${ev.allDay}`;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ uid, recurrenceIdKey, ...ev }) => ev);
}

async function fetchCalendar(cfg) {
  const tryFetch = async url => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  try {
    let text;
    try {
      text = await tryFetch(`${cfg.icsUrl}${cfg.icsUrl.includes('?') ? '&' : '?'}_=${Date.now()}`);
    } catch {
      text = await tryFetch(`${CORS_PROXY}${encodeURIComponent(cfg.icsUrl)}&_=${Date.now()}`);
    }
    state.cal.events[cfg.id] = parseICS(text);
  } catch (e) {
    console.warn(`[Cal] ${cfg.id}:`, e);
    if (!state.cal.events[cfg.id]) state.cal.events[cfg.id] = [];
  }
}

async function loadCalendars() {
  state.cal.events = {};
  await Promise.allSettled(CAL_CONFIGS.map(fetchCalendar));
  renderCalendar();
}

function calDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calEventCoversDate(ev, date) {
  const startDay = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
  let endDay;
  if (ev.end) {
    endDay = new Date(ev.end.getFullYear(), ev.end.getMonth(), ev.end.getDate());
    if (ev.allDay && endDay.getTime() > startDay.getTime()) {
      endDay = new Date(endDay.getTime() - 864e5);
    }
  } else {
    endDay = startDay;
  }
  return date >= startDay && date <= endDay;
}

function normalizeEventDateRange(ev) {
  const startDay = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
  let endDay = new Date(startDay);
  if (ev.end) endDay = new Date(ev.end.getFullYear(), ev.end.getMonth(), ev.end.getDate());

  if (ev.allDay && endDay.getTime() > startDay.getTime()) {
    endDay = new Date(endDay.getTime() - 864e5);
  }

  return { startDay, endDay };
}

function formatCalDateRange(start, end, allDay) {
  const fmt = (d, opts) => d.toLocaleDateString('de-DE', opts);
  if (!end || start.getTime() === end.getTime()) {
    return fmt(start, { day: 'numeric', month: 'short' });
  }
  const realEnd = allDay ? new Date(end.getTime() - 864e5) : end;
  const s = fmt(start, { day: 'numeric', month: 'short' });
  const e = fmt(realEnd, { day: 'numeric', month: 'short' });
  return s === e ? s : `${s} – ${e}`;
}

function renderCalendarEvents() {
  const el = state.els.calEvents;
  if (!el) return;
  const { selectedDate } = state.cal;
  if (!selectedDate) { el.innerHTML = ''; return; }

  const [y, m, d] = selectedDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const events = [];

  for (const cfg of CAL_CONFIGS) {
    if (state.cal.enabled[cfg.id] === false) continue;
    for (const ev of (state.cal.events[cfg.id] || [])) {
      if (calEventCoversDate(ev, date)) {
        events.push({ ...ev, color: cfg.color, calLabel: cfg.label });
      }
    }
  }

  if (!events.length) {
    el.innerHTML = `<p class="small muted calNoEvents">Kein Eintrag für ${date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}.</p>`;
    return;
  }

  el.innerHTML = '';
  for (const ev of events) {
    const div = document.createElement('div');
    div.className = 'calEvent';
    div.style.setProperty('--calColor', ev.color);
    const range = ev.allDay ? formatCalDateRange(ev.start, ev.end, true) : `${ev.start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} – ${ev.end ? ev.end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''}`;
    div.innerHTML = `
      <div class="calEventTitle">${escapeHtml(ev.title)}</div>
      <div class="calEventMeta small muted">${escapeHtml(ev.calLabel)} · ${escapeHtml(range)}</div>`;
    el.appendChild(div);
  }
}

// Performance-optimiertes Kalender-Rendering mit vorberechneter Event-Map & DocumentFragment
function renderCalendar() {
  const grid = state.els.calGrid;
  const label = state.els.calMonthLabel;
  const togglesEl = state.els.calToggles;
  if (!grid || !label) return;

  const { year, month, selectedDate } = state.cal;
  label.textContent = `${MONTH_NAMES[month]} ${year}`;

  // Toggle-Buttons
  if (togglesEl) {
    togglesEl.innerHTML = '';
    for (const cfg of CAL_CONFIGS) {
      const enabled = state.cal.enabled[cfg.id] !== false;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calToggle';
      btn.dataset.active = String(enabled);
      btn.innerHTML = `<span class="calDot" style="background:${cfg.color}"></span>${escapeHtml(cfg.label)}`;
      btn.addEventListener('click', () => {
        state.cal.enabled[cfg.id] = !state.cal.enabled[cfg.id];
        renderCalendar();
      });
      togglesEl.appendChild(btn);
    }
  }

  // Zellen berechnen
  const today = new Date();
  const todayStr = calDateStr(today);
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const cells = [];
  const prevLastDay = new Date(year, month, 0);
  for (let i = startDow - 1; i >= 0; i--) {
    const d = prevLastDay.getDate() - i;
    cells.push({ day: d, thisMonth: false, date: new Date(year, month - 1, d) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, thisMonth: true, date: new Date(year, month, d) });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, thisMonth: false, date: new Date(year, month + 1, d) });
  }

  // Event-Map vorberechnen: dateStr → Set von Farben
  // Statt O(cells × events) nur O(cells + events)
  const eventColorMap = new Map();
  const visibleStart = new Date(cells[0].date.getFullYear(), cells[0].date.getMonth(), cells[0].date.getDate());
  const visibleEnd = new Date(cells[cells.length - 1].date.getFullYear(), cells[cells.length - 1].date.getMonth(), cells[cells.length - 1].date.getDate());

  for (const cfg of CAL_CONFIGS) {
    if (state.cal.enabled[cfg.id] === false) continue;
    for (const ev of (state.cal.events[cfg.id] || [])) {
      const { startDay, endDay } = normalizeEventDateRange(ev);
      if (endDay < visibleStart || startDay > visibleEnd) continue;

      const iterStart = startDay < visibleStart ? visibleStart : startDay;
      const iterEnd = endDay > visibleEnd ? visibleEnd : endDay;
      const cursor = new Date(iterStart);

      while (cursor <= iterEnd) {
        const key = calDateStr(cursor);
        if (!eventColorMap.has(key)) eventColorMap.set(key, new Set());
        eventColorMap.get(key).add(cfg.color);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  // Grid mit DocumentFragment (1 DOM-Write statt 42)
  const frag = document.createDocumentFragment();

  for (const cell of cells) {
    const cellStr = calDateStr(cell.date);
    const colors = eventColorMap.get(cellStr);
    const isToday = cellStr === todayStr;
    const isSelected = cellStr === selectedDate;

    const div = document.createElement('div');
    div.className = [
      'calCell',
      !cell.thisMonth && 'otherMonth',
      isToday && 'today',
      isSelected && 'selected',
    ].filter(Boolean).join(' ');
    div.setAttribute('role', 'gridcell');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-selected', String(isSelected));
    div.setAttribute('aria-label', cell.date.toLocaleDateString('de-DE', {
      day: 'numeric', month: 'long', year: 'numeric'
    }));

    const dayNum = document.createElement('span');
    dayNum.className = 'calDayNum';
    dayNum.textContent = cell.day;
    div.appendChild(dayNum);

    if (colors?.size) {
      const dotsDiv = document.createElement('div');
      dotsDiv.className = 'calEventDots';
      let count = 0;
      for (const color of colors) {
        if (count++ >= 3) break;
        const dot = document.createElement('span');
        dot.className = 'calEventDot';
        dot.style.background = color;
        dotsDiv.appendChild(dot);
      }
      div.appendChild(dotsDiv);
    }

    const selectCell = () => {
      state.cal.selectedDate = cellStr;
      renderCalendar();
    };
    div.addEventListener('click', selectCell);
    div.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCell(); }
    });

    frag.appendChild(div);
  }

  grid.innerHTML = '';
  grid.appendChild(frag);

  renderCalendarEvents();
}

function initCalendar() {
  const now = new Date();
  state.cal = {
    events: {},
    enabled: Object.fromEntries(CAL_CONFIGS.map(c => [c.id, true])),
    year: now.getFullYear(),
    month: now.getMonth(),
    selectedDate: null,
  };

  state.els.calPrev?.addEventListener('click', () => {
    state.cal.month--;
    if (state.cal.month < 0) { state.cal.month = 11; state.cal.year--; }
    state.cal.selectedDate = null;
    renderCalendar();
  });
  state.els.calNext?.addEventListener('click', () => {
    state.cal.month++;
    if (state.cal.month > 11) { state.cal.month = 0; state.cal.year++; }
    state.cal.selectedDate = null;
    renderCalendar();
  });

  renderCalendar();
  loadCalendars();
}

// --- Week view ----------------------------------------------------------

function initWeekSelect() {
  const sel = state.els.weekClassSelect;
  if (!sel) return;
  populateClassSelect(sel);
  const classIds = getAvailableClasses();
  const fallbackClass = classIds[0] || 'HT11';
  const saved = storageGet(APP.storageKeys.classId) || fallbackClass;
  sel.value = classIds.includes(saved) ? saved : fallbackClass;
  sel.addEventListener('change', () => syncClassSelects(sel));
}

function renderWeek() {
  const grid = state.els.weekGrid;
  const sel = state.els.weekClassSelect;
  if (!grid || !sel) return;

  const classId = sel.value || (getAvailableClasses()[0] || 'HT11');
  const todayId = getTodayId();
  const currentPairStart = getCurrentPairStartSlot(todayId);

  const header = `
    <div class="weekRow weekHeader" role="row">
      <div class="weekCell weekCorner" role="columnheader">Zeit</div>
      ${DAYS.map(d =>
        `<div class="weekCell${d.id === todayId ? ' weekDayToday' : ''}" role="columnheader">${escapeHtml(d.label.slice(0, 2))}</div>`
      ).join('')}
    </div>`;

  const body = WEEK_PAIRS.map(pair => {
    const firstSlot = state.timeslotMap.get(pair.first);
    const secondSlot = state.timeslotMap.get(pair.second);
    if (!firstSlot || !secondSlot) return '';

    const timeFrom = firstSlot.time.split('–')[0].trim();
    const timeTo   = secondSlot.time.split('–')[1].trim();

    const dayCells = DAYS.map(d => {
      const rows = state.timetable?.[classId]?.[d.id] || [];
      const r = rows.find(x => String(x.slotId) === pair.first);

      if (!r) {
        return `<div class="weekCell weekEmpty" role="cell"></div>`;
      }

      const teacher = r.teacher ? escapeHtml(r.teacher.split('/').map(x => x.trim()).join(' / ')) : '—';
      const room = r.room ? escapeHtml(String(r.room)) : '&nbsp;';
      const noteClass = r.note ? ' note' : '';
      const currentClass = d.id === todayId && currentPairStart === pair.first ? ' current' : '';

      return `
        <div class="weekCell${noteClass}${currentClass}" role="cell">
          <div class="weekSubject">${formatSubject(r.subject)}</div>
          <div class="weekMetaRow">
            <div class="weekMeta weekMetaTeacher">${teacher}</div>
            <div class="weekMeta weekMetaRoom">${room}</div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="weekRow" role="row" aria-label="Doppelstunde ${escapeHtml(pair.first)}+${escapeHtml(pair.second)}">
        <div class="weekCell weekSlot" role="rowheader">
          <div class="tdTime">
            <span class="weekTimeRange">${escapeHtml(timeFrom)}</span>
            <span class="weekTimeEnd">${escapeHtml(timeTo)}</span>
            <div class="weekSlotLabel">Std.&thinsp;${escapeHtml(pair.first)}&thinsp;+&thinsp;${escapeHtml(pair.second)}</div>
          </div>
        </div>
        ${dayCells}
      </div>`;
  }).join('');

  grid.innerHTML = `<div class="weekTable" role="rowgroup">${header}${body}</div>`;

  const kwEl = qs('#weekKwLabel');
  if (kwEl) kwEl.textContent = `KW\u00a0${getISOWeek()}`;
}

// --- Service worker -----------------------------------------------------

async function initServiceWorker() {
  const status = state.els.swStatus;
  if (!('serviceWorker' in navigator)) {
    safeSetText(status, 'Service Worker nicht verfügbar.');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js');
    safeSetText(status, 'Offline-Cache aktiv.');

    if (reg.waiting) {
      safeSetText(status, 'Update verfügbar – bitte neu laden.');
    }

    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          safeSetText(status, 'Update verfügbar – bitte neu laden.');
        }
      });
    });
  } catch (e) {
    console.warn('SW Fehler:', e);
    safeSetText(status, 'Service Worker konnte nicht geladen werden.');
  }
}

// --- Instagram Previews -------------------------------------------------

async function loadInstagramPreviews() {
  try {
    const resp = await fetch('./data/instagram.json');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data?.profiles) return;

    for (const [id, profile] of Object.entries(data.profiles)) {
      if (profile.followers) {
        const el = qs(`[data-ig-followers="${id}"]`);
        if (el) el.textContent = `${profile.followers} Follower`;
      }
      const linkCard = qs(`.linkCardBig[data-ig="${id}"]`);
      if (linkCard) {
        const urlEl = qs('.linkUrl', linkCard);
        if (urlEl && profile.handle) urlEl.textContent = `@${profile.handle}`;
      }
      if (profile.profilePic) {
        const card = qs(`[data-ig="${id}"]`);
        const avatar = card ? qs('.igAvatar', card) : null;
        if (avatar) avatar.src = profile.profilePic;
      }
    }
  } catch {
    // instagram.json nicht vorhanden
  }
}

// --- Element caching & Boot ---------------------------------------------

function cacheEls() {
  state.els = {
    navItems: qsa('.navItem'),
    views: qsa('.view'),
    classSelect: qs('#classSelect'),
    dayButtons: qsa('#daySelectGroup .dayBtn'),
    todayClassSelect: qs('#todayClassSelect'),
    currentDayInfo: qs('#currentDayInfo'),
    timetableBody: qs('#timetableBody'),
    todayWeekday: qs('#todayWeekday'),
    todayPreview: qs('#todayPreview'),
    nowTime: qs('#nowTime'),
    countdownText: qs('#countdownText'),
    funMessage: qs('#funMessage'),
    netIndicator: qs('#netIndicator'),
    netLabel: qs('#netLabel'),
    calGrid: qs('#calGrid'),
    calMonthLabel: qs('#calMonthLabel'),
    calPrev: qs('#calPrev'),
    calNext: qs('#calNext'),
    calToggles: qs('#calToggles'),
    calEvents: qs('#calEvents'),
    weekClassSelect: qs('#weekClassSelect'),
    weekGrid: qs('#weekGrid'),
    swStatus: qs('#swStatus'),
    year: qs('#year'),
    darkToggle: qs('#darkToggle'),
    announcementsCard: qs('#announcementsCard'),
    announcementsList: qs('#announcementsList'),
    announcementsIssues: qs('#announcementsIssues'),
    announcementsNext: qs('#announcementNext'),
    announcementsMoreBtn: qs('#announcementsMoreBtn')
  };
}

async function boot() {
  try {
    cacheEls();
    initTheme();
    initThemeToggle();
    initNav();
    initSelects();
    initWeekSelect();
    initNetworkIndicator();
    initPdfLinkGuards();

    await refreshTimetableIfNeeded();
    await loadFunMessages();
    await loadAnnouncements();

    initCountdown();
    initAutoRefresh();
    initCalendar();
    initServiceWorker();
    safeSetText(state.els.year, String(new Date().getFullYear()));
    loadInstagramPreviews();

    console.log(`${APP.name} v${APP.version} geladen`);
  } catch (e) {
    console.error('Fehler beim Initialisieren:', e);
  }
}

document.addEventListener('DOMContentLoaded', boot);
