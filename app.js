/* HGH Schüler-PWA – vanilla JS (refactored) */

const APP = {
  name: 'HGH Hildesheim',
  storageKeys: {
    theme: 'hgh_theme',
    classId: 'hgh_class',
    dayId: 'hgh_day',
    installHintShown: 'hgh_install_hint_shown',
    timetableCache: 'hgh_timetable_cache_v1',
    timetableCacheTs: 'hgh_timetable_cache_ts'
  },
  routes: ['home', 'timetable', 'week', 'links', 'instagram']
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

async function loadTimetable({ forceNetwork = false } = {}) {
  const url = './data/timetable.json';
  let lastError = null;

  // if offline and not forced, skip network early
  if (!forceNetwork && typeof navigator !== 'undefined' && navigator.onLine === false) {
    lastError = new Error('offline');
  } else {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      applyTimetableData(data);
      localStorage.setItem(APP.storageKeys.timetableCache, JSON.stringify(data));
      localStorage.setItem(APP.storageKeys.timetableCacheTs, new Date().toISOString());

      hideTimetableError();
      return { source: 'network' };
    } catch (e) {
      lastError = e;
      // continue to fallback
    }
  }

  // fallback to last cached timetable
  try {
    const cached = localStorage.getItem(APP.storageKeys.timetableCache);
    if (cached) {
      const data = JSON.parse(cached);
      applyTimetableData(data);
      showTimetableError(
        'Offline-Fallback aktiv (Cache aus localStorage).',
        lastError?.message === 'offline' ? 'offline' : 'cache'
      );
      return { source: 'cache' };
    }
  } catch {
    // ignore
  }

  applyTimetableData({ timeslots: DEFAULT_TIMESLOTS, classes: ensureEmptyTimetable() });
  showTimetableError('Keine Cache-Daten vorhanden. Bitte später erneut versuchen.', 'empty');
  return { source: 'empty' };
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
  renderWeek();
}

function formatTeacherRoom(teacher, room) {
  const parts = [];
  if (teacher) parts.push(String(teacher));
  if (room) parts.push(`Raum: ${room}`);
  return parts.join(' · ');
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
      const subject = r?.subject || (r?.teacher ? '—' : '—');
      const meta = formatTeacherRoom(r?.teacher, r?.room);

      return `
      <div class="tr" role="row" aria-label="${escapeHtml(s.time)}">
        <div class="td"><span class="time">${escapeHtml(s.time)}</span></div>
        <div class="td">${escapeHtml(subject)}</div>
        <div class="td">${meta ? `<small>${escapeHtml(meta)}</small>` : '<small class="muted">&nbsp;</small>'}</div>
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
      (r) => {
        const subject = r?.subject ?? '—';
        const meta = formatTeacherRoom(r?.teacher, r?.room);
        return `
    <div class="listItem">
      <div>
        <div class="time">${escapeHtml(slotTime(r.slotId))}</div>
      </div>
      <div>
        <div>${escapeHtml(subject)}</div>
        <div class="sub">${escapeHtml(meta || '')}</div>
      </div>
    </div>
  `;
      }
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
    // keep week view in sync
    if (state.els.weekClassSelect) state.els.weekClassSelect.value = classSelect.value;
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

// --- Countdown (Home) ---------------------------------------------------

function parseSlotRangeToDates(range, baseDate = new Date()) {
  // range like "08:00–08:45" or "08:00-08:45"; ignores "Mittagspause"
  const m = String(range).match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
  if (!m) return null;
  const [_, startStr, endStr] = m;

  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);

  const start = new Date(baseDate);
  start.setHours(sh, sm, 0, 0);

  const end = new Date(baseDate);
  end.setHours(eh, em, 0, 0);

  return { start, end };
}

function diffMinutesCeil(a, b) {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 60000));
}

function getDayScheduleRanges(dayId, baseDate = new Date()) {
  // derive lesson ranges from timeslots (excluding breaks like slotId 7)
  const ranges = [];
  for (const s of state.timeslots) {
    if (String(s.id) === '7') continue;
    const r = parseSlotRangeToDates(s.time, baseDate);
    if (r) ranges.push({ slotId: String(s.id), ...r });
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

function updateCountdown() {
  const nowEl = state.els.nowTime;
  const textEl = state.els.countdownText;
  if (!nowEl || !textEl) return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  nowEl.textContent = `${hh}:${mm}`;

  const dayId = getTodayId();
  const isWeekend = !['mo', 'di', 'mi', 'do', 'fr'].includes(dayId);
  if (isWeekend) {
    textEl.textContent = 'Schuljahr beendet - siehe morgen';
    return;
  }

  const ranges = getDayScheduleRanges(dayId, now);
  if (!ranges.length) {
    textEl.textContent = 'Schuljahr beendet - siehe morgen';
    return;
  }

  const lastEnd = ranges[ranges.length - 1].end;
  if (now >= lastEnd) {
    textEl.textContent = 'Schuljahr beendet - siehe morgen';
    return;
  }

  // within lesson?
  const current = ranges.find((r) => now >= r.start && now < r.end);
  if (current) {
    const mins = diffMinutesCeil(now, current.end);
    textEl.textContent = `Stunde endet in ${mins} Min`;
    return;
  }

  // else: break before next lesson
  const next = ranges.find((r) => now < r.start);
  if (next) {
    const mins = diffMinutesCeil(now, next.start);
    textEl.textContent = `Nächste Stunde in ${mins} Min`;
    return;
  }

  textEl.textContent = 'Schuljahr beendet - siehe morgen';
}

function initCountdown() {
  updateCountdown();
  window.setInterval(updateCountdown, 1000 * 15);
}

// --- Network / offline UI ----------------------------------------------

function updateNetworkIndicator() {
  const ind = state.els.netIndicator;
  const label = state.els.netLabel;
  if (!ind || !label) return;

  const online = navigator.onLine;
  ind.dataset.status = online ? 'online' : 'offline';
  label.textContent = online ? 'Online' : 'Offline';
}

function initNetworkIndicator() {
  updateNetworkIndicator();
  window.addEventListener('online', () => updateNetworkIndicator());
  window.addEventListener('offline', () => updateNetworkIndicator());
}

function showTimetableError(message, mode = 'generic') {
  const box = state.els.ttError;
  const msg = state.els.ttErrorMsg;
  if (!box || !msg) return;

  msg.textContent = message;
  box.hidden = false;

  // show retry always, but hint when offline
  if (state.els.retryBtn) {
    state.els.retryBtn.disabled = mode === 'offline' && navigator.onLine === false;
  }
}

function hideTimetableError() {
  if (state.els.ttError) state.els.ttError.hidden = true;
}

function initRetry() {
  state.els.retryBtn?.addEventListener('click', async () => {
    await loadTimetable({ forceNetwork: true });
    render();
  });
}

// --- Week view ----------------------------------------------------------

function initWeekSelect() {
  const sel = state.els.weekClassSelect;
  if (!sel) return;

  sel.innerHTML = CLASSES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  const savedClass = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  sel.value = CLASSES.some((c) => c.id === savedClass) ? savedClass : 'HT11';

  sel.addEventListener('change', () => {
    localStorage.setItem(APP.storageKeys.classId, sel.value);
    if (state.els.classSelect) state.els.classSelect.value = sel.value;
    render();
  });
}

function renderWeek() {
  const grid = state.els.weekGrid;
  const sel = state.els.weekClassSelect;
  if (!grid || !sel) return;

  const classId = sel.value || 'HT11';

  // header
  const header = `
    <div class="weekRow weekHeader" role="row">
      <div class="weekCell weekCorner" role="columnheader">Stunde</div>
      ${DAYS.map((d) => `<div class="weekCell" role="columnheader">${escapeHtml(d.label.slice(0,2))}</div>`).join('')}
    </div>
  `;

  const slotLabel = (slot) => {
    const t = String(slot.time);
    if (!t.match(/\d{2}:\d{2}/)) return t;
    return t.replace('–', '–');
  };

  const body = state.timeslots
    .filter((s) => String(s.id) !== '7')
    .map((slot) => {
      const rowCells = DAYS.map((d) => {
        const rows = state.timetable?.[classId]?.[d.id] || [];
        const r = rows.find((x) => String(x.slotId) === String(slot.id));
        const subject = r?.subject || '—';
        const meta = formatTeacherRoom(r?.teacher, r?.room);
        return `
          <div class="weekCell" role="cell">
            <div class="weekSubject">${escapeHtml(subject)}</div>
            ${meta ? `<div class="weekMeta">${escapeHtml(meta)}</div>` : `<div class="weekMeta muted">&nbsp;</div>`}
          </div>
        `;
      }).join('');

      return `
        <div class="weekRow" role="row" aria-label="Stunde ${escapeHtml(slot.id)}">
          <div class="weekCell weekSlot" role="rowheader">
            <div class="weekSlotNum">${escapeHtml(slot.id)}</div>
            <div class="weekSlotTime">${escapeHtml(slotLabel(slot))}</div>
          </div>
          ${rowCells}
        </div>
      `;
    })
    .join('');

  grid.innerHTML = `<div class="weekTable" role="rowgroup">${header}${body}</div>`;
}

// --- Install hint -------------------------------------------------------

function isStandalone() {
  return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

function initInstallHint() {
  const hint = state.els.installHint;
  const banner = state.els.installBanner;
  const closeBtn = state.els.installBannerClose;

  // Banner: nur wenn nicht installiert + noch nicht gesehen
  try {
    const seen = localStorage.getItem(APP.storageKeys.installHintShown) === '1';
    if (!isStandalone() && !seen && banner) {
      banner.hidden = false;
    }
  } catch {
    // ignore storage errors
  }

  closeBtn?.addEventListener('click', () => {
    if (banner) banner.hidden = true;
    try {
      localStorage.setItem(APP.storageKeys.installHintShown, '1');
    } catch {
      // ignore
    }
  });

  // Zusatz-Hint (optional): when browser indicates installability
  if (hint) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      safeSetText(hint, 'Installierbar: Du kannst die App über das Browser-Menü installieren.');
    });

    window.addEventListener('appinstalled', () => {
      safeSetText(hint, 'App installiert – läuft auch offline (Basisfunktionen).');
      if (banner) banner.hidden = true;
      try {
        localStorage.setItem(APP.storageKeys.installHintShown, '1');
      } catch {
        // ignore
      }
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

    // Home extras
    nowTime: qs('#nowTime'),
    countdownText: qs('#countdownText'),
    netIndicator: qs('#netIndicator'),
    netLabel: qs('#netLabel'),

    // Week view
    weekClassSelect: qs('#weekClassSelect'),
    weekGrid: qs('#weekGrid'),

    // Offline / errors
    ttError: qs('#ttError'),
    ttErrorMsg: qs('#ttErrorMsg'),
    retryBtn: qs('#retryBtn'),

    installHint: qs('#installHint'),
    installBanner: qs('#installBanner'),
    installBannerClose: qs('#installBannerClose'),
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
  initWeekSelect();
  initNetworkIndicator();
  initRetry();

  await loadTimetable();
  render();

  initCountdown();
  initInstallHint();
  initServiceWorker();
  initFooter();
}

document.addEventListener('DOMContentLoaded', boot);
