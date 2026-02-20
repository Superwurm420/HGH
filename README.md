# HGH – Schüler App (PWA)

Die **HGH Schüler App** ist eine schlanke Progressive Web App für die Fachschule *Holztechnik und Gestaltung Hildesheim*.
Sie bündelt den Stundenplan, eine Home-Pinnwand, Kalendertermine, wichtige Links und Klassenfotos – optimiert für Smartphone und Offline-Nutzung.

---

## 1) Ziel & Nutzen

Die App soll:

- den aktuellen Stundenplan mobil bereitstellen,
- relevante Informationen zentral bündeln,
- auch ohne stabile Verbindung nutzbar bleiben,
- ohne Login/Frameworks leicht wartbar bleiben.

Technik-Stack: **HTML + CSS + Vanilla JavaScript** (keine Frontend-Frameworks).

---

## 2) Projektstruktur (Überblick)

```text
.
├── index.html                # Markup der App (Views, Links, Klassenfotos)
├── app.js                    # gesamte Frontend-Logik
├── styles.css                # UI-Styles
├── sw.js                     # Service Worker (Offline-Cache)
├── manifest.webmanifest      # PWA-Metadaten
├── data/
│   ├── timetable.json        # Stundenplan-Daten (aus PDF erzeugt)
│   ├── bulletin.json         # generierte Pinnwand-Daten (aus Textdateien)
│   ├── bulletins/            # 1 Datei = 1 Meldung/Termin
│   ├── fun-messages.json     # Kontexttexte im Home-Countdown
│   └── instagram.json        # gecachte Instagram-Vorschauwerte
├── plan/                     # Stundenplan-PDFs als Eingabe
├── images/                   # große Bilddateien (z. B. Klassenfotos)
├── icons/                    # Icons/Platzhalter/kleine Vorschaubilder
├── tools/                    # Hilfsskripte (Parser, Ingest, Instagram etc.)
└── .github/workflows/        # Automationen (Deploy, Datenupdates)
```

---

## 3) Lokales Arbeiten

### Voraussetzungen

- Node.js 20+ empfohlen
- npm

### Setup

```bash
npm install
```

### Qualitätssicherung

```bash
npm run lint
```

### Lokal testen (statischer Server)

```bash
python3 -m http.server 4173
```

Dann im Browser öffnen: `http://localhost:4173`.

---

## 4) Inhalte pflegen – was wird wo bearbeitet?

## 4.1 Stundenplan aktualisieren (PDF ➜ JSON)

Empfohlener Weg:

1. Neue PDF in `plan/` ablegen.
2. Parser-Pipeline ausführen:

   ```bash
   npm run timetable:ingest
   ```

3. Ergebnis prüfen (`data/timetable.json`).
4. Alte PDFs werden standardmäßig automatisch bereinigt (nur aktuelle bleibt).

Trockenlauf ohne Schreiben/Löschen:

```bash
npm run timetable:ingest:dry
```

### Hinweise

- Die Pipeline bewertet mehrere Parser-Varianten und nimmt die beste Qualität.
- `data/timetable.json` wird atomar geschrieben (keine halbfertigen Dateien).

---

## 4.2 Pinnwand auf der Startseite (Veranstaltungen/Nachrichten)

Die Pinnwand arbeitet jetzt **dateibasiert**:

- Jede Datei in `data/bulletins/*.txt` entspricht genau **einem Termin/einer Meldung**.
- Alle gültigen Dateien werden zusammen angezeigt.
- Wird eine Datei gelöscht, verschwindet der Termin nach dem nächsten Ingest automatisch.

### Gewünschter Ablauf für Verwalter

1. Neue `.txt`-Datei in `data/bulletins/` hochladen (z. B. `2026-03-24-tag-der-offenen-tuer.txt`).
2. Datei folgt dem vorgegebenen einfachen Format (siehe unten).
3. `data/bulletin.json` wird aus allen Textdateien generiert (lokal via Script oder automatisch per GitHub Action).

### Einfaches Dateiformat (pro Termin)

```txt
Title: Tag der offenen Tür
Type: event
Start: 2026-03-24 08:00
End: 2026-03-24 16:00
Link: https://example.org
LinkLabel: Details
---
Am Freitag gibt es Infos und Workshops in Gebäude B.
Treffpunkt ist um 08:00 Uhr im Foyer.
```

### Felder

- `Title` (optional, sonst Dateiname)
- `Type` (optional: `info`, `event`, `warning`)
- `Start` (optional)
- `End` (optional)
- `Link` (optional)
- `LinkLabel` (optional)
- Text unter `---` = eigentliche Nachricht (Pflicht)

### Ingest lokal (für Kontrolle)

```bash
npm run bulletin:ingest
```

Ohne Dateien (oder ohne Nachrichtentext) bleibt die Pinnwand unsichtbar.

---

## 4.3 Fun-/Hinweistexte im Home-Widget

Datei: `data/fun-messages.json`

Hier können Standardtexte und klassenbezogene Varianten gepflegt werden, z. B.:

- `beforeSchool`
- `beforeLesson`
- `duringLesson`
- `betweenBlocks`
- `lunch`
- `afterSchool`

Platzhalter in Texten:

- `{classId}`
- `{subject}`
- `{nextSubject}`
- `{slotLabel}`

---

## 4.4 Instagram-Vorschauwerte

Datei: `data/instagram.json`

Automatisch aktualisieren:

```bash
node tools/fetch-instagram-preview.js
```

Das Script befüllt u. a. `profilePic`, `followers` und Beschreibungen (wenn abrufbar).

---

## 4.5 Links & "Einträge" in der Weiteres-Ansicht

Statische Link-Karten werden in `index.html` gepflegt (Bereich "Weiteres"):

- Schul-Website
- IServ
- Instagram-Karten

Wenn neue Link-Karten hinzukommen:

1. Karte in `index.html` ergänzen,
2. bei Bedarf Styles in `styles.css` anpassen,
3. bei dynamischen IG-Werten auf korrektes `data-ig="..."` achten.

---

## 4.6 Bilder & Klassenfotos bearbeiten

Die Klassenfoto-Kacheln verweisen in `index.html` auf zwei Dateitypen:

- großes Zielbild: `images/class-*.jpg` (öffnet beim Klick)
- Vorschau/Tile: `icons/class-*.svg` (wird in der Kachel angezeigt)

### Empfohlener Ablauf

1. Neues Foto in `images/` mit sauberem Namen ablegen (z. B. `class-ht21.jpg`).
2. Passende Kachel-Grafik in `icons/` ablegen/aktualisieren.
3. Referenzen in `index.html` prüfen (`href` und `img src`).
4. App lokal testen (mobil + Desktop).

### Hinweis zu Icons

Es gibt **keine verpflichtende automatische Icon-Generierung** mehr im Projekt.
Alle Bilddateien in `icons/` und `images/` können direkt ersetzt werden (gleicher Dateiname = sofort wirksam).

### Best Practices für Bilder

- Dateinamen klein, ohne Leerzeichen (`kebab-case`).
- Für große Fotos sinnvolle Kompression nutzen (Ladezeit).
- Für fehlende Bilder vorerst `icons/class-placeholder.svg` verwenden.

---

## 5) PWA / Offline-Verhalten

Die App nutzt einen Service Worker (`sw.js`) mit App-Shell-Caching.
Wichtige statische Dateien (inkl. `data/timetable.json` und `data/bulletin.json`) werden gecacht.

Bei Änderungen an Offline-Assets:

- Cache-Version in `sw.js` beachten,
- hartes Neuladen im Browser testen,
- Offline-Test durchführen (DevTools → Offline).

---

## 6) GitHub Actions / Automationen

### Deploy

- `.github/workflows/static.yml` deployt die statische Seite auf GitHub Pages.

### Daten-Updates

- `.github/workflows/update-stundenplan.yml`
  - reagiert auf neue PDFs in `plan/`
  - generiert `data/timetable.json`
  - aktualisiert optional Instagram-Previews
- `.github/workflows/update-bulletins.yml`
  - reagiert auf Änderungen in `data/bulletins/*.txt`
  - generiert daraus `data/bulletin.json`
- `.github/workflows/update-instagram.yml`
  - aktualisiert regelmäßig `data/instagram.json`

---

## 7) Häufige Pflege-Tasks (Cheatsheet)

### Stundenplan aktualisieren

```bash
npm run timetable:ingest
```

### Nur prüfen (kein Schreiben)

```bash
npm run timetable:ingest:dry
```

### Pinnwand aus Textdateien generieren

```bash
npm run bulletin:ingest
```

### Lint

```bash
npm run lint
```

---

## 8) Fehlerbilder & schnelle Lösungen

- **Pinnwand erscheint nicht**
  - liegt mindestens eine gültige Datei in `data/bulletins/*.txt`?
  - steht der Nachrichtentext unter `---`?
  - `Start`/`End` im gültigen Zeitraum?
  - wurde `bulletin.json` neu generiert (lokal oder via Action)?

- **Neue Bilder werden nicht angezeigt**
  - Pfad und Dateiname in `index.html` prüfen.
  - Browser-Cache/Service-Worker-Cache leeren und neu laden.

- **Stundenplan leer/alt**
  - Parser erneut laufen lassen.
  - `data/timetable.json` und `meta.updatedAt` prüfen.

---

## 9) Lizenz / Status

Aktueller Stand: **Beta**.
Die App ist auf robuste, einfache Wartung im Schulalltag ausgelegt und kann modular erweitert werden.
