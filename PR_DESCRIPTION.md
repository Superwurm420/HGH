# PR: Clean Refactor (behavior-preserving)

## Ziel
Codequalität, Struktur und Wartbarkeit deutlich verbessern, **ohne** sichtbare UI-/Feature-Änderungen (außer Bugfixes, falls nötig).

## Änderungen (Summary)
- Zentrale Pfad-Konfiguration eingeführt: `js/config/paths.js`
- JavaScript neu strukturiert:
  - `app.js` → `js/app.js`
  - `timetable-parser.js` → `js/modules/timetable-parser.js`
  - kleine Helper extrahiert: `js/utils/*`
- Daten-Ordner vereinheitlicht:
  - `data/*` → `assets/data/runtime/*`
- Service Worker angepasst:
  - neue Asset-Pfade gecached
  - dynamische Daten weiterhin **network-first** (Timetable/Kalender/Announcements + runtime JSON)
- Dokumentation verbessert:
  - README: Setup + „How to update“ (PDF/JSON/ICS)
  - CHANGELOG neu

## Mapping alt → neu
- `./app.js` → `./js/app.js`
- `./timetable-parser.js` → `./js/modules/timetable-parser.js`
- `./data/announcements.json` → `./assets/data/runtime/announcements.json`
- `./data/bell-times.json` → `./assets/data/runtime/bell-times.json`

## Tests / Checks (manuell)
- [ ] Seite lädt auf GitHub Pages (kein 404 auf JS/CSS)
- [ ] Home: Countdown/Fun message sichtbar
- [ ] Stundenplan: Klassen/Tag wechseln, Daten werden gerendert
- [ ] PDF-Link: öffnet korrekt (Dateiname aus `content/stundenplan.json meta.source`)
- [ ] Kalender: ICS wird geladen, Events sichtbar
- [ ] Woche-View ok
- [ ] Links-View ok
- [ ] TV-View: Uhr + Slides + Announcements ok
- [ ] Offline: Service Worker cached App-Shell, dynamische Inhalte network-first mit fallback

## Hinweise
- Refactor ist bewusst in kleinen Commits gehalten, um Risiko zu minimieren.
- Keine Frameworks/Build-Pipeline eingeführt.
