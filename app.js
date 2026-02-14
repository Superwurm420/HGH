/* HTG Hildesheim PWA – vanilla JS */

const APP = {
  name: 'HTG Hildesheim',
  storageKeys: {
    theme: 'htg_theme',
    classId: 'htg_class',
    dayId: 'htg_day'
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

const TIMESLOTS = [
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

// Beispiel-Stundenplan (Platzhalter). Struktur ist final – kann 1:1 mit PDF-Daten gefüllt werden.
// timetable[classId][dayId] = Array<{slotId, subject, teacherRoom}>
const TIMETABLE = buildPlaceholderTimetable();

function buildPlaceholderTimetable(){
  const template = {
    mo: [
      row('1','Materialkunde','M. Becker'),
      row('2','Deutsch','F. Krüger'),
      row('3','MEL','T. Hansen'),
      row('4','Modul: Konstruktion','S. Weber'),
      row('5','Englisch','A. Meyer'),
      row('6','Projekt','Team'),
      row('7','—',''),
      row('8','Werkstatt','W. Schulz'),
      row('9','Werkstatt','W. Schulz')
    ],
    di: [
      row('1','Mathematik','R. König'),
      row('2','Materialkunde','M. Becker'),
      row('3','CAD','S. Weber'),
      row('4','CAD','S. Weber'),
      row('5','Deutsch','F. Krüger'),
      row('6','Sport / Bewegung','—'),
      row('7','—',''),
      row('8','Projekt','Team'),
      row('9','Projekt','Team')
    ],
    mi: [
      row('1','Englisch','A. Meyer'),
      row('2','Englisch','A. Meyer'),
      row('3','Technologie','T. Hansen'),
      row('4','Technologie','T. Hansen'),
      row('5','Modul: Gestaltung','L. Fischer'),
      row('6','Modul: Gestaltung','L. Fischer'),
      row('7','—',''),
      row('8','Freiarbeit','—'),
      row('9','Freiarbeit','—')
    ],
    do: [
      row('1','Projekt','Team'),
      row('2','Projekt','Team'),
      row('3','Wirtschaft','J. Wolf'),
      row('4','Wirtschaft','J. Wolf'),
      row('5','Materialkunde','M. Becker'),
      row('6','MEL','T. Hansen'),
      row('7','—',''),
      row('8','Werkstatt','W. Schulz'),
      row('9','Werkstatt','W. Schulz')
    ],
    fr: [
      row('1','Deutsch','F. Krüger'),
      row('2','Mathematik','R. König'),
      row('3','Modul: Konstruktion','S. Weber'),
      row('4','Modul: Konstruktion','S. Weber'),
      row('5','Klassenteam / Orga','—'),
      row('6','Lernzeit','—'),
      row('7','—',''),
      row('8','—',''),
      row('9','—','')
    ]
  };

  const table = {};
  for(const c of CLASSES){
    // leichte Variation pro Klasse (nur Demo)
    table[c.id] = {};
    for(const d of DAYS){
      table[c.id][d.id] = template[d.id].map(r => ({...r}));
    }
  }
  // Beispiel: GT01 mehr Gestaltung
  if(table.GT01){
    table.GT01.mi = template.mi.map(r => ({...r}));
    table.GT01.mi = table.GT01.mi.map((r) => {
      if(r.slotId === '5' || r.slotId === '6') return {...r, subject:'Gestaltung / Design', teacherRoom:'L. Fischer'};
      return r;
    });
  }
  return table;
}

function row(slotId, subject, teacherRoom){
  return { slotId, subject, teacherRoom };
}

function qs(sel, root=document){return root.querySelector(sel)}
function qsa(sel, root=document){return Array.from(root.querySelectorAll(sel))}

function setTheme(theme){
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  localStorage.setItem(APP.storageKeys.theme, isLight ? 'light' : 'dark');
  // Theme color for address bar
  const meta = qs('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', isLight ? '#0b5cff' : '#0b5cff');
}

function initTheme(){
  const saved = localStorage.getItem(APP.storageKeys.theme);
  if(saved){
    setTheme(saved);
    return;
  }
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  setTheme(prefersLight ? 'light' : 'dark');
}

function initNav(){
  const navButtons = qsa('.navItem');

  function activate(route){
    for(const b of navButtons){
      const isActive = b.dataset.route === route;
      b.setAttribute('aria-current', isActive ? 'page' : 'false');
    }
    for(const v of qsa('.view')){
      v.hidden = v.dataset.view !== route;
    }
    history.replaceState(null,'',`#${route}`);
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => activate(btn.dataset.route));
  });

  // CTA jump buttons
  qsa('[data-route-jump]').forEach(el => {
    el.addEventListener('click', () => activate(el.dataset.routeJump));
  });

  const initial = (location.hash || '#home').replace('#','');
  const known = new Set(['home','timetable','links','instagram']);
  activate(known.has(initial) ? initial : 'home');
}

function initSelects(){
  const classSelect = qs('#classSelect');
  const daySelect = qs('#daySelect');
  if(!classSelect || !daySelect) return;

  classSelect.innerHTML = CLASSES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  daySelect.innerHTML = DAYS.map(d => `<option value="${d.id}">${d.label}</option>`).join('');

  const savedClass = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  const savedDay = localStorage.getItem(APP.storageKeys.dayId) || getTodayId();

  classSelect.value = CLASSES.some(c=>c.id===savedClass) ? savedClass : 'HT11';
  daySelect.value = DAYS.some(d=>d.id===savedDay) ? savedDay : 'mo';

  classSelect.addEventListener('change', () => {
    localStorage.setItem(APP.storageKeys.classId, classSelect.value);
    renderTimetable();
    renderTodayPreview();
  });

  daySelect.addEventListener('change', () => {
    localStorage.setItem(APP.storageKeys.dayId, daySelect.value);
    renderTimetable();
  });

  qs('#todayBtn')?.addEventListener('click', () => {
    const today = getTodayId();
    daySelect.value = today;
    localStorage.setItem(APP.storageKeys.dayId, today);
    renderTimetable();
  });
}

function getTodayId(){
  const d = new Date();
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const map = {1:'mo',2:'di',3:'mi',4:'do',5:'fr'};
  return map[day] || 'mo';
}

function renderTimetable(){
  const classId = qs('#classSelect')?.value || 'HT11';
  const dayId = qs('#daySelect')?.value || 'mo';

  const rows = TIMETABLE?.[classId]?.[dayId] || [];
  const body = qs('#timetableBody');
  if(!body) return;

  const bySlot = new Map(rows.map(r => [r.slotId, r]));

  body.innerHTML = TIMESLOTS.map(s => {
    const r = bySlot.get(s.id);
    const subject = r?.subject || '—';
    const tr = r?.teacherRoom || '';
    const isBreak = s.id === '7';

    return `
      <div class="tr" role="row" aria-label="${s.time}">
        <div class="td"><span class="time">${s.time}</span></div>
        <div class="td">${escapeHtml(subject)}${isBreak ? '' : ''}</div>
        <div class="td">${tr ? `<small>${escapeHtml(tr)}</small>` : '<small class="muted">&nbsp;</small>'}</div>
      </div>
    `;
  }).join('');
}

function renderTodayPreview(){
  const todayId = getTodayId();
  const todayLabel = qs('#todayLabel');
  const list = qs('#todayPreview');
  if(!todayLabel || !list) return;

  const classId = localStorage.getItem(APP.storageKeys.classId) || 'HT11';
  const className = CLASSES.find(c=>c.id===classId)?.name || classId;
  const dayName = DAYS.find(d=>d.id===todayId)?.label || 'Heute';

  todayLabel.textContent = `${dayName} · Klasse ${className}`;

  const rows = (TIMETABLE?.[classId]?.[todayId] || [])
    .filter(r => r.slotId !== '7')
    .slice(0,4);

  if(rows.length === 0){
    list.innerHTML = `<div class="small muted">Keine Daten.</div>`;
    return;
  }

  const slotTime = (slotId) => TIMESLOTS.find(s=>s.id===slotId)?.time || '';

  list.innerHTML = rows.map(r => `
    <div class="listItem">
      <div>
        <div class="time">${slotTime(r.slotId)}</div>
      </div>
      <div>
        <div>${escapeHtml(r.subject || '—')}</div>
        <div class="sub">${escapeHtml(r.teacherRoom || '')}</div>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#039;');
}

function initInstallHint(){
  const hint = qs('#installHint');
  if(!hint) return;

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    hint.textContent = 'Installierbar: Du kannst die App über das Browser-Menü installieren.';
  });

  window.addEventListener('appinstalled', () => {
    hint.textContent = 'App installiert – läuft auch offline (Basisfunktionen).';
    deferredPrompt = null;
  });
}

async function initServiceWorker(){
  const status = qs('#swStatus');
  if(!('serviceWorker' in navigator)){
    if(status) status.textContent = 'Service Worker nicht verfügbar.';
    return;
  }
  try{
    const reg = await navigator.serviceWorker.register('./sw.js');
    if(status) status.textContent = 'Offline-Cache aktiv.';

    // update flow
    if(reg.waiting){
      if(status) status.textContent = 'Update verfügbar – bitte neu laden.';
    }
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      sw?.addEventListener('statechange', () => {
        if(sw.state === 'installed' && navigator.serviceWorker.controller){
          if(status) status.textContent = 'Update verfügbar – bitte neu laden.';
        }
      });
    });
  } catch(err){
    if(status) status.textContent = 'Service Worker konnte nicht geladen werden.';
  }
}

function initFooter(){
  const year = qs('#year');
  if(year) year.textContent = String(new Date().getFullYear());
}

function initDarkToggle(){
  const btn = qs('#darkToggle');
  btn?.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    setTheme(current === 'light' ? 'dark' : 'light');
  });
}

function boot(){
  initTheme();
  initDarkToggle();
  initNav();
  initSelects();
  renderTimetable();
  renderTodayPreview();
  initInstallHint();
  initServiceWorker();
  initFooter();
}

document.addEventListener('DOMContentLoaded', boot);
