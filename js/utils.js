import { DAY_NUM_MAP } from './config.js';

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatSubject(str) {
  if (!str) return '—';
  return str.split('/').map(p => escapeHtml(p.trim())).join('<br>');
}

export function getISOWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

export function getTodayId() {
  return DAY_NUM_MAP[new Date().getDay()] || 'mo';
}

export function isWeekday() {
  const d = new Date().getDay();
  return d >= 1 && d <= 5;
}

export function getDateByDayOffset(base, offsetDays) {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  return d;
}

export function getEasterSunday(year) {
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

export function getHolidayLabel(date) {
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
