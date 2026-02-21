# PR Draft: vnext-remake parser + structure hardening

## Summary
- Moved runtime app code from `/js` to `/src` for clearer long-term maintenance.
- Added PDF Parser V2 pipeline with staged processing and validation.
- Added data-layer fallback: use parsed PDF raw source when valid, fallback to `content/stundenplan.json` when invalid/unavailable.
- Added parser debug output via `?debugParser=1`.
- Added parser fixtures and automated check script.
- Updated service worker caching to include new source paths and dynamic timetable raw source.

## Why
- Robust timetable ingestion is the #1 priority.
- Structure now better separates app code (`src`), admin content (`content`), static assets (`assets`), and checks (`tests`).

## Test checklist
- [ ] Home route loads and renders cards.
- [ ] `#timetable` shows data when online.
- [ ] `#tv` rotates clock + announcements + slides without duplicate timers.
- [ ] Parser debug works with `?debugParser=1`.
- [ ] Invalid `content/stundenplan.pdf.raw.json` falls back to `content/stundenplan.json`.
- [ ] App shell + dynamic content behave in offline mode with service worker.
