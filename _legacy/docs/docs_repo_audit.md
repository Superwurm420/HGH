# Repository Audit & Usage Map

## Einstiegspunkt & geladene Assets
- **Startseite:** `index.html`
- **Route-/UI-Logik:** `app.js` (als ES-Modul in `index.html` eingebunden)
- **Globales Styling:** `app.css` (in `index.html` und `anleitung-dateien-austauschen.html` eingebunden)
- **PWA-Dateien:** `manifest.webmanifest`, `sw.js` (Registrierung in `app.js`)

## Top-Level Struktur (2 Ebenen)
- `.github/workflows/*` – Deploy-/Update-Automation
- `index.html` – Haupt-App
- `anleitung-dateien-austauschen.html` – Admin-Anleitungsseite
- `app.css` – komplettes UI-Styling
- `app.js` – Hauptlogik, Rendering, Datenladen, PWA-Initialisierung
- `js/` – modulare Hilfen (`config`, `state`, `utils`, `modules/timetable-pipeline`)
- `data/` – Runtime-Daten (`timetable.json`, `fun-messages.json`, `instagram.json`, `announcements/*`)
- `plan/` – Stundenplan-PDFs
- `icons/` – produktive Icons/Logos
- `images/` – Klassenfotos (aktuell Platzhalterstruktur)
- `scripts/` – Hilfsskripte
- `tools/` – Parser/Tests/Ingest-Tooling
- `_legacy/` – quarantänisierte Alt-/unsichere Dateien

## HTML-Dateien
| Datei | Zweck |
|---|---|
| `index.html` | Haupt-PWA mit Home-, Wochen-, Stundenplan-, Links-View |
| `anleitung-dateien-austauschen.html` | Wartungs-/Anleitungseite, lädt `data/anleitung-inhalt.html` dynamisch |
| `data/anleitung-inhalt.html` | Inhaltsfragment für die Anleitung |

## CSS-Dateien
| Datei | Nutzung |
|---|---|
| `app.css` | Einzige produktiv geladene Stylesheet-Datei für beide HTML-Seiten |

## JS-Dateien
| Datei | Verantwortlichkeit |
|---|---|
| `app.js` | App-Initialisierung, Routing, Rendering (Stundenplan/Woche/Kalender), SW-Registrierung |
| `js/config.js` | Konstanten & Konfiguration |
| `js/state.js` | Initialer State |
| `js/utils.js` | Utility-Funktionen |
| `timetable-parser.js` | Parsing/Normalisierung/Validierung Stundenplan |
| `scripts/apply-rooms.js` | Room-Mapping in Stundenplan anwenden |
| `scripts/generate-icons.js` | Icon-Generierung (Sharp) |
| `tools/*.js` | PDF-Parser/Ingest/Tests |

## PWA-relevante Dateien
- `manifest.webmanifest`
- `sw.js`
- `icons/icon-192.png`
- `icons/icon-512.png`
- `icons/icon-512-maskable.png`
- `icons/favicon.png`

## Cleanup-Entscheidungstabelle
| Pfad | Status | Begründung | Beleg |
|---|---|---|---|
| `app.css` | KEEP | Einzig geladene CSS-Datei | `index.html`, `anleitung-dateien-austauschen.html` binden nur diese Datei ein |
| `app.js` + `js/*` | KEEP | Produktive Laufzeitlogik | `index.html` lädt `app.js`; Importe in `app.js` |
| `archive/*` | MOVE → `_legacy/archive/*` | Historische Parser-/Dump-Dateien, nicht produktiv referenziert | Kein Verweis in `index.html`, `app.js`, `sw.js`, `package.json` |
| `icons/generate-icons.js` | MOVE → `_legacy/icons/generate-icons.js` | Zweites/duplizierendes Icon-Generator-Skript, produktiv ungenutzt | Keine Referenz in NPM-Skripten/Runtime |
| `icons/class-school.svg` | MOVE → `_legacy/icons/class-school.svg` | Aktuell ungenutztes Asset, daher quarantiniert statt gelöscht | Keine Referenz in HTML/CSS/JS/SW |
| `scripts/generate-icons.js` | KEEP | Aktives Generator-Skript im produktiven Tooling-Bereich | liegt im aktiven `scripts/`-Ordner |
| `sw.js` / `manifest.webmanifest` | KEEP (unverändert) | PWA-Stabilität, keine zwingende Änderung für Cleanup/UI nötig | Laufzeitreferenz in `app.js` / `index.html` |

