// Zentrale Pfad-/URL-Konfiguration (behavior-preserving)
// Hinweis: Alle Pfade sind relativ zum Repo-Root (GitHub Pages).

export const PATHS = Object.freeze({
  content: {
    timetableJson: './content/stundenplan.json',
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
    announcementsJson: './data/announcements.json',
    bellTimesJson: './data/bell-times.json',
  },
});
