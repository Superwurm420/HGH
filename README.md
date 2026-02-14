# HGH Hildesheim – Schüler-PWA (Vanilla)

Schul-PWA (HTML/CSS/JS) für **Holztechnik und Gestaltung Hildesheim (Fachschule)** mit:
- Navigation: Home, Stundenplan, Links, Instagram
- Stundenplan: Klassen-Dropdown + Tagesauswahl (Heute/Mo–Fr)
- Dark Mode Toggle
- PWA: Manifest + Service Worker (Offline App-Shell)

## Start (lokal)

Service Worker funktioniert nur über HTTP(S) – nicht via `file://`.

```bash
cd /data/.openclaw/workspace/HGH
python3 -m http.server 5173
# dann öffnen: http://localhost:5173
```

## Stundenplan-Daten

Die App lädt den Stundenplan aus `data/timetable.json`.

Struktur (Auszug):

```json
{
  "meta": { "school": "HGH", "validFrom": "2026-01-19", "updatedAt": "..." },
  "timeslots": [ { "id": "1", "time": "08:00–08:45" } ],
  "classes": {
    "HT11": {
      "mo": [ { "slotId": "1", "subject": "Deutsch", "teacher": "Ho", "room": "6" } ]
    }
  }
}
```

### Offline-Fallback

Beim erfolgreichen Laden wird `timetable.json` zusätzlich in `localStorage` als *last-known-good* gespeichert und bei Offline/Fehlern verwendet.

## PDF Parser (Scaffold)

`tools/pdf-parser.js` ist ein Node-Script als Grundlage, um aus einer Stundenplan-PDF ein `data/timetable.json` zu generieren.

```bash
npm i -D pdf-parse
node tools/pdf-parser.js plan/stundenplan.pdf --out data/timetable.json --validFrom 2026-01-19
```

> Hinweis: PDFs sind layout-spezifisch – die eigentliche Zuordnung Klasse/Tag/Slot muss ggf. je nach PDF angepasst werden.

## Icons

Icons liegen in `icons/` (192/512 + maskable).
