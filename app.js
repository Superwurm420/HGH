/* HGH Schüler-PWA – vanilla JS (optimized & bugfixed) */

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
  routes: ['home', 'timetable', 'week', 'links', 'instagram'],
  
  // Konstanten für bessere Wartbarkeit
  constants: {
    COUNTDOWN_UPDATE_INTERVAL: 30000, // 30 Sekunden statt 15
    CACHE_MAX_AGE: 24 * 60 * 60 * 1000, // 24 Stunden
    RETRY_DELAY: 1000
  }
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

// Lehrerkürzel → Name (mit / als Trennzeichen für die Anzeige)
const TEACHER_MAP = {
  'STE': 'A. Steinau',
  'WED': 'H. Westendorf',
  'STI': 'J. Stille',
  'BÜ': 'K. Bünte',
  'HOFF': 'T. Hoffmann',
  'GRO': 'A. Grotjahn',
  'TAM': 'B. Tammen',
  'WEN': 'J. Wendel',
  'MEL': 'D. Mell',
  'WEZ': 'Wenzel',
  'HOG': 'Hogendorn',
  'BER': 'A. Berenfeld',
  'PET': 'Pet',
  'BER/WEZ': 'Berenfeld/Wenzel',
  'WEZ/PET': 'Wenzel/Pet'
};

/**
 * Formatiert Lehrerkürzel zu vollem Namen
 * @param {string} teacher - Lehrerkürzel
 * @returns {string} Formatierter Name
 */
/**
 * Prüft ob ein Wert ein ungültiger Platzhalter ist (#NV, #N/A)
 * @param {any} val - Zu prüfender Wert
 * @returns {boolean} true wenn ungültig
 */
function isPlaceholder(val) {
  if (!val) return false;
  const s = String(val).trim().toUpperCase();
  return s === '#NV' || s === '#N/A' || s === 'N.V.';
}

/**
 * Bereinigt einen Wert: gibt null zurück wenn Platzhalter
 * @param {any} val - Zu bereinigender Wert
 * @returns {string|null} Bereinigter Wert oder null
 */
function cleanValue(val) {
  if (!val || isPlaceholder(val)) return null;
  return String(val).trim();
}

function formatTeacherName(teacher) {
  if (!teacher || isPlaceholder(teacher)) return '—';
  return TEACHER_MAP[teacher] || teacher;
}

const DEFAULT_TIMESLOTS = [
  ['1', '08:00–08:45'],
  ['2', '08:45–09:30'],
  ['3', '09:50–10:35'],
  ['4', '10:35–11:20'],
  ['5', '11:40–12:25'],
  ['6', '12:25–13:10'],
  ['7', '14:10–14:55'],
  ['8', '14:55–15:40'],
  ['9', '15:45–16:30'],
  ['10', '16:30–17:15']
].map(([id, time]) => ({ id, time }));

// --- State --------------------------------------------------------------

const state = {
  timeslots: DEFAULT_TIMESLOTS,
  timetable: null,
  selectedDayId: null,
  els: {},
  isLoading: false, // Verhindert Race Conditions
  countdownInterval: null // Für sauberes Cleanup
};

// --- Utils --------------------------------------------------------------

const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Escaped HTML-Zeichen für sichere Ausgabe
 * @param {any} str - Zu escapender String
 * @returns {string} Escaped String
 */
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * Gibt die aktuelle Tages-ID zurück (mo-fr)
 * @returns {string} Tages-ID oder 'mo' als Fallback
 */
function getTodayId() {
  const day = new Date().getDay(); // 0 Sun ... 6 Sat
  const map = { 1: 'mo', 2: 'di', 3: 'mi', 4: 'do', 5: 'fr' };
  return map[day] || 'mo';
}

/**
 * Prüft ob heute ein Wochentag ist
 * @returns {boolean} true wenn Mo-Fr
 */
function isWeekday() {
  const day = new Date().getDay();
  return day >= 1 && day <= 5;
}

/**
 * Setzt Text eines Elements sicher (null-safe)
 * @param {HTMLElement|null} el - Element
 * @param {string} text - Text
 */
function safeSetText(el, text) {
  if (el) el.textContent = text;
}

/**
 * Prüft ob ein Timeslot eine Pause ist (kein echtes Zeitformat)
 * @param {Object} slot - Timeslot mit id und time
 * @returns {boolean} true wenn Pause (z.B. "Mittagspause")
 */
function isBreakSlot(slot) {
  return !String(slot?.time || '').match(/\d{2}:\d{2}/);
}

/**
 * Validiert Timetable-Datenstruktur
 * @param {any} data - Zu validierende Daten
 * @returns {boolean} true wenn valide
 */
function isValidTimetableData(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.timeslots && !Array.isArray(data.timeslots)) return false;
  if (data.classes && typeof data.classes !== 'object') return false;
  return true;
}

// --- Theme --------------------------------------------------------------

/**
 * Wendet Theme an und speichert Präferenz
 * @param {string} theme - 'light' oder 'dark'
 */
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  
  try {
    localStorage.setItem(APP.storageKeys.theme, isLight ? 'light' : 'dark');
  } catch (e) {
    console.warn('Theme konnte nicht gespeichert werden:', e);
  }

  // Address bar color (kept constant for brand consistency)
  const meta = qs('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#0b5cff');
}

/**
 * Initialisiert Theme basierend auf Präferenz oder System
 */
function initTheme() {
  try {
    const saved = localStorage.getItem(APP.storageKeys.theme);
    if (saved) return applyTheme(saved);
  } catch (e) {
    console.warn('Theme konnte nicht geladen werden:', e);
  }

  const prefersLight =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(prefersLight ? 'light' : 'dark');
}

/**
 * Initialisiert Theme-Toggle Button
 */
function initThemeToggle() {
  const toggle = state.els.darkToggle;
  if (!toggle) return;
  
  toggle.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  });
}

// --- Timetable loader ---------------------------------------------------

/**
 * Erstellt leere Stundenplan-Struktur
 * @returns {Object} Leerer Stundenplan
 */
function ensureEmptyTimetable() {
  const empty = {};
  for (const c of CLASSES) {
    empty[c.id] = { mo: [], di: [], mi: [], do: [], fr: [] };
  }
  return empty;
}

/**
 * Wendet Stundenplan-Daten auf State an
 * @param {Object} data - Stundenplan-Daten
 */
function applyTimetableData(data) {
  if (!isValidTimetableData(data)) {
    console.warn('Ungültige Timetable-Daten, verwende Defaults');
    state.timeslots = DEFAULT_TIMESLOTS;
    state.timetable = ensureEmptyTimetable();
    return;
  }

  if (Array.isArray(data?.timeslots) && data.timeslots.length) {
    state.timeslots = data.timeslots;
  } else {
    state.timeslots = DEFAULT_TIMESLOTS;
  }
  
  state.timetable = data?.classes || ensureEmptyTimetable();
}

/**
 * Lädt Stundenplan vom Server oder Cache
 * @param {Object} options - Optionen
 * @param {boolean} options.forceNetwork - Erzwingt Netzwerk-Request
 * @returns {Promise<Object>} Lade-Ergebnis mit source
 */
async function loadTimetable({ forceNetwork = false } = {}) {
  // Verhindere parallele Lade-Vorgänge
  if (state.isLoading) {
    console.log('Lade-Vorgang bereits aktiv, überspringe');
    return { source: 'skip' };
  }

  state.isLoading = true;
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

      // Validiere Daten vor der Anwendung
      if (!isValidTimetableData(data)) {
        throw new Error('Ungültige Datenstruktur');
      }

      applyTimetableData(data);
      
      try {
        localStorage.setItem(APP.storageKeys.timetableCache, JSON.stringify(data));
        localStorage.setItem(APP.storageKeys.timetableCacheTs, new Date().toISOString());
      } catch (e) {
        console.warn('Cache konnte nicht gespeichert werden:', e);
      }

      hideTimetableError();
      state.isLoading = false;
      return { source: 'network' };
    } catch (e) {
      lastError = e;
      console.warn('Netzwerk-Fehler beim Laden:', e);
      // continue to fallback
    }
  }

  // fallback to last cached timetable
  try {
    const cached = localStorage.getItem(APP.storageKeys.timetableCache);
    if (cached) {
      const data = JSON.parse(cached);

      // Validiere Cache-Daten
      if (!isValidTimetableData(data)) {
        throw new Error('Ungültige Cache-Daten');
      }

      // Prüfe Cache-Alter
      const cacheTs = localStorage.getItem(APP.storageKeys.timetableCacheTs);
      const cacheAge = cacheTs ? (Date.now() - new Date(cacheTs).getTime()) : Infinity;
      const isStale = cacheAge > APP.constants.CACHE_MAX_AGE;

      applyTimetableData(data);

      let errorMsg;
      if (lastError?.message === 'offline') {
        errorMsg = 'Offline-Modus: Zeige letzte gespeicherte Daten.';
      } else if (isStale) {
        errorMsg = 'Netzwerk-Fehler: Zeige veraltete Cache-Daten (älter als 24h).';
      } else {
        errorMsg = 'Netzwerk-Fehler: Zeige Cache-Daten.';
      }

      showTimetableError(errorMsg, lastError?.message === 'offline' ? 'offline' : 'cache');
      state.isLoading = false;
      return { source: 'cache' };
    }
  } catch (e) {
    console.warn('Cache-Fehler:', e);
  }

  // Keine Daten verfügbar
  applyTimetableData({ timeslots: DEFAULT_TIMESLOTS, classes: ensureEmptyTimetable() });
  showTimetableError('Keine Daten verfügbar. Bitte Internetverbindung prüfen.', 'empty');
  state.isLoading = false;
  return { source: 'empty' };
}

// --- Navigation ---------------------------------------------------------

/**
 * Setzt aktive Route und aktualisiert UI
 * @param {string} route - Route-ID
 */
function setRoute(route) {
  const navButtons = state.els.navItems;

  for (const b of navButtons) {
    const isActive = b.dataset.route === route;
    b.setAttribute('aria-current', isActive ? 'page' : 'false');
  }

  for (const v of state.els.views) {
    v.hidden = v.dataset.view !== route;
  }

  // Update URL ohne Seiten-Reload
  if (window.history?.replaceState) {
    history.replaceState(null, '', `#${route}`);
  }
}

/**
 * Initialisiert Navigation und Routing
 */
function initNav() {
  state.els.navItems.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setRoute(btn.dataset.route);
    });
  });

  qsa('[data-route-jump]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      setRoute(el.dataset.routeJump);
    });
  });

  // Handle hash changes (browser back/forward)
  window.addEventListener('hashchange', () => {
    const route = (location.hash || '#home').replace('#', '');
    const known = new Set(APP.routes);
    if (known.has(route)) setRoute(route);
  });

  const initial = (location.hash || '#home').replace('#', '');
  const known = new Set(APP.routes);
  setRoute(known.has(initial) ? initial : 'home');
}

// --- Renderer -----------------------------------------------------------

/**
 * Rendert alle Views
 */
function render() {
  renderTimetable();
  renderTodayPreview();
  renderWeek();
  renderChangelog();
}

/**
 * Formatiert Lehrer und Raum für Anzeige
 * @param {string} teacher - Lehrerkürzel
 * @param {string} room - Raumnummer
 * @returns {string} Formatierter String
 */
function formatTeacherRoom(teacher, room) {
  const parts = [];
  if (teacher) parts.push(formatTeacherName(teacher));
  if (room) parts.push(String(room));
  return parts.join(' / ');
}

/**
 * Rendert Stundenplan-Tabelle
 */
function renderTimetable() {
  const classId = state.els.classSelect?.value || 'HT11';
  const dayId = state.selectedDayId || getTodayId();

  const rows = state.timetable?.[classId]?.[dayId] || [];
  const body = state.els.timetableBody;
  if (!body) return;

  const bySlot = new Map(rows.map((r) => [r.slotId, r]));

  body.innerHTML = state.timeslots
    .map((s) => {
      const r = bySlot.get(s.id);
      const subject = cleanValue(r?.subject) || '—';
      const meta = formatTeacherRoom(cleanValue(r?.teacher), cleanValue(r?.room));

      return `
      <div class="tr" role="row" aria-label="Stunde ${escapeHtml(s.id)}: ${escapeHtml(s.time)}">
        <div class="td"><span class="time">${escapeHtml(s.time)}</span></div>
        <div class="td">${escapeHtml(subject)}</div>
        <div class="td">${meta ? `<small>${escapeHtml(meta)}</small>` : '<small class="muted">—</small>'}</div>
      </div>
    `;
    })
    .join('');
}

/**
 * Rendert Heute-Vorschau auf Startseite
 */
function renderTodayPreview() {
  const todayId = getTodayId();
  const todayLabel = state.els.todayLabel;
  const list = state.els.todayPreview;
  if (!todayLabel || !list) return;

  const classId = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  const className = CLASSES.find((c) => c.id === classId)?.name || classId;
  const dayName = DAYS.find((d) => d.id === todayId)?.label || 'Heute';

  todayLabel.textContent = `${dayName} · Klasse ${className}`;

  const breakSlotIds = new Set(state.timeslots.filter(isBreakSlot).map(s => s.id));
  const rows = (state.timetable?.[classId]?.[todayId] || [])
    .filter((r) => !breakSlotIds.has(r.slotId))
    .slice(0, 4);

  if (rows.length === 0) {
    list.innerHTML = `<div class="small muted">Keine Daten verfügbar.</div>`;
    return;
  }

  const slotTime = (slotId) => state.timeslots.find((s) => s.id === slotId)?.time || '';

  list.innerHTML = rows
    .map((r) => {
      const subject = cleanValue(r?.subject) || '—';
      const meta = formatTeacherRoom(cleanValue(r?.teacher), cleanValue(r?.room));
      return `
    <div class="listItem">
      <div>
        <div class="time">${escapeHtml(slotTime(r.slotId))}</div>
      </div>
      <div>
        <div>${escapeHtml(subject)}</div>
        <div class="sub">${escapeHtml(meta || '—')}</div>
      </div>
    </div>
  `;
    })
    .join('');
}

// --- Selects ------------------------------------------------------------

/**
 * Setzt aktiven Tag-Button
 * @param {string} dayId - Tages-ID
 */
function setActiveDayButton(dayId) {
  const buttons = state.els.dayButtons || [];
  for (const btn of buttons) {
    const isActive = btn.dataset.day === dayId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  }
}

/**
 * Initialisiert Klassen- und Tages-Auswahl
 */
function initSelects() {
  const { classSelect, todayBtn } = state.els;
  if (!classSelect) return;

  classSelect.innerHTML = CLASSES.map((c) => 
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`
  ).join('');

  const savedClass = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  const savedDay = localStorage.getItem(APP.storageKeys.dayId) || getTodayId();

  classSelect.value = CLASSES.some((c) => c.id === savedClass) ? savedClass : 'HT11';
  state.selectedDayId = DAYS.some((d) => d.id === savedDay) ? savedDay : 'mo';
  setActiveDayButton(state.selectedDayId);

  classSelect.addEventListener('change', () => {
    try {
      localStorage.setItem(APP.storageKeys.classId, classSelect.value);
    } catch (e) {
      console.warn('Klasse konnte nicht gespeichert werden:', e);
    }
    
    // keep week view in sync
    if (state.els.weekClassSelect) {
      state.els.weekClassSelect.value = classSelect.value;
    }
    render();
  });

  for (const btn of state.els.dayButtons || []) {
    btn.addEventListener('click', () => {
      const dayId = btn.dataset.day;
      if (!dayId) return;
      
      state.selectedDayId = dayId;
      
      try {
        localStorage.setItem(APP.storageKeys.dayId, dayId);
      } catch (e) {
        console.warn('Tag konnte nicht gespeichert werden:', e);
      }
      
      setActiveDayButton(dayId);
      renderTimetable();
    });
  }

  todayBtn?.addEventListener('click', () => {
    const today = getTodayId();
    state.selectedDayId = today;
    
    try {
      localStorage.setItem(APP.storageKeys.dayId, today);
    } catch (e) {
      console.warn('Tag konnte nicht gespeichert werden:', e);
    }
    
    setActiveDayButton(today);
    renderTimetable();
  });
}

// --- Countdown (Home) ---------------------------------------------------

/**
 * Parsed Zeitslot-Range zu Date-Objekten
 * @param {string} range - Zeitrange (z.B. "08:00–08:45")
 * @param {Date} baseDate - Basis-Datum
 * @returns {Object|null} {start, end} oder null
 */
function parseSlotRangeToDates(range, baseDate = new Date()) {
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

/**
 * Berechnet Minuten-Differenz (aufgerundet)
 * @param {Date} a - Start-Zeit
 * @param {Date} b - End-Zeit
 * @returns {number} Minuten
 */
function diffMinutesCeil(a, b) {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 60000));
}

/**
 * Gibt alle Unterrichtsstunden des Tages als Ranges zurück
 * @param {string} dayId - Tages-ID
 * @param {Date} baseDate - Basis-Datum
 * @returns {Array} Array von {slotId, start, end}
 */
function getDayScheduleRanges(dayId, baseDate = new Date()) {
  const ranges = [];
  for (const s of state.timeslots) {
    if (isBreakSlot(s)) continue; // Pausen überspringen
    const r = parseSlotRangeToDates(s.time, baseDate);
    if (r) ranges.push({ slotId: String(s.id), ...r });
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

/**
 * Aktualisiert Countdown-Anzeige
 */
function updateCountdown() {
  const nowEl = state.els.nowTime;
  const textEl = state.els.countdownText;
  if (!nowEl || !textEl) return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  nowEl.textContent = `${hh}:${mm}`;

  // Prüfe ob Wochenende
  if (!isWeekday()) {
    textEl.textContent = 'Schönes Wochenende! 🎉';
    return;
  }

  const dayId = getTodayId();
  const ranges = getDayScheduleRanges(dayId, now);
  
  if (!ranges.length) {
    textEl.textContent = 'Schultag beendet – bis morgen! 👋';
    return;
  }

  const lastEnd = ranges[ranges.length - 1].end;
  if (now >= lastEnd) {
    textEl.textContent = 'Schultag beendet – bis morgen! 👋';
    return;
  }

  // Innerhalb einer Stunde?
  const current = ranges.find((r) => now >= r.start && now < r.end);
  if (current) {
    const mins = diffMinutesCeil(now, current.end);
    textEl.textContent = `Stunde endet in ${mins} Min`;
    return;
  }

  // Pause vor nächster Stunde
  const next = ranges.find((r) => now < r.start);
  if (next) {
    const mins = diffMinutesCeil(now, next.start);
    textEl.textContent = `Nächste Stunde in ${mins} Min`;
    return;
  }

  textEl.textContent = 'Schultag beendet – bis morgen! 👋';
}

/**
 * Generiert lustige/motivierende Nachricht
 * @param {Date} now - Aktuelle Zeit
 * @returns {string} Nachricht
 */
function getFunMessage(now = new Date()) {
  const day = now.getDay(); // 0 Sun ... 6 Sat
  const hour = now.getHours();

  // Wochenende
  if (day === 0 || day === 6) {
    return 'Wochenende! Zeit zum Entspannen 🌴';
  }

  // Wochentag-spezifisch
  if (day === 1) return 'Montag – neue Woche, neues Glück! 💪';
  if (day === 5) return 'Freitag! Schnell noch durchziehen… 🎉';
  if (day === 3) return 'Bergfest! Halbzeit der Woche! ⛰️';

  // Tageszeit-basiert
  if (hour >= 16) return 'Fast geschafft – gleich ist Feierabend! 🏠';
  if (hour >= 15) return 'Noch ein bisschen – du schaffst das! 💪';
  if (hour >= 12 && hour < 14) return 'Mittagspause – guten Appetit! 🍽️';
  if (hour < 8) return 'Guten Morgen – Kaffee schon am Start? ☕';

  return 'Viel Erfolg heute! 🚀';
}

/**
 * Aktualisiert Fun-Message
 */
function updateFunMessage() {
  const el = state.els.funMessage;
  if (!el) return;
  el.textContent = getFunMessage(new Date());
}

/**
 * Startet Countdown-Updates
 */
function initCountdown() {
  updateCountdown();
  updateFunMessage();
  
  // Cleanup vorheriger Interval
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
  }
  
  state.countdownInterval = setInterval(() => {
    updateCountdown();
    updateFunMessage();
  }, APP.constants.COUNTDOWN_UPDATE_INTERVAL);
}

// --- Network / offline UI ----------------------------------------------

/**
 * Aktualisiert Netzwerk-Indikator
 */
function updateNetworkIndicator() {
  const ind = state.els.netIndicator;
  const label = state.els.netLabel;
  if (!ind || !label) return;

  const online = navigator.onLine;
  ind.dataset.status = online ? 'online' : 'offline';
  label.textContent = online ? 'Online' : 'Offline';
}

/**
 * Initialisiert Netzwerk-Indikator
 */
function initNetworkIndicator() {
  updateNetworkIndicator();
  window.addEventListener('online', updateNetworkIndicator);
  window.addEventListener('offline', updateNetworkIndicator);
}

/**
 * Zeigt Stundenplan-Fehler an
 * @param {string} message - Fehlermeldung
 * @param {string} mode - Fehler-Modus ('offline', 'cache', 'empty', 'generic')
 */
function showTimetableError(message, mode = 'generic') {
  const box = state.els.ttError;
  const msg = state.els.ttErrorMsg;
  if (!box || !msg) return;

  msg.textContent = message;
  box.hidden = false;

  // Retry-Button nur aktivieren wenn sinnvoll
  if (state.els.retryBtn) {
    state.els.retryBtn.disabled = mode === 'offline' && !navigator.onLine;
  }
}

/**
 * Versteckt Stundenplan-Fehler
 */
function hideTimetableError() {
  if (state.els.ttError) state.els.ttError.hidden = true;
}

/**
 * Initialisiert Retry-Button
 */
function initRetry() {
  state.els.retryBtn?.addEventListener('click', async () => {
    if (state.els.retryBtn) {
      state.els.retryBtn.disabled = true;
    }
    
    await loadTimetable({ forceNetwork: true });
    render();
    
    if (state.els.retryBtn) {
      state.els.retryBtn.disabled = false;
    }
  });
}

// --- Week view ----------------------------------------------------------

/**
 * Initialisiert Klassen-Auswahl für Wochenansicht
 */
function initWeekSelect() {
  const sel = state.els.weekClassSelect;
  if (!sel) return;

  sel.innerHTML = CLASSES.map((c) => 
    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`
  ).join('');
  
  const savedClass = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  sel.value = CLASSES.some((c) => c.id === savedClass) ? savedClass : 'HT11';

  sel.addEventListener('change', () => {
    try {
      localStorage.setItem(APP.storageKeys.classId, sel.value);
    } catch (e) {
      console.warn('Klasse konnte nicht gespeichert werden:', e);
    }
    
    if (state.els.classSelect) {
      state.els.classSelect.value = sel.value;
    }
    render();
  });
}

/**
 * Rendert Wochenübersicht
 */
function renderWeek() {
  const grid = state.els.weekGrid;
  const sel = state.els.weekClassSelect;
  if (!grid || !sel) return;

  const classId = sel.value || 'HT11';

  // Header
  const header = `
    <div class="weekRow weekHeader" role="row">
      <div class="weekCell weekCorner" role="columnheader">Stunde</div>
      ${DAYS.map((d) => 
        `<div class="weekCell" role="columnheader">${escapeHtml(d.label.slice(0, 2))}</div>`
      ).join('')}
    </div>
  `;

  const slotLabel = (slot) => {
    const t = String(slot.time);
    if (!t.match(/\d{2}:\d{2}/)) return t;
    return t;
  };

  const slots = state.timeslots.filter((s) => !isBreakSlot(s));

  // Doppelstunden-Merge: 1+2, 3+4, 5+6, 7+8, 9+10
  const MERGE_PAIRS = [
    ['1', '2'],
    ['3', '4'],
    ['5', '6'],
    ['7', '8'],
    ['9', '10']
  ];

  /**
   * Prüft ob zwei Stunden zusammengelegt werden können
   * @param {Object} a - Stunde A
   * @param {Object} b - Stunde B
   * @returns {boolean} true wenn mergebar
   */
  const canMerge = (a, b) => {
    if (!a || !b) return false;
    return (a.subject || '') === (b.subject || '') && 
           (a.teacher || '') === (b.teacher || '') && 
           (a.room || '') === (b.room || '');
  };

  // Precompute welche Zellen übersprungen/gespannt werden
  const spanByDaySlot = {}; // key `${dayId}:${slotId}` -> 2
  const skipByDaySlot = {}; // key `${dayId}:${slotId}` -> true

  for (const d of DAYS) {
    const rows = state.timetable?.[classId]?.[d.id] || [];
    const bySlot = new Map(rows.map((r) => [String(r.slotId), r]));

    for (const [aId, bId] of MERGE_PAIRS) {
      const a = bySlot.get(String(aId));
      const b = bySlot.get(String(bId));
      if (canMerge(a, b)) {
        spanByDaySlot[`${d.id}:${aId}`] = 2;
        skipByDaySlot[`${d.id}:${bId}`] = true;
      }
    }
  }

  const body = slots
    .map((slot) => {
      const rowCells = DAYS.map((d) => {
        const key = `${d.id}:${slot.id}`;
        if (skipByDaySlot[key]) return '';

        const rows = state.timetable?.[classId]?.[d.id] || [];
        const r = rows.find((x) => String(x.slotId) === String(slot.id));
        const subject = cleanValue(r?.subject) || '—';
        const meta = formatTeacherRoom(cleanValue(r?.teacher), cleanValue(r?.room));

        const span = spanByDaySlot[key] || 1;
        const style = span > 1 ? ` style="grid-row: span ${span};"` : '';

        return `
          <div class="weekCell" role="cell"${style}>
            <div class="weekSubject">${escapeHtml(subject)}</div>
            ${meta ? `<div class="weekMeta">${escapeHtml(meta)}</div>` : `<div class="weekMeta muted">—</div>`}
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

/**
 * Prüft ob App im Standalone-Modus läuft
 * @returns {boolean} true wenn installiert
 */
function isStandalone() {
  return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

/**
 * Initialisiert Install-Hinweise
 */
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
  } catch (e) {
    console.warn('Install-Hint Status konnte nicht geladen werden:', e);
  }

  closeBtn?.addEventListener('click', () => {
    if (banner) banner.hidden = true;
    try {
      localStorage.setItem(APP.storageKeys.installHintShown, '1');
    } catch (e) {
      console.warn('Install-Hint Status konnte nicht gespeichert werden:', e);
    }
  });

  // Zusatz-Hint: wenn Browser Installierbarkeit signalisiert
  if (hint) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      safeSetText(hint, 'Installierbar: Du kannst die App über das Browser-Menü installieren.');
    });

    window.addEventListener('appinstalled', () => {
      safeSetText(hint, 'App installiert – läuft auch offline! 🎉');
      if (banner) banner.hidden = true;
      try {
        localStorage.setItem(APP.storageKeys.installHintShown, '1');
      } catch (e) {
        console.warn('Install-Hint Status konnte nicht gespeichert werden:', e);
      }
    });
  }
}

// --- Service worker -----------------------------------------------------

/**
 * Registriert Service Worker für Offline-Funktionalität
 */
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
    console.warn('Service Worker Fehler:', e);
    safeSetText(status, 'Service Worker konnte nicht geladen werden.');
  }
}

// --- Changelog ----------------------------------------------------------

const CHANGELOG = [
  '🐛 Fix: Wochentags-Buttons funktionieren zuverlässig',
  '🎉 Neu: Motivierende Nachrichten unter dem Countdown',
  '📋 Neu: Changelog-Box auf der Startseite',
  '🎨 UI: Größere Tages-Buttons für bessere Bedienung',
  '🏫 Branding: Schul-Logo im Header',
  '⚡ Performance: Optimierte Render-Funktionen',
  '🔒 Sicherheit: XSS-Schutz durch HTML-Escaping',
  '♿ Accessibility: Verbesserte ARIA-Labels'
];

/**
 * Rendert Changelog auf Startseite
 */
function renderChangelog() {
  const list = state.els.changelog;
  if (!list) return;
  list.innerHTML = CHANGELOG.slice(0, 5)
    .map((t) => `<li>${escapeHtml(t)}</li>`)
    .join('');
}

/**
 * Initialisiert Footer mit aktuellem Jahr
 */
function initFooter() {
  safeSetText(state.els.year, String(new Date().getFullYear()));
}

// --- Element caching ----------------------------------------------------

/**
 * Cached häufig verwendete DOM-Elemente
 */
function cacheEls() {
  state.els = {
    navItems: qsa('.navItem'),
    views: qsa('.view'),

    classSelect: qs('#classSelect'),
    dayButtons: qsa('#daySelectGroup .dayBtn'),
    todayBtn: qs('#todayBtn'),

    timetableBody: qs('#timetableBody'),
    todayLabel: qs('#todayLabel'),
    todayPreview: qs('#todayPreview'),

    // Home extras
    nowTime: qs('#nowTime'),
    countdownText: qs('#countdownText'),
    funMessage: qs('#funMessage'),
    changelog: qs('#changelog'),
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

// --- Boot ---------------------------------------------------------------

/**
 * Haupt-Initialisierungsfunktion
 */
async function boot() {
  try {
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

    console.log(`${APP.name} v${APP.version} geladen`);
  } catch (e) {
    console.error('Fehler beim Initialisieren:', e);
    // App läuft trotzdem weiter mit Defaults
  }
}

// --- Cleanup on unload --------------------------------------------------

/**
 * Cleanup bei Seiten-Verlassen
 */
function cleanup() {
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
    state.countdownInterval = null;
  }
}

window.addEventListener('beforeunload', cleanup);

// --- Start --------------------------------------------------------------

document.addEventListener('DOMContentLoaded', boot);
