/* HGH Schüler-PWA – vanilla JS, performance-optimiert & vereinfacht */

const APP = {
  name: 'HGH Hildesheim',
  version: '1.2.0',
  storageKeys: {
    theme: 'hgh_theme',
    classId: 'hgh_class',
    dayId: 'hgh_day',
    installHintShown: 'hgh_install_hint_shown',
    timetableCache: 'hgh_timetable_cache_v1',
    timetableCacheTs: 'hgh_timetable_cache_ts'
  },
  routes: ['home', 'timetable', 'week', 'links'],
  constants: {
    COUNTDOWN_INTERVAL: 30000,
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
const CORS_PROXY = 'https://corsproxy.io/?url=';

// --- Calendar config ----------------------------------------------------

const CAL_CONFIGS = [
  {
    id: 'jahreskalender',
    label: 'HGH Jahreskalender',
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
  els: {},
  isLoading: false,
  autoRefreshTimer: null,
  lastSignature: null,
  lastRefreshAt: 0,
  installPromptEvent: null,
  countdownTimer: null,
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

  // PDF-Links aktualisieren
  if (data?.meta?.source) {
    const href = `./plan/${data.meta.source}`;
    for (const link of qsa('a[data-pdf-link]')) link.href = href;
  }

  // Aktualisierungsdatum anzeigen
  const lastUpdEl = qs('#ttLastUpdated');
  if (lastUpdEl && data?.meta?.updatedAt) {
    const d = new Date(data.meta.updatedAt);
    lastUpdEl.textContent = `Stundenplan aktualisiert: ${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
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
}

function renderTimetable() {
  const classId = state.els.classSelect?.value || 'HT11';
  const dayId = state.selectedDayId || getTodayId();
  const body = state.els.timetableBody;
  if (!body) return;

  const hasData = state.timetable && Object.values(state.timetable).some(
    cls => Object.values(cls).some(day => day.length > 0)
  );

  if (!hasData) {
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
    body.innerHTML = '<div class="small muted">Keine Stunden für diesen Tag.</div>';
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
    list.innerHTML = '<div class="small muted">Keine Daten verfügbar.</div>';
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
    el.textContent = 'Ausgewählter Tag: —';
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

  el.innerHTML = `Ausgewählter Tag: <a href="./plan/Stundenplan_kw_45_Hj1_2025_26.pdf" target="_blank" rel="noopener" data-pdf-link>${escapeHtml(day.label)}, ${escapeHtml(dateLabel)} · KW ${getISOWeek(selectedDate)}</a>`;
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

function getDayRanges(dayId, base = new Date()) {
  const ranges = [];
  for (const s of state.timeslots) {
    if (s.id === '7') continue;
    const r = parseSlotRange(s.time, base);
    if (r) ranges.push({ slotId: s.id, ...r });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

function getCurrentPairStartSlot(dayId, now = new Date()) {
  if (!isWeekday() || dayId !== getTodayId()) return null;
  const ranges = getDayRanges(dayId, now);
  const current = ranges.find(r => now >= r.start && now < r.end);
  if (!current) return null;

  for (const pair of WEEK_PAIRS) {
    if (current.slotId === pair.first || current.slotId === pair.second) return pair.first;
  }
  return current.slotId;
}

function updateCountdown() {
  const { nowTime: nowEl, countdownText: textEl } = state.els;
  if (!nowEl || !textEl) return;

  const now = new Date();
  nowEl.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (!isWeekday()) { textEl.textContent = 'Schönes Wochenende! 🎉'; return; }

  const ranges = getDayRanges(getTodayId(), now);
  if (!ranges.length || now >= ranges[ranges.length - 1].end) {
    textEl.textContent = 'Schultag vorbei 👋';
    return;
  }

  // Aktuell in einer Stunde?
  const current = ranges.find(r => now >= r.start && now < r.end);
  if (current) {
    const partnerId = DOUBLE_PAIRS[current.slotId];
    const partner = partnerId ? ranges.find(r => r.slotId === partnerId) : null;
    textEl.textContent = `Pause in ${diffMinsCeil(now, partner ? partner.end : current.end)} Min`;
    return;
  }

  // Pause vor nächster Stunde
  const next = ranges.find(r => now < r.start);
  if (next) {
    textEl.textContent = `Nächste Stunde in ${diffMinsCeil(now, next.start)} Min`;
    return;
  }

  textEl.textContent = 'Schultag vorbei 👋';
}

function getFunMessage(now = new Date()) {
  const day = now.getDay(), hour = now.getHours();
  if (day === 0 || day === 6) return 'Wochenende! Zeit zum Entspannen 🌴';
  if (day === 1) return 'Montag – neue Woche, neues Glück! 💪';
  if (day === 5) return 'Freitag! Schnell noch durchziehen… 🎉';
  if (day === 3) return 'Bergfest! Halbzeit der Woche! ⛰️';
  if (hour >= 16) return 'Fast geschafft – gleich ist Feierabend! 🏠';
  if (hour >= 15) return 'Noch ein bisschen – du schaffst das! 💪';
  if (hour >= 12 && hour < 14) return 'Mittagspause – guten Appetit! 🍽️';
  if (hour < 8) return 'Guten Morgen – Kaffee schon am Start? ☕';
  return 'Viel Erfolg heute! 🚀';
}

function initCountdown() {
  const tick = () => {
    updateCountdown();
    safeSetText(state.els.funMessage, getFunMessage());
  };
  tick();
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = setInterval(tick, APP.constants.COUNTDOWN_INTERVAL);
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

// --- Calendar -----------------------------------------------------------

function parseICSDate(s) {
  if (!s) return null;
  const y = +s.slice(0, 4), mo = +s.slice(4, 6) - 1, d = +s.slice(6, 8);
  if (s.includes('T')) {
    const h = +s.slice(9, 11), mi = +s.slice(11, 13), sec = +s.slice(13, 15);
    return s.endsWith('Z') ? new Date(Date.UTC(y, mo, d, h, mi, sec)) : new Date(y, mo, d, h, mi, sec);
  }
  return new Date(y, mo, d);
}

function parseICS(text) {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const unescape = s => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
  const events = [];
  const blocks = unfolded.split('BEGIN:VEVENT');
  for (let i = 1; i < blocks.length; i++) {
    const end = blocks[i].indexOf('END:VEVENT');
    const vevent = end >= 0 ? blocks[i].slice(0, end) : blocks[i];
    const get = name => {
      const m = vevent.match(new RegExp(`^${name}(?:;[^:]+)?:(.+)$`, 'm'));
      return m ? m[1].trim() : '';
    };
    const status = get('STATUS').toUpperCase();
    if (status === 'CANCELLED') continue;
    const title = unescape(get('SUMMARY')) || '(Kein Titel)';
    const dtstart = get('DTSTART');
    if (!dtstart) continue;
    const dtend = get('DTEND');
    const allDay = !dtstart.includes('T');
    const start = parseICSDate(dtstart);
    const end2 = dtend ? parseICSDate(dtend) : start;
    if (start) events.push({ title, start, end: end2, allDay });
  }
  return events;
}

async function fetchCalendar(cfg) {
  const tryFetch = async url => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  };

  try {
    let text;
    try { text = await tryFetch(cfg.icsUrl); }
    catch { text = await tryFetch(CORS_PROXY + encodeURIComponent(cfg.icsUrl)); }
    state.cal.events[cfg.id] = parseICS(text);
  } catch (e) {
    console.warn(`[Cal] ${cfg.id}:`, e);
    if (!state.cal.events[cfg.id]) state.cal.events[cfg.id] = [];
  }
}

async function loadCalendars() {
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
  for (const cfg of CAL_CONFIGS) {
    if (state.cal.enabled[cfg.id] === false) continue;
    for (const ev of (state.cal.events[cfg.id] || [])) {
      // Nur Events prüfen, die den sichtbaren Zeitraum überlappen
      for (const cell of cells) {
        if (calEventCoversDate(ev, cell.date)) {
          const key = calDateStr(cell.date);
          if (!eventColorMap.has(key)) eventColorMap.set(key, new Set());
          eventColorMap.get(key).add(cfg.color);
        }
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
          <div class="weekMeta weekMetaTop">${teacher}</div>
          <div class="weekSubject">${formatSubject(r.subject)}</div>
          <div class="weekMeta weekMetaBottom">${room}</div>
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

// --- Install hint -------------------------------------------------------

function isStandalone() {
  return !!window.matchMedia?.('(display-mode: standalone)').matches;
}

function initInstallHint() {
  const { installHint: hint, installBanner: banner, installBannerClose: closeBtn, installButton } = state.els;

  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  if (hint) {
    if (isIOS) {
      safeSetText(hint, 'iPhone: Über "Teilen" → "Zum Home-Bildschirm" installieren.');
    } else if (isAndroid) {
      safeSetText(hint, 'Android: Über Browser-Menü oder den Button installieren.');
    } else {
      safeSetText(hint, 'Öffne die App auf Android oder iOS für die Installationsanleitung.');
    }
  }

  if (installButton) {
    installButton.addEventListener('click', async () => {
      if (!state.installPromptEvent) return;
      try {
        await state.installPromptEvent.prompt();
        await state.installPromptEvent.userChoice;
      } catch (e) {
        console.warn('Installationsdialog:', e);
      } finally {
        state.installPromptEvent = null;
        installButton.disabled = true;
        installButton.setAttribute('aria-disabled', 'true');
      }
    });
  }

  if (!isStandalone() && storageGet(APP.storageKeys.installHintShown) !== '1' && banner) {
    banner.hidden = false;
  }

  closeBtn?.addEventListener('click', () => {
    if (banner) banner.hidden = true;
    storageSet(APP.storageKeys.installHintShown, '1');
  });

  if (hint) {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      state.installPromptEvent = e;
      if (installButton) {
        installButton.disabled = false;
        installButton.setAttribute('aria-disabled', 'false');
      }
      safeSetText(hint, 'Installierbar: Du kannst jetzt direkt über den Button installieren.');
    });

    window.addEventListener('appinstalled', () => {
      safeSetText(hint, 'App installiert – läuft auch offline! 🎉');
      if (banner) banner.hidden = true;
      if (installButton) {
        installButton.disabled = true;
        installButton.setAttribute('aria-disabled', 'true');
      }
      state.installPromptEvent = null;
      storageSet(APP.storageKeys.installHintShown, '1');
    });
  }
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
    installButton: qs('#installButton'),
    installHint: qs('#installHint'),
    installBanner: qs('#installBanner'),
    installBannerClose: qs('#installBannerClose'),
    swStatus: qs('#swStatus'),
    year: qs('#year'),
    darkToggle: qs('#darkToggle')
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

    await refreshTimetableIfNeeded();

    initCountdown();
    initAutoRefresh();
    initCalendar();
    initInstallHint();
    initServiceWorker();
    safeSetText(state.els.year, String(new Date().getFullYear()));
    loadInstagramPreviews();

    console.log(`${APP.name} v${APP.version} geladen`);
  } catch (e) {
    console.error('Fehler beim Initialisieren:', e);
  }
}

document.addEventListener('DOMContentLoaded', boot);
