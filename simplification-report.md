# Repository-Vereinfachung (Analyse + Umsetzung)

## Phase 1 – Analyse

### Verzeichnis-Inventar (relevant, ohne `.git`/`node_modules`)

- **CORE (Laufzeit/GitHub Pages):**
  - `index.html`, `app.css`, `app.js`, `timetable-parser.js`, `manifest.json`, `service-worker.js`
  - `content/` (`stundenplan.json`, `kalender.ics`, `README_admin.txt`)
  - `assets/` (`data/`, `icons/`, `images/`, `plan/`)
  - `README.md`
- **LEGACY:**
  - `_legacy/**` (alte Parser, Skripte, Workflows, Alt-Daten, Doku)
- **BUILD/TOOL (nach Legacy verschoben):**
  - `_legacy/config/package.json`, `_legacy/config/package-lock.json`, `_legacy/config/.jshintrc`
  - `_legacy/tools/*.js`, `_legacy/scripts/*.js`, `_legacy/workflows/update-stundenplan.yml`
- **DUPLIKAT/Versionen nebeneinander:**
  - `pdf-parser.js`, `pdf-parser-v2.js`, `pdf-parser-specialized.js` (alle nach `_legacy/tools/`)
- **TEST (nach Legacy):**
  - `test-*.js` in `_legacy/tools/`
- **UNGENUTZT in Runtime:**
  - sämtliche Dateien in `_legacy/**`

### Referenzen (wer nutzt was)

- `index.html` bindet `app.css`, `app.js` und `manifest.json` ein.
- `app.js` lädt:
  - `content/stundenplan.json`
  - `content/kalender.ics`
  - `assets/data/fun-messages.json`
  - `assets/data/announcements/index.json` + Dateien in `assets/data/announcements/`
  - `assets/data/instagram.json`
  - registriert `service-worker.js`
- `service-worker.js` cached App-Shell + `content/*` + `assets/*`.

## Phase 2 – Zielstruktur

Umgesetzt wurde das Minimalprinzip:

```text
/
├─ index.html
├─ app.css
├─ app.js
├─ timetable-parser.js      # 1 erlaubte Zusatz-JS (Parser groß)
├─ manifest.json
├─ service-worker.js
├─ content/
├─ assets/
└─ _legacy/
```

## Phase 3 – Konsolidierung

- **CSS:** bleibt eine Datei (`app.css`).
- **JS:** Hauptdatei `app.js` + eine Zusatzdatei `timetable-parser.js`.
- **Tools/Build:** aktive Runtime entkoppelt von Tooling; Tooling nach `_legacy/` verschoben.
- **Content/Admin:** operative Dateien weiterhin klar in `content/`.
- **Assets:** konsolidiert in `assets/`.

## Phase 4 – Informationen-Seite (im Links-Tab)

- Im Links-Tab wurde ein neuer Button **„Informationen“** ergänzt.
- Inhalt:
  1. Installationsanleitung (kurz)
  2. Admin-Anleitung (Datei ersetzen → commit → neu laden)
- Gleichzeitig wurden die entsprechenden Widgets von der Startseite entfernt.

## Phase 5 – Aufräumen

- Service Worker auf neue Dateinamen/-pfade aktualisiert.
- Doppelte/alte Tool-Dateien nicht gelöscht, sondern nach `_legacy/` verschoben.

## Abschluss

### Alte vs. neue Struktur (kurz)

- **Alt:** verstreute Ordner (`data/`, `icons/`, `images/`, `plan/`, `tools/`, `scripts/`, extra Anleitungseite, alter Manifest/SW-Name)
- **Neu:** klare Laufzeitstruktur mit `assets/` + `content/` + Root-Core-Dateien; Historisches zentral in `_legacy/`.

### Gelöschte Dateien

- **Keine harten Löschungen** produktiver oder unklarer Dateien; stattdessen Verschiebung nach `_legacy/`.

### Zusammengeführte/konsolidierte Bereiche

- `data/*` → `assets/data/*`
- `icons/*` → `assets/icons/*`
- `images/*` → `assets/images/*`
- `plan/*` → `assets/plan/*`
- Build/Test/Parser-Tooling (`tools/`, `scripts/`, config) → `_legacy/`

### Begründung verbleibender Dateien

- Root-Core-Dateien sind für GitHub Pages + PWA-Laufzeit zwingend.
- `content/` ist die einfache Admin-Schnittstelle (Datei ersetzen).
- `assets/` bündelt alle statischen Ressourcen an einer Stelle.
- `_legacy/` hält Risiko-Dateien aufbewahrt, ohne Runtime-Komplexität.
