# HGH – Schüler-PWA

Minimal gehaltene Schul-PWA (Vanilla HTML/CSS/JS) für GitHub Pages.

## Aktive Struktur

```text
/
├─ index.html
├─ app.css
├─ app.js
├─ timetable-parser.js
├─ manifest.json
├─ service-worker.js
├─ content/
│  ├─ stundenplan.json
│  ├─ kalender.ics
│  └─ README_admin.txt
├─ assets/
│  ├─ data/
│  ├─ icons/
│  ├─ images/
│  └─ plan/
└─ _legacy/
   └─ ... (alte Tools/Workflows/Archive)
```

## Installation (für Nutzer)

- **Android:** Browser-Menü → **„App installieren“**
- **iOS:** **Teilen** → **„Zum Home-Bildschirm“**

## Admin-Update (Datei ersetzen → commit → neu laden)

1. Datei in `content/` ersetzen (`stundenplan.json` oder `kalender.ics`).
2. Commit + Push nach GitHub.
3. App neu laden (bei Bedarf Hard-Reload).

## Hinweis zu Legacy-Dateien

Nicht mehr aktive Parser-, Test- und Build-Hilfen liegen unter `_legacy/` und werden von der Laufzeit nicht benötigt.
