# HGH – Schüler-PWA

Minimal gehaltene Schul-PWA (Vanilla HTML/CSS/JS) für GitHub Pages.

## Setup / Entwicklung

- Lokaler Test (ohne Build):
  ```bash
  python3 -m http.server 8080
  # dann: http://127.0.0.1:8080
  ```

## Aktive Struktur (Stand: Refactor)

```text
/
├─ index.html
├─ app.css
├─ src/
│  ├─ app.js                      # App entry (ESM)
│  ├─ config/
│  │  └─ paths.js                 # zentrale Pfade/URLs
│  ├─ data/
│  │  └─ timetable-source.js      # Quelle + Fallback-Steuerung
│  ├─ modules/
│  │  └─ timetable-parser.js      # JSON-Normalisierung
│  ├─ parsers/
│  │  └─ pdf/
│  │     └─ pdf-timetable-v2.js   # PDF Parser V2 Pipeline
│  └─ utils/
│     ├─ dom.js
│     ├─ storage.js
│     └─ text.js
├─ manifest.json
├─ service-worker.js
├─ content/
│  ├─ stundenplan.json
│  ├─ kalender-quellen.txt
│  └─ README_admin.txt
├─ assets/
│  ├─ data/
│  │  ├─ announcements/
│  │  ├─ fun-messages.json
│  │  └─ runtime/                  # ehemals /data
│  │     ├─ announcements.json
│  │     └─ bell-times.json
│  ├─ icons/
│  ├─ images/
│  ├─ plan/
│  └─ tv-slides/
├─ tests/
│  ├─ fixtures/
│  └─ pdf-parser-v2.test.mjs
└─ _legacy/
   └─ ... (alte Tools/Workflows/Archive)
```

## Installation (für Nutzer)

- **Android:** Browser-Menü → **„App installieren“**
- **iOS:** **Teilen** → **„Zum Home-Bildschirm“**

## Admin: Updates (idiotensicher)

### A) Stundenplan (Standard/Fallback JSON)
1. Datei ersetzen: `content/stundenplan.json`
2. Commit + Push nach GitHub
3. App neu laden (bei Bedarf Hard-Reload)

**Hinweis (PDF-Link):**
- Das PDF wird automatisch aus `content/stundenplan.json` gelesen (`meta.source`).
- Das PDF muss unter `assets/plan/<meta.source>` liegen.



### B) Kalender (Quellenliste)
1. Datei ersetzen: `content/kalender-quellen.txt`
2. Commit + Push
3. Neu laden

### C) PDF-Stundenplan austauschen
1. Neue PDF nach `assets/plan/` hochladen
2. In `content/stundenplan.json` in `meta.source` den Dateinamen setzen (oder beibehalten, wenn du denselben Dateinamen nutzt)
3. Commit + Push

### D) TV-Daten
- `assets/data/runtime/bell-times.json`
- `assets/data/runtime/announcements.json`

## Hinweis zu Legacy-Dateien

Nicht mehr aktive Parser-, Test- und Build-Hilfen liegen unter `_legacy/` und werden von der Laufzeit nicht benötigt.

## Refactor Notes

- Pfade/URLs werden zentral über `src/config/paths.js` verwaltet.
- Änderungen sollen behavior-preserving sein (keine sichtbaren UI/Feature-Änderungen, außer Bugfix + Doku).

