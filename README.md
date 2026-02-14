# HTG Hildesheim – School PWA (Vanilla)

Minimalistische Schul-PWA (HTML/CSS/JS) mit:
- Navigation: Home, Stundenplan, Links, Instagram
- Stundenplan: Klassen-Dropdown + Tagesauswahl (Heute/Mo–Fr)
- Dark Mode Toggle
- PWA: Manifest + Service Worker (Offline App-Shell)

## Start (lokal)

Service Worker funktioniert nur über HTTP(S) – nicht via `file://`.

```bash
cd /data/.openclaw/workspace/school-pwa
python3 -m http.server 5173
# dann öffnen: http://localhost:5173
```

## Stundenplan-Daten einpflegen

In `app.js` ist `TIMETABLE` aktuell ein Platzhalter.
Struktur:

```js
timetable[classId][dayId] = [
  { slotId: '1', subject: 'Deutsch', teacherRoom: 'F. Krüger R101' },
  ...
]
```

- `classId`: HT11, HT12, HT21, HT22, G11, G21, GT01
- `dayId`: mo, di, mi, do, fr
- `slotId`: 1–9 (7 = Mittagspause)

## Icons

Icons liegen in `icons/` (192/512 + maskable).
