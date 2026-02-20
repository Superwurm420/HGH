export const APP = {
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
    AUTO_REFRESH_INTERVAL: 5 * 60 * 1000,
    MIN_REFRESH_GAP: 60 * 1000
  }
};

export const CLASSES = ['HT11', 'HT12', 'HT21', 'HT22', 'G11', 'G21', 'GT01'];

export const DAYS = [
  { id: 'mo', label: 'Montag' },
  { id: 'di', label: 'Dienstag' },
  { id: 'mi', label: 'Mittwoch' },
  { id: 'do', label: 'Donnerstag' },
  { id: 'fr', label: 'Freitag' }
];

export const DAY_IDS = ['mo', 'di', 'mi', 'do', 'fr'];

export const DEFAULT_TIMESLOTS = [
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

export const DOUBLE_PAIRS = { '1': '2', '3': '4', '5': '6', '8': '9' };
export const SECOND_SLOTS = new Set(Object.values(DOUBLE_PAIRS));
export const WEEK_PAIRS = [
  { first: '1', second: '2' },
  { first: '3', second: '4' },
  { first: '5', second: '6' },
  { first: '8', second: '9' }
];
export const ROUTES_SET = new Set(APP.routes);
export const DAY_NUM_MAP = { 1: 'mo', 2: 'di', 3: 'mi', 4: 'do', 5: 'fr' };
export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
];
export const WEEKDAY_LABELS = {
  mo: 'Montag',
  di: 'Dienstag',
  mi: 'Mittwoch',
  do: 'Donnerstag',
  fr: 'Freitag',
  sa: 'Samstag',
  so: 'Sonntag'
};
export const CORS_PROXY = 'https://corsproxy.io/?url=';
export const FUN_MESSAGES_URL = './data/fun-messages.json';
export const ANNOUNCEMENTS_INDEX_URL = './data/announcements/index.json';
export const ANNOUNCEMENTS_DIR_URL = './data/announcements/';
export const MESSAGE_PHASES = ['beforeSchool', 'beforeLesson', 'duringLesson', 'betweenBlocks', 'lunch', 'afterSchool', 'weekend', 'holiday', 'noLessons'];
export const CALENDAR_VISIBLE_WINDOW_DAYS = {
  past: 30,
  future: 400,
};
export const DEFAULT_FUN_MESSAGES = {
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

export const CAL_CONFIGS = [
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
