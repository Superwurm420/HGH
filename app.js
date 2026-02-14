/* HGH Schüler-PWA – vanilla JS (refactored) */

const APP = {
  name: 'HGH Hildesheim',
  storageKeys: {
    theme: 'hgh_theme',
    classId: 'hgh_class',
    dayId: 'hgh_day',
    timetableCache: 'hgh_timetable_cache_v1',
    timetableCacheTs: 'hgh_timetable_cache_ts'
  },
  routes: ['home', 'timetable', 'links', 'instagram']
};

// --- Data ---------------------------------------------------------------

const CLASSES = [
  { id: 'HT11', name: 'HT11' },
  { id: 'HT12', name: 'HT12' },
  { id: 'HT21', name: 'HT21' },
  { id: 'HT22', name: 'HT22' },
  { id: 'G11', name: 'G11' },
  { id: 'G21', name: 'G21' },
  { id: 'GT01', name: 'GT01' }
];

const DAYS = [
  { id: 'mo', label: 'Montag' },
  { id: 'di', label: 'Dienstag' },
  { id: 'mi', label: 'Mittwoch' },
  { id: 'do', label: 'Donnerstag' },
  { id: 'fr', label: 'Freitag' }
];

const DEFAULT_TIMESLOTS = [
  ['1', '08:00–08:45'],
  ['2', '08:45–09:30'],
  ['3', '09:50–10:35'],
  ['4', '10:35–11:20'],
  ['5', '11:40–12:25'],
  ['6', '12:25–13:10'],
  ['7', 'Mittagspause'],
  ['8', '14:10–14:55'],
  ['9', '14:55–15:40']
].map(([id, time]) => ({ id, time }));

// --- State --------------------------------------------------------------

const state = {
  timeslots: DEFAULT_TIMESLOTS,
  timetable: null,
  els: {}
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

function getTodayId() {
  const day = new Date().getDay(); // 0 Sun ... 6 Sat
  const map = { 1: 'mo', 2: 'di', 3: 'mi', 4: 'do', 5: 'fr' };
  return map[day] || 'mo';
}

function safeSetText(el, text) {
  if (el) el.textContent = text;
}

// --- Theme --------------------------------------------------------------

function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  localStorage.setItem(APP.storageKeys.theme, isLight ? 'light' : 'dark');

  // Address bar color (kept constant for brand consistency)
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#0b5cff');
}

function initTheme() {
  const saved = localStorage.getItem(APP.storageKeys.theme);
  if (saved) return applyTheme(saved);

  const prefersLight =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}

function initThemeToggle() {
  state.els.darkToggle?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

// --- Timetable loader ---------------------------------------------------

function ensureEmptyTimetable() {
  const empty = {};
  for (const c of CLASSES) empty[c.id] = { mo: [], di: [], mi: [], do: [], fr: [] };
  return empty;
}

function applyTimetableData(data) {
  if (Array.isArray(data?.timeslots) && data.timeslots.length) {
    state.timeslots = data.timeslots;
  } else {
    state.timeslots = DEFAULT_TIMESLOTS;
  }
  state.timetable = data?.classes || ensureEmptyTimetable();
}

async function loadTimetable() {
  const url = './data/timetable.json';
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    applyTimetableData(data);
    localStorage.setItem(APP.storageKeys.timetableCache, JSON.stringify(data));
    localStorage.setItem(APP.storageKeys.timetableCacheTs, new Date().toISOString());
    return;
  } catch {
    // ignore -> fallback below
  }

  // fallback to last cached timetable
  try {
    const cached = localStorage.getItem(APP.storageKeys.timetableCache);
    if (cached) {
      const data = JSON.parse(cached);
      applyTimetableData(data);
      return;
    }
  } catch {
    // ignore
  }

  applyTimetableData({ timeslots: DEFAULT_TIMESLOTS, classes: ensureEmptyTimetable() });
}

// --- Navigation ---------------------------------------------------------

function setRoute(route) {
  const navButtons = state.els.navItems;

  for (const b of navButtons) {
    const isActive = b.dataset.route === route;
    b.setAttribute('aria-current', isActive ? 'page' : 'false');
  }

  for (const v of state.els.views) {
    v.hidden = v.dataset.view !== route;
  }

  history.replaceState(null, '', `#${route}`);
}

function initNav() {
  state.els.navItems.forEach((btn) => {
    btn.addEventListener('click', () => setRoute(btn.dataset.route));
  });

  qsa('[data-route-jump]').forEach((el) => {
    el.addEventListener('click', () => setRoute(el.dataset.routeJump));
  });

  const initial = (location.hash || '#home').replace('#', '');
  const known = new Set(APP.routes);
  setRoute(known.has(initial) ? initial : 'home');
}

// --- Renderer -----------------------------------------------------------

function render() {
  renderTimetable();
  renderTodayPreview();
}

function renderTimetable() {
  const classId = state.els.classSelect?.value || 'HT11';
  const dayId = state.els.daySelect?.value || 'mo';

  const rows = state.timetable?.[classId]?.[dayId] || [];
  const body = state.els.timetableBody;
  if (!body) return;

  const bySlot = new Map(rows.map((r) => [r.slotId, r]));

  body.innerHTML = state.timeslots
    .map((s) => {
      const r = bySlot.get(s.id);
      const subject = r?.subject || '—';
      const tr = r?.teacherRoom || '';

      return `
      <div class="tr" role="row" aria-label="${escapeHtml(s.time)}">
        <div class="td"><span class="time">${escapeHtml(s.time)}</span></div>
        <div class="td">${escapeHtml(subject)}</div>
        <div class="td">${tr ? `<small>${escapeHtml(tr)}</small>` : '<small class="muted">&nbsp;</small>'}</div>
      </div>
    `;
    })
    .join('');
}

function renderTodayPreview() {
  const todayId = getTodayId();
  const todayLabel = state.els.todayLabel;
  const list = state.els.todayPreview;
  if (!todayLabel || !list) return;

  const classId = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  const className = CLASSES.find((c) => c.id === classId)?.name || classId;
  const dayName = DAYS.find((d) => d.id === todayId)?.label || 'Heute';

  todayLabel.textContent = `${dayName} · Klasse ${className}`;

  const rows = (state.timetable?.[classId]?.[todayId] || [])
    .filter((r) => r.slotId !== '7')
    .slice(0, 4);

  if (rows.length === 0) {
    list.innerHTML = `<div class="small muted">Keine Daten.</div>`;
    return;
  }

  const slotTime = (slotId) => state.timeslots.find((s) => s.id === slotId)?.time || '';

  list.innerHTML = rows
    .map(
      (r) => `
    <div class="listItem">
      <div>
        <div class="time">${escapeHtml(slotTime(r.slotId))}</div>
      </div>
      <div>
        <div>${escapeHtml(r.subject || '—')}</div>
        <div class="sub">${escapeHtml(r.teacherRoom || '')}</div>
      </div>
    </div>
  `
    )
    .join('');
}

// --- Selects ------------------------------------------------------------

function initSelects() {
  const { classSelect, daySelect, todayBtn } = state.els;
  if (!classSelect || !daySelect) return;

  classSelect.innerHTML = CLASSES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  daySelect.innerHTML = DAYS.map((d) => `<option value="${d.id}">${d.label}</option>`).join('');

  const savedClass = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  const savedDay = localStorage.getItem(APP.storageKeys.dayId) || getTodayId();

  classSelect.value = CLASSES.some((c) => c.id === savedClass) ? savedClass : 'HT11';
  daySelect.value = DAYS.some((d) => d.id === savedDay) ? savedDay : 'mo';

  classSelect.addEventListener('change', () => {
    localStorage.setItem(APP.storageKeys.classId, classSelect.value);
    render();
  });

  daySelect.addEventListener('change', () => {
    localStorage.setItem(APP.storageKeys.dayId, daySelect.value);
    renderTimetable();
  });

  todayBtn?.addEventListener('click', () => {
    const today = getTodayId();
    daySelect.value = today;
    localStorage.setItem(APP.storageKeys.dayId, today);
    renderTimetable();
  });
}

// --- Install hint -------------------------------------------------------

function initInstallHint() {
  const hint = state.els.installHint;
  if (!hint) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    safeSetText(
      hint,
      'Installierbar: Du kannst die App über das Browser-Menü installieren.'
    );
  });

  window.addEventListener('appinstalled', () => {
    safeSetText(hint, 'App installiert – läuft auch offline (Basisfunktionen).');
  });
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

    if (reg.waiting) safeSetText(status, 'Update verfügbar – bitte neu laden.');

    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          safeSetText(status, 'Update verfügbar – bitte neu laden.');
        }
      });
    });
  } catch {
    safeSetText(status, 'Service Worker konnte nicht geladen werden.');
  }
}

function initFooter() {
  safeSetText(state.els.year, String(new Date().getFullYear()));
}

function cacheEls() {
  state.els = {
    navItems: qsa('.navItem'),
    views: qsa('.view'),

    classSelect: qs('#classSelect'),
    daySelect: qs('#daySelect'),
    todayBtn: qs('#todayBtn'),

    timetableBody: qs('#timetableBody'),
    todayLabel: qs('#todayLabel'),
    todayPreview: qs('#todayPreview'),

    installHint: qs('#installHint'),
    swStatus: qs('#swStatus'),
    year: qs('#year'),

    darkToggle: qs('#darkToggle')
  };
}

async function boot() {
  cacheEls();

  initTheme();
  initThemeToggle();
  initNav();
  initSelects();

  await loadTimetable();
  render();

  initInstallHint();
  initServiceWorker();
  initFooter();
}

document.addEventListener('DOMContentLoaded', boot);
