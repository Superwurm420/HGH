/* HGH Schüler-PWA – vanilla JS (optimized & bugfixed) */

const APP = {
  name: 'HGH Hildesheim',
  version: '1.1.0',
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
  'BER/WEZ': 'Berenfeld/Wenzel'
};

/**
 * Formatiert Lehrerkürzel zu vollem Namen
 * @param {string} teacher - Lehrerkürzel
 * @returns {string} Formatierter Name
 */
function formatTeacherName(teacher) {
  if (!teacher) return '—';
  return TEACHER_MAP[teacher] || teacher;
}

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

  // Update PDF links to match actual file name from meta.source
  if (data?.meta?.source) {
    const pdfHref = `./plan/${data.meta.source}`;
    for (const link of qsa('a[data-pdf-link]')) {
      link.href = pdfHref;
    }
  }

  // Show when timetable was last updated
  const lastUpdatedEl = qs('#ttLastUpdated');
  if (lastUpdatedEl && data?.meta?.updatedAt) {
    const d = new Date(data.meta.updatedAt);
    const formatted = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    lastUpdatedEl.textContent = `Stundenplan aktualisiert: ${formatted}`;
  }
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

      applyTimetableData(data);
      hideTimetableError(); // Daten geladen – kein Fehler anzeigen
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

// Doppelstunden-Paare: erste Stunde → zweite Stunde
const DOUBLE_LESSON_PAIRS = { '1': '2', '3': '4', '5': '6', '8': '9' };

/**
 * Rendert Stundenplan-Tabelle mit zusammengefassten Doppelstunden
 */
function renderTimetable() {
  const classId = state.els.classSelect?.value || 'HT11';
  const dayId = state.selectedDayId || getTodayId();

  const rows = state.timetable?.[classId]?.[dayId] || [];
  const body = state.els.timetableBody;
  if (!body) return;

  const bySlot = new Map(rows.map((r) => [r.slotId, r]));
  const skip = new Set();

  body.innerHTML = state.timeslots
    .map((s) => {
      if (skip.has(s.id)) return '';

      const r = bySlot.get(s.id);
      const secondId = DOUBLE_LESSON_PAIRS[s.id];
      const secondSlot = secondId ? state.timeslots.find((t) => t.id === secondId) : null;
      const isNote = !!r?.note;
      const noteClass = isNote ? ' note' : '';

      if (secondSlot) {
        skip.add(secondId);
        const timeFrom = s.time.split('–')[0];
        const timeTo = secondSlot.time.split('–')[1];
        const combinedTime = `${timeFrom}–${timeTo}`;
        const subject = r?.subject || '—';
        const teacher = r?.teacher ? formatTeacherName(r.teacher) : '—';
        const room = r?.room || '—';

        return `
        <div class="tr${noteClass}" role="row" aria-label="Stunde ${escapeHtml(s.id)}+${escapeHtml(secondId)}: ${escapeHtml(combinedTime)}">
          <div class="td"><span class="time">${escapeHtml(combinedTime)}</span></div>
          <div class="td">${escapeHtml(subject)}</div>
          <div class="td"><small>${escapeHtml(teacher)}</small></div>
          <div class="td"><small>${escapeHtml(room)}</small></div>
        </div>
      `;
      }

      const subject = r?.subject || '—';
      const teacher = r?.teacher ? formatTeacherName(r.teacher) : '—';
      const room = r?.room || '—';

      return `
      <div class="tr${noteClass}" role="row" aria-label="Stunde ${escapeHtml(s.id)}: ${escapeHtml(s.time)}">
        <div class="td"><span class="time">${escapeHtml(s.time)}</span></div>
        <div class="td">${escapeHtml(subject)}</div>
        <div class="td"><small>${escapeHtml(teacher)}</small></div>
        <div class="td"><small>${escapeHtml(room)}</small></div>
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
  const dayName = !isWeekday()
    ? 'Nächster Schultag (Montag)'
    : (DAYS.find((d) => d.id === todayId)?.label || 'Heute');

  todayLabel.textContent = `${dayName} · Klasse ${className}`;

  const allRows = (state.timetable?.[classId]?.[todayId] || [])
    .filter((r) => r.slotId !== '7'); // Mittagspause ausblenden

  // Doppelstunden zusammenfassen: nur erste Stunde jedes Paares behalten
  const secondSlots = new Set(Object.values(DOUBLE_LESSON_PAIRS));
  const mergedRows = allRows.filter((r) => !secondSlots.has(r.slotId)).slice(0, 4);

  if (mergedRows.length === 0) {
    list.innerHTML = `<div class="small muted">Keine Daten verfügbar.</div>`;
    return;
  }

  const slotTime = (slotId) => state.timeslots.find((s) => s.id === slotId)?.time || '';

  list.innerHTML = mergedRows
    .map((r) => {
      const subject = r?.subject ?? '—';
      const meta = formatTeacherRoom(r?.teacher, r?.room);
      const secondId = DOUBLE_LESSON_PAIRS[r.slotId];
      const slotLabel = secondId ? `${r.slotId}/${secondId}` : r.slotId;
      const noteClass = r.note ? ' note' : '';
      const noteHtml = r.note ? `<div class="sub">${escapeHtml(r.note)}</div>` : '';
      let time;
      if (secondId) {
        const timeFrom = slotTime(r.slotId).split('–')[0];
        const timeTo = slotTime(secondId).split('–')[1];
        time = `${timeFrom}–${timeTo}`;
      } else {
        time = slotTime(r.slotId);
      }
      return `
    <div class="listItem${noteClass}">
      <div>
        <div class="small muted">Std. ${escapeHtml(slotLabel)}</div>
        <div class="time">${escapeHtml(time)}</div>
      </div>
      <div>
        <div>${escapeHtml(subject)}</div>
        <div class="sub">${escapeHtml(meta || '—')}</div>
        ${noteHtml}
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
  const { classSelect } = state.els;
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
    if (String(s.id) === '7') continue; // Mittagspause überspringen
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
      <div class="weekCell weekCorner" role="columnheader">Zeit</div>
      ${DAYS.map((d) =>
        `<div class="weekCell" role="columnheader">${escapeHtml(d.label.slice(0, 2))}</div>`
      ).join('')}
    </div>
  `;

  // Doppelstunden-Zeilen: 1+2, 3+4, 5+6, 8+9
  const WEEK_PAIRS = [
    { firstId: '1', secondId: '2' },
    { firstId: '3', secondId: '4' },
    { firstId: '5', secondId: '6' },
    { firstId: '8', secondId: '9' }
  ];

  const body = WEEK_PAIRS
    .map((pair) => {
      const firstSlot = state.timeslots.find((s) => s.id === pair.firstId);
      const secondSlot = state.timeslots.find((s) => s.id === pair.secondId);
      if (!firstSlot || !secondSlot) return '';

      const timeFrom = firstSlot.time.split('–')[0];
      const timeTo = secondSlot.time.split('–')[1];
      const combinedTime = `${timeFrom}–${timeTo}`;

      const dayCells = DAYS.map((d) => {
        const rows = state.timetable?.[classId]?.[d.id] || [];
        const r = rows.find((x) => String(x.slotId) === pair.firstId);
        const subject = r?.subject || '—';
        const meta = formatTeacherRoom(r?.teacher, r?.room);
        const noteClass = r?.note ? ' note' : '';

        return `
          <div class="weekCell${noteClass}" role="cell">
            <div class="weekSubject">${escapeHtml(subject)}</div>
            ${meta ? `<div class="weekMeta">${escapeHtml(meta)}</div>` : `<div class="weekMeta muted">—</div>`}
          </div>
        `;
      }).join('');

      return `
        <div class="weekRow" role="row" aria-label="Doppelstunde ${escapeHtml(pair.firstId)}+${escapeHtml(pair.secondId)}">
          <div class="weekCell weekSlot" role="rowheader">
            <div class="weekSlotNum">${escapeHtml(pair.firstId)}/${escapeHtml(pair.secondId)}</div>
            <div class="weekSlotTime">${escapeHtml(combinedTime)}</div>
          </div>
          ${dayCells}
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

    timetableBody: qs('#timetableBody'),
    todayLabel: qs('#todayLabel'),
    todayPreview: qs('#todayPreview'),

    // Home extras
    nowTime: qs('#nowTime'),
    countdownText: qs('#countdownText'),
    funMessage: qs('#funMessage'),
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
    loadInstagramPreviews();

    console.log(`${APP.name} v${APP.version} geladen`);
  } catch (e) {
    console.error('Fehler beim Initialisieren:', e);
    // App läuft trotzdem weiter mit Defaults
  }
}

// --- Instagram Previews -------------------------------------------------

/**
 * Lädt Instagram-Vorschaudaten aus data/instagram.json (wenn vorhanden)
 * und füllt die Profilkarten mit Follower-Zahlen und Profilbildern
 */
async function loadInstagramPreviews() {
  try {
    const resp = await fetch('./data/instagram.json');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data?.profiles) return;

    for (const [id, profile] of Object.entries(data.profiles)) {
      // Follower count
      if (profile.followers) {
        const el = qs(`[data-ig-followers="${id}"]`);
        if (el) el.textContent = `${profile.followers} Follower`;
      }
      // Profile picture as avatar (replace logo)
      if (profile.profilePic) {
        const card = qs(`[data-ig="${id}"]`);
        const avatar = card ? qs('.igAvatar', card) : null;
        if (avatar) avatar.src = profile.profilePic;
      }
    }
  } catch {
    // instagram.json nicht vorhanden – kein Problem
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
