# VNEXT Night-Run Plan

## Kurz-Analyse
- Routing/Hash-Handling: zentral in `src/app.js` (`hashchange`, `navigate`).
- Views: in `index.html` via `data-view` + Renderlogik in `src/app.js`.
- Datenquellen: `content/*` (Stundenplan/Kalender), `assets/data/*` (Announcements/TV), `assets/tv-slides/*`.
- Stundenplan-Quelle: primär `content/stundenplan.json`, PDF-Link über `meta.source`.
- Parser-Logik: `src/modules/timetable-parser.js` (JSON-Normalisierung), neuer PDF-V2 Parser in `src/parsers/pdf/`.
- Announcements/Kalender/TV/Slideshow: alles im App-Entry orchestriert.
- PWA/Offline: `service-worker.js` mit App-Shell-Cache + network-first für dynamische Inhalte.

## Top 3 Ursachen für unzuverlässiges PDF-Parsing
1. Es gab keine aktive, robuste PDF-Extraktionspipeline im Runtime-Code (nur JSON-Normalisierung).
2. Fehlende Validierungsstufe + Fallback-Steuerung (kein klarer Parse/Validate/Failover-Fluss).
3. Fehlende Fixtures/Regression-Checks für PDF-Eingaben (keine reproduzierbaren Parser-Tests).

## Umsetzungsplan (max 15 Punkte)
1. Branch `feature/vnext-remake` erstellen.
2. App-Code von `/js` nach `/src` migrieren.
3. Zentrale Pfade in `src/config/paths.js` als Single Source festigen.
4. Daten-Layer `src/data/timetable-source.js` einführen.
5. PDF-Parser-V2 Pipeline implementieren (`extract → normalize → interpret → validate → output`).
6. Debug-Ausgabe über `?debugParser=1` ergänzen.
7. Fallback auf `content/stundenplan.json` bei Parse/Validate-Fehler.
8. Parser-Fixtures unter `tests/fixtures` anlegen (mind. 2 Fälle).
9. Parser-Testscript unter `tests/pdf-parser-v2.test.mjs` anlegen.
10. `index.html` auf neuen Entry `src/app.js` umstellen.
11. Service Worker auf neue Pfade + konsistente Dynamic-Cache-Strategie aktualisieren.
12. Admin-Doku für „Datei ersetzen → fertig“ erweitern.
13. PR-Entwurf + Testcheckliste in `docs/PR_DRAFT.md` ergänzen.
14. Smoke-Checks lokal ausführen.
15. Commits + PR erstellen.
