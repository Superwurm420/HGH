// Zentrale Pfad-/URL-Konfiguration (Single Source of Truth)

export const PATHS = Object.freeze({
  content: {
    timetableJson: './content/stundenplan.json',
    timetablePdfRawJson: './content/stundenplan.pdf.raw.json',
    calendarIcs: './content/kalender.ics',
    adminReadme: './content/README_admin.txt',
  },
  assets: {
    planDir: './assets/plan/',
    funMessagesJson: './assets/data/fun-messages.json',
    announcements: {
      indexJson: './assets/data/announcements/index.json',
      dir: './assets/data/announcements/',
    },
    tvSlides: {
      indexJson: './assets/tv-slides/slides.json',
      dir: './assets/tv-slides/',
    },
  },
  data: {
    announcementsJson: './assets/data/runtime/announcements.json',
    bellTimesJson: './assets/data/runtime/bell-times.json',
  },
});
