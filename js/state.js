import { CLASSES, DEFAULT_FUN_MESSAGES, DEFAULT_TIMESLOTS } from './config.js';

export function createInitialState() {
  return {
    timeslots: DEFAULT_TIMESLOTS,
    timeslotMap: new Map(DEFAULT_TIMESLOTS.map(s => [s.id, s])),
    timetable: null,
    classIds: [...CLASSES],
    selectedDayId: null,
    currentRoute: 'home',
    els: {},
    isLoading: false,
    autoRefreshTimer: null,
    lastSignature: null,
    lastRefreshAt: 0,
    installPromptEvent: null,
    countdownTimer: null,
    announcementsTimer: null,
    funMessages: DEFAULT_FUN_MESSAGES,
    currentPdfHref: null,
    hasTimetableData: false,
    timetableIssues: [],
    announcements: [],
    announcementIssues: [],
    cal: {
      events: {},
      enabled: {},
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      selectedDate: null,
    },
  };
}
