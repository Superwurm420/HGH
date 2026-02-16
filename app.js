/* HGH Schüler-PWA – Final Refactor (2026-02-16)
 * Struktur: modulare Bereiche innerhalb eines IIFE.
 */

const App = (() => {
  // ---------------------------------------------------------------------------
  // Config & Static Data
  // ---------------------------------------------------------------------------
  const CONFIG = {
    appName: 'HGH Hildesheim',
    routes: ['home', 'timetable', 'week', 'links', 'instagram'],
    storageKeys: {
      theme: 'hgh_theme',
      classId: 'hgh_class',
      dayId: 'hgh_day',
      installHintShown: 'hgh_install_hint_shown',
      timetableCache: 'hgh_timetable_cache_v2',
      timetableCacheTs: 'hgh_timetable_cache_ts'
    }
  };

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

  const TEACHER_MAP = {
    STE: 'A. Steinau',
    WED: 'H. Westendorf',
    STI: 'J. Stille',
    BÜ: 'K. Bünte',
    HOFF: 'T. Hoffmann',
    GRO: 'A. Grotjahn',
    TAM: 'B. Tammen',
    WEN: 'J. Wendel',
    MEL: 'D. Mell',
    WEZ: 'Wenzel',
    HOG: 'Hogendorn',
    BER: 'A. Berenfeld',
    'BER/WEZ': 'Berenfeld/Wenzel'
  };

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

  const DOUBLE_SLOT_PAIRS = [
    ['1', '2'],
    ['3', '4'],
    ['5', '6'],
    ['8', '9']
  ];

  const CHANGELOG = [
    'Doppelstunden in der Wochenübersicht zusammengefasst',
    'Instagram-Bereich vereinheitlicht (Tracking-frei)',
    'Neue Countdown-Logik inklusive Pausenstatus',
    'App-Icons aktualisiert (HGH Grid Logo)',
    'Dark/Light Mode Switch repariert'
  ];

  // ---------------------------------------------------------------------------
  // State & DOM Cache
  // ---------------------------------------------------------------------------
  const STATE = {
    timeslots: DEFAULT_TIMESLOTS.slice(),
    timetable: buildEmptyTimetable(),
    timetableSource: 'unbekannt',
    selectedDayId: null,
    els: {}
  };

  function buildEmptyTimetable() {
    const empty = {};
    for (let i = 0; i < CLASSES.length; i += 1) {
      const cls = CLASSES[i];
      empty[cls.id] = { mo: [], di: [], mi: [], do: [], fr: [] };
    }
    return empty;
  }

  function cacheDom() {
    STATE.els = {
      navItems: qsa('.navItem'),
      views: qsa('.view'),
      classSelect: qs('#classSelect'),
      dayButtons: qsa('#daySelectGroup .dayBtn'),
      todayBtn: qs('#todayBtn'),
      weekClassSelect: qs('#weekClassSelect'),
      weekGrid: qs('#weekGrid'),
      timetableBody: qs('#timetableBody'),
      ttError: qs('#ttError'),
      ttErrorMsg: qs('#ttErrorMsg'),
      retryBtn: qs('#retryBtn'),
      todayLabel: qs('#todayLabel'),
      todayPreview: qs('#todayPreview'),
      nowTime: qs('#nowTime'),
      countdownText: qs('#countdownText'),
      funMessage: qs('#funMessage'),
      changelog: qs('#changelog'),
      netIndicator: qs('#netIndicator'),
      netLabel: qs('#netLabel'),
      installHint: qs('#installHint'),
      installBanner: qs('#installBanner'),
      installBannerClose: qs('#installBannerClose'),
      swStatus: qs('#swStatus'),
      year: qs('#year'),
      darkToggle: qs('#darkToggle')
    };
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeText(el, value) {
    if (el) el.textContent = value;
  }

  function getTodayId() {
    const day = new Date().getDay();
    switch (day) {
      case 1: return 'mo';
      case 2: return 'di';
      case 3: return 'mi';
      case 4: return 'do';
      case 5: return 'fr';
      default: return 'mo';
    }
  }

  function formatTeacherName(teacher) {
    if (!teacher) return '';
    return TEACHER_MAP[teacher] || teacher;
  }

  function formatTeacherRoom(teacher, room) {
    const prettyTeacher = formatTeacherName(teacher);
    const parts = [];
    if (prettyTeacher) parts.push(prettyTeacher);
    if (room) parts.push(room);
    return parts.join(' / ');
  }

  function parseSlotRange(range, baseDate) {
    const match = String(range).match(/(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/);
    if (!match) return null;
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    const withTime = (date, str) => {
      const parts = str.split(':').map(Number);
      date.setHours(parts[0], parts[1], 0, 0);
    };
    withTime(start, match[1]);
    withTime(end, match[2]);
    return { start, end };
  }

  function diffMinutesCeil(target, reference) {
    return Math.max(0, Math.ceil((reference.getTime() - target.getTime()) / 60000));
  }

  // ---------------------------------------------------------------------------
  // Theme Module
  // ---------------------------------------------------------------------------
  const Theme = (() => {
    function apply(theme) {
      const mode = theme === 'light' ? 'light' : 'dark';
      document.documentElement.dataset.theme = mode;
      try {
        localStorage.setItem(CONFIG.storageKeys.theme, mode);
      } catch (err) {
        console.warn('Theme storage failed', err);
      }
      const meta = qs('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', '#0b5cff');
    }

    function restore() {
      let stored = null;
      try {
        stored = localStorage.getItem(CONFIG.storageKeys.theme);
      } catch (err) {
        stored = null;
      }
      if (stored) {
        apply(stored);
        return;
      }
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      apply(prefersLight ? 'light' : 'dark');
    }

    function initToggle() {
      const btn = STATE.els.darkToggle;
      if (!btn) return;
      btn.addEventListener('click', () => {
        const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
        apply(current === 'light' ? 'dark' : 'light');
      });
    }

    function init() {
      restore();
      initToggle();
    }

    return { init, apply };
  })();

  // ---------------------------------------------------------------------------
  // Navigation Module
  // ---------------------------------------------------------------------------
  const Navigation = (() => {
    function setRoute(route) {
      for (let i = 0; i < STATE.els.navItems.length; i += 1) {
        const btn = STATE.els.navItems[i];
        const isActive = btn.getAttribute('data-route') === route;
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
      }
      for (let i = 0; i < STATE.els.views.length; i += 1) {
        const view = STATE.els.views[i];
        view.hidden = view.getAttribute('data-view') !== route;
      }
      history.replaceState(null, '', `#${route}`);
    }

    function init() {
      STATE.els.navItems.forEach((btn) => {
        btn.addEventListener('click', () => setRoute(btn.getAttribute('data-route')));
      });
      qsa('[data-route-jump]').forEach((el) => {
        el.addEventListener('click', () => setRoute(el.getAttribute('data-route-jump')));
      });
      const initial = (location.hash || '#home').replace('#', '');
      const known = CONFIG.routes.indexOf(initial) >= 0 ? initial : 'home';
      setRoute(known);
    }

    return { init, setRoute };
  })();

  // ---------------------------------------------------------------------------
  // Timetable Module
  // ---------------------------------------------------------------------------
  const Timetable = (() => {
    function ensureEmpty() {
      STATE.timetable = buildEmptyTimetable();
    }

    function applyData(data) {
      if (data && Array.isArray(data.timeslots) && data.timeslots.length) {
        STATE.timeslots = data.timeslots;
      } else {
        STATE.timeslots = DEFAULT_TIMESLOTS.slice();
      }
      STATE.timetable = (data && data.classes) || buildEmptyTimetable();
    }

    function persistCache(payload) {
      try {
        localStorage.setItem(CONFIG.storageKeys.timetableCache, JSON.stringify(payload));
        localStorage.setItem(CONFIG.storageKeys.timetableCacheTs, new Date().toISOString());
      } catch (err) {
        console.warn('Timetable cache failed', err);
      }
    }

    function readCache() {
      try {
        const cacheRaw = localStorage.getItem(CONFIG.storageKeys.timetableCache);
        if (cacheRaw) return JSON.parse(cacheRaw);
      } catch (err) {
        console.warn('Cache parse failed', err);
      }
      return null;
    }

    async function load(options) {
      const opts = options || {};
      const forceNetwork = opts.forceNetwork === true;
      const url = './data/timetable.json';
      let lastError = null;

      if (!forceNetwork && typeof navigator !== 'undefined' && navigator.onLine === false) {
        lastError = new Error('offline');
      } else {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          applyData(data);
          persistCache(data);
          hideError();
          STATE.timetableSource = 'Netzwerk';
          return 'network';
        } catch (err) {
          lastError = err;
        }
      }

      const cached = readCache();
      if (cached) {
        applyData(cached);
        STATE.timetableSource = lastError && lastError.message === 'offline' ? 'Cache (offline)' : 'Cache';
        showError('Offline-Fallback aktiv. Daten aus dem lokalen Cache.', 'cache');
        return 'cache';
      }

      ensureEmpty();
      STATE.timetableSource = 'leer';
      showError('Keine Stundenplan-Daten verfügbar. Bitte später erneut versuchen.', 'empty');
      return 'empty';
    }

    function showError(message, mode) {
      if (!STATE.els.ttError || !STATE.els.ttErrorMsg) return;
      STATE.els.ttError.hidden = false;
      STATE.els.ttErrorMsg.textContent = message;
      if (STATE.els.retryBtn) {
        const offline = mode === 'cache' && navigator.onLine === false;
        STATE.els.retryBtn.disabled = offline;
      }
    }

    function hideError() {
      if (STATE.els.ttError) STATE.els.ttError.hidden = true;
    }

    function setActiveDayButton(dayId) {
      STATE.els.dayButtons.forEach((btn) => {
        const isActive = btn.getAttribute('data-day') === dayId;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
    }

    function initSelects() {
      const classSelect = STATE.els.classSelect;
      if (!classSelect) return;

      classSelect.innerHTML = CLASSES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
      let savedClass = null;
      try {
        savedClass = localStorage.getItem(CONFIG.storageKeys.classId);
      } catch (err) {
        savedClass = null;
      }
      if (!CLASSES.some((c) => c.id === savedClass)) savedClass = 'HT11';
      classSelect.value = savedClass;

      let savedDay = null;
      try {
        savedDay = localStorage.getItem(CONFIG.storageKeys.dayId);
      } catch (err) {
        savedDay = null;
      }
      STATE.selectedDayId = DAYS.some((d) => d.id === savedDay) ? savedDay : getTodayId();
      setActiveDayButton(STATE.selectedDayId);

      classSelect.addEventListener('change', () => {
        const value = classSelect.value;
        try {
          localStorage.setItem(CONFIG.storageKeys.classId, value);
        } catch (err) {
          console.warn('class storage failed', err);
        }
        if (STATE.els.weekClassSelect) STATE.els.weekClassSelect.value = value;
        renderAll();
      });

      STATE.els.dayButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const dayId = btn.getAttribute('data-day');
          if (!dayId) return;
          STATE.selectedDayId = dayId;
          try {
            localStorage.setItem(CONFIG.storageKeys.dayId, dayId);
          } catch (err) {
            console.warn('day storage failed', err);
          }
          setActiveDayButton(dayId);
          renderTimetable();
        });
      });

      if (STATE.els.todayBtn) {
        STATE.els.todayBtn.addEventListener('click', () => {
          const today = getTodayId();
          STATE.selectedDayId = today;
          try {
            localStorage.setItem(CONFIG.storageKeys.dayId, today);
          } catch (err) {
            console.warn('day storage failed', err);
          }
          setActiveDayButton(today);
          renderTimetable();
        });
      }
    }

    function initWeekSelect() {
      const sel = STATE.els.weekClassSelect;
      if (!sel) return;
      sel.innerHTML = CLASSES.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
      let saved = null;
      try {
        saved = localStorage.getItem(CONFIG.storageKeys.classId);
      } catch (err) {
        saved = null;
      }
      if (!CLASSES.some((c) => c.id === saved)) saved = 'HT11';
      sel.value = saved;
      sel.addEventListener('change', () => {
        try {
          localStorage.setItem(CONFIG.storageKeys.classId, sel.value);
        } catch (err) {
          console.warn('class storage failed', err);
        }
        if (STATE.els.classSelect) STATE.els.classSelect.value = sel.value;
        renderAll();
      });
    }

    function renderTimetable() {
      const body = STATE.els.timetableBody;
      if (!body) return;
      const classId = STATE.els.classSelect ? STATE.els.classSelect.value : 'HT11';
      const dayId = STATE.selectedDayId || getTodayId();
      const rows = STATE.timetable[classId] && STATE.timetable[classId][dayId] ? STATE.timetable[classId][dayId] : [];
      const bySlot = {};
      for (let i = 0; i < rows.length; i += 1) {
        const entry = rows[i];
        bySlot[String(entry.slotId)] = entry;
      }
      const html = STATE.timeslots.map((slot) => {
        const row = bySlot[String(slot.id)];
        const subject = row && row.subject ? row.subject : '—';
        const meta = row ? formatTeacherRoom(row.teacher, row.room) : '';
        return (
          '<div class="tr" role="row" aria-label="' + escapeHtml(slot.time) + '">' +
            '<div class="td"><span class="time">' + escapeHtml(slot.time) + '</span></div>' +
            '<div class="td">' + escapeHtml(subject) + '</div>' +
            '<div class="td">' + (meta ? '<small>' + escapeHtml(meta) + '</small>' : '<small class="muted">&nbsp;</small>') + '</div>' +
          '</div>'
        );
      }).join('');
      body.innerHTML = html;
    }

    function renderTodayPreview() {
      const list = STATE.els.todayPreview;
      const label = STATE.els.todayLabel;
      if (!list || !label) return;
      const todayId = getTodayId();
      let classId = 'HT11';
      if (STATE.els.classSelect && STATE.els.classSelect.value) {
        classId = STATE.els.classSelect.value;
      } else {
        try {
          const stored = localStorage.getItem(CONFIG.storageKeys.classId);
          if (stored) classId = stored;
        } catch (err) {
          classId = 'HT11';
        }
      }
      const classObj = CLASSES.find((c) => c.id === classId);
      const className = classObj ? classObj.name : classId;
      const dayObj = DAYS.find((d) => d.id === todayId);
      const dayName = dayObj ? dayObj.label : 'Heute';
      label.textContent = `${dayName} · Klasse ${className}`;
      const rows = STATE.timetable[classId] && STATE.timetable[classId][todayId] ? STATE.timetable[classId][todayId] : [];
      const meaningful = rows.filter((row) => String(row.slotId) !== '7').slice(0, 4);
      if (!meaningful.length) {
        list.innerHTML = '<div class="small muted">Keine Einträge.</div>';
        return;
      }
      const getSlotTime = (slotId) => {
        const slot = STATE.timeslots.find((s) => String(s.id) === String(slotId));
        return slot ? slot.time : '';
      };
      list.innerHTML = meaningful.map((row) => {
        const meta = formatTeacherRoom(row.teacher, row.room);
        return (
          '<div class="listItem">' +
            '<div><div class="time">' + escapeHtml(getSlotTime(row.slotId)) + '</div></div>' +
            '<div>' +
              '<div>' + escapeHtml(row.subject || '—') + '</div>' +
              '<div class="sub">' + escapeHtml(meta || '') + '</div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    }

    function renderWeek() {
      const grid = STATE.els.weekGrid;
      const sel = STATE.els.weekClassSelect;
      if (!grid || !sel) return;
      const classId = sel.value || 'HT11';
      const header = '<div class="weekRow weekHeader" role="row">' +
        '<div class="weekCell weekCorner" role="columnheader">Stunde</div>' +
        DAYS.map((d) => `<div class="weekCell" role="columnheader">${escapeHtml(d.label.slice(0, 2))}</div>`).join('') +
      '</div>';

      const skipMap = {};
      const spanMap = {};
      for (let d = 0; d < DAYS.length; d += 1) {
        const day = DAYS[d];
        const entries = STATE.timetable[classId] && STATE.timetable[classId][day.id] ? STATE.timetable[classId][day.id] : [];
        const bySlot = {};
        entries.forEach((entry) => {
          bySlot[String(entry.slotId)] = entry;
        });
        DOUBLE_SLOT_PAIRS.forEach((pair) => {
          const a = bySlot[pair[0]];
          const b = bySlot[pair[1]];
          if (!a || !b) return;
          const sameSubject = (a.subject || '') === (b.subject || '');
          const sameTeacher = (a.teacher || '') === (b.teacher || '');
          const sameRoom = (a.room || '') === (b.room || '');
          if (sameSubject && sameTeacher && sameRoom) {
            spanMap[`${day.id}:${pair[0]}`] = 2;
            skipMap[`${day.id}:${pair[1]}`] = true;
          }
        });
      }

      const slots = STATE.timeslots.filter((slot) => String(slot.id) !== '7');
      const body = slots.map((slot) => {
        const cells = DAYS.map((day) => {
          const key = `${day.id}:${slot.id}`;
          if (skipMap[key]) return '';
          const entries = STATE.timetable[classId] && STATE.timetable[classId][day.id] ? STATE.timetable[classId][day.id] : [];
          const row = entries.find((entry) => String(entry.slotId) === String(slot.id));
          const subject = row && row.subject ? row.subject : '—';
          const meta = row ? formatTeacherRoom(row.teacher, row.room) : '';
          const span = spanMap[key] || 1;
          const spanAttr = span > 1 ? ` style="grid-row: span ${span};"` : '';
          return (
            `<div class="weekCell" role="cell"${spanAttr}>` +
              `<div class="weekSubject">${escapeHtml(subject)}</div>` +
              `<div class="weekMeta">${escapeHtml(meta || '')}</div>` +
            '</div>'
          );
        }).join('');
        return (
          '<div class="weekRow" role="row" aria-label="Stunde ' + escapeHtml(slot.id) + '">' +
            '<div class="weekCell weekSlot" role="rowheader">' +
              '<div class="weekSlotNum">' + escapeHtml(slot.id) + '</div>' +
              '<div class="weekSlotTime">' + escapeHtml(slot.time) + '</div>' +
            '</div>' +
            cells +
          '</div>'
        );
      }).join('');

      grid.innerHTML = `<div class="weekTable" role="rowgroup">${header}${body}</div>`;
    }

    function renderAll() {
      renderTimetable();
      renderTodayPreview();
      renderWeek();
      Home.renderChangelog();
    }

    function initRetry() {
      if (!STATE.els.retryBtn) return;
      STATE.els.retryBtn.addEventListener('click', async () => {
        await load({ forceNetwork: true });
        renderAll();
      });
    }

    return {
      load,
      renderAll,
      renderTimetable,
      renderWeek,
      initSelects,
      initWeekSelect,
      initRetry,
      hideError,
      showError
    };
  })();

  // ---------------------------------------------------------------------------
  // Home Module (Countdown, Fun Message, Network, Changelog)
  // ---------------------------------------------------------------------------
  const Home = (() => {
    function getDayRanges(dayId, baseDate) {
      const ranges = [];
      for (let i = 0; i < STATE.timeslots.length; i += 1) {
        const slot = STATE.timeslots[i];
        if (String(slot.id) === '7') continue;
        const parsed = parseSlotRange(slot.time, baseDate);
        if (parsed) {
          ranges.push({ slotId: String(slot.id), start: parsed.start, end: parsed.end });
        }
      }
      ranges.sort((a, b) => a.start - b.start);
      return ranges;
    }

    function updateCountdown() {
      const nowLabel = STATE.els.nowTime;
      const textLabel = STATE.els.countdownText;
      if (!nowLabel || !textLabel) return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      nowLabel.textContent = `${hh}:${mm}`;
      const today = getTodayId();
      const isSchoolDay = ['mo', 'di', 'mi', 'do', 'fr'].indexOf(today) >= 0;
      if (!isSchoolDay) {
        textLabel.textContent = 'Wochenende – keine Stunden.';
        return;
      }
      const ranges = getDayRanges(today, now);
      if (!ranges.length) {
        textLabel.textContent = 'Keine Zeiten hinterlegt.';
        return;
      }
      const last = ranges[ranges.length - 1];
      if (now > last.end) {
        textLabel.textContent = 'Für heute ist Schluss – bis morgen!';
        return;
      }
      const current = ranges.find((range) => now >= range.start && now < range.end);
      if (current) {
        const mins = diffMinutesCeil(now, current.end);
        textLabel.textContent = `Stunde endet in ${mins} Min`;
        return;
      }
      const next = ranges.find((range) => now < range.start);
      if (next) {
        const mins = diffMinutesCeil(now, next.start);
        textLabel.textContent = `Nächste Stunde in ${mins} Min`;
        return;
      }
      textLabel.textContent = 'Für heute ist Schluss – bis morgen!';
    }

    function getFunMessage(now) {
      const day = now.getDay();
      const hour = now.getHours();
      if (day === 1) return 'Montag – wir schaffen das!';
      if (day === 5) return 'Freitag! Endspurt. 🥳';
      if (hour < 8) return 'Guten Morgen – Kaffee schon am Start?';
      if (hour >= 15) return 'Fast geschafft, halt noch kurz durch.';
      return 'Viel Erfolg heute!';
    }

    function updateFunMessage() {
      const el = STATE.els.funMessage;
      if (!el) return;
      el.textContent = getFunMessage(new Date());
    }

    function initCountdown() {
      updateCountdown();
      updateFunMessage();
      window.setInterval(() => {
        updateCountdown();
        updateFunMessage();
      }, 15000);
    }

    function updateNetworkIndicator() {
      const ind = STATE.els.netIndicator;
      const label = STATE.els.netLabel;
      if (!ind || !label) return;
      const online = navigator.onLine;
      ind.dataset.status = online ? 'online' : 'offline';
      const source = STATE.timetableSource || 'unbekannt';
      label.textContent = `${online ? 'Online' : 'Offline'} · Daten: ${source}`;
    }

    function initNetworkIndicator() {
      updateNetworkIndicator();
      window.addEventListener('online', updateNetworkIndicator);
      window.addEventListener('offline', updateNetworkIndicator);
    }

    function renderChangelog() {
      if (!STATE.els.changelog) return;
      STATE.els.changelog.innerHTML = CHANGELOG.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');
    }

    function init() {
      renderChangelog();
      initCountdown();
      initNetworkIndicator();
    }

    return { init, renderChangelog, updateNetworkIndicator };
  })();

  // ---------------------------------------------------------------------------
  // Install Hint & PWA Module
  // ---------------------------------------------------------------------------
  const Install = (() => {
    function hasSeenBanner() {
      try {
        return localStorage.getItem(CONFIG.storageKeys.installHintShown) === '1';
      } catch (err) {
        return false;
      }
    }

    function markSeen() {
      try {
        localStorage.setItem(CONFIG.storageKeys.installHintShown, '1');
      } catch (err) {
        console.warn('install hint storage failed', err);
      }
    }

    function initBanner() {
      const banner = STATE.els.installBanner;
      const closeBtn = STATE.els.installBannerClose;
      if (!banner) return;
      if (!window.matchMedia('(display-mode: standalone)').matches && !hasSeenBanner()) {
        banner.hidden = false;
      }
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          banner.hidden = true;
          markSeen();
        });
      }
    }

    function initInstallEvents() {
      const hint = STATE.els.installHint;
      if (!hint) return;
      window.addEventListener('beforeinstallprompt', (event) => {
        event.preventDefault();
        safeText(hint, 'Installierbar: Menü → "App installieren".');
      });
      window.addEventListener('appinstalled', () => {
        safeText(hint, 'Installiert – läuft auch offline.');
        markSeen();
        if (STATE.els.installBanner) STATE.els.installBanner.hidden = true;
      });
    }

    function init() {
      initBanner();
      initInstallEvents();
    }

    return { init };
  })();

  const PWA = (() => {
    async function initServiceWorker() {
      const status = STATE.els.swStatus;
      if (!('serviceWorker' in navigator)) {
        safeText(status, 'Service Worker nicht verfügbar.');
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        safeText(status, 'Offline-Cache aktiv.');
        if (reg.waiting) safeText(status, 'Update verfügbar – bitte neu laden.');
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              safeText(status, 'Update verfügbar – bitte neu laden.');
            }
          });
        });
      } catch (err) {
        safeText(status, 'Service Worker Fehler.');
        console.error(err);
      }
    }

    return { initServiceWorker };
  })();

  // ---------------------------------------------------------------------------
  // Footer helper
  // ---------------------------------------------------------------------------
  function initFooter() {
    const year = new Date().getFullYear();
    safeText(STATE.els.year, String(year));
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  async function init() {
    cacheDom();
    Theme.init();
    Navigation.init();
    Timetable.initSelects();
    Timetable.initWeekSelect();
    Timetable.initRetry();

    await Timetable.load();
    Timetable.renderAll();
    Home.updateNetworkIndicator();

    Home.init();
    Install.init();
    PWA.initServiceWorker();
    initFooter();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
