/* HGH Schüler-PWA – vanilla JS */

const APP = {
  name: 'HGH Hildesheim',
  storageKeys: {
    theme: 'hgh_theme',
    classId: 'hgh_class',
    dayId: 'hgh_day'
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

let TIMESLOTS = [
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

let TIMETABLE = null;

async function loadTimetable(){
  const url = './data/timetable.json';
  try{
    const res = await fetch(url, { cache: 'no-cache' });
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // allow override of timeslots
    if(Array.isArray(data?.timeslots) && data.timeslots.length){
      TIMESLOTS = data.timeslots;
    }

    // classes structure
    TIMETABLE = data?.classes || {};

    // persist a last-known-good cache for offline usage
    localStorage.setItem('hgh_timetable_cache_v1', JSON.stringify(data));
    localStorage.setItem('hgh_timetable_cache_ts', new Date().toISOString());
  } catch(err){
    // fallback to last cached timetable
    try{
      const cached = localStorage.getItem('hgh_timetable_cache_v1');
      if(cached){
        const data = JSON.parse(cached);
        if(Array.isArray(data?.timeslots) && data.timeslots.length){
          TIMESLOTS = data.timeslots;
        }
        TIMETABLE = data?.classes || {};
      }
    } catch {}

    // ultimate fallback: empty structure
    if(!TIMETABLE){
      TIMETABLE = {};
      for(const c of CLASSES){
        TIMETABLE[c.id] = { mo: [], di: [], mi: [], do: [], fr: [] };
      }
    }
  }
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

async function boot(){
  initTheme();
  initDarkToggle();
  initNav();
  initSelects();

  await loadTimetable();
  renderTimetable();
  renderTodayPreview();

  initInstallHint();
  initServiceWorker();
  initFooter();
}

document.addEventListener('DOMContentLoaded', boot);
