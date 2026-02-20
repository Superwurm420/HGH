Lege für jede Meldung eine eigene .txt-Datei in diesem Ordner an.

Dateiformat:
Title: Titel der Meldung
Type: info
Start: 2026-03-24 08:00
End: 2026-03-24 16:00
Link: https://example.org
LinkLabel: Mehr erfahren
---
Hier steht der eigentliche Meldungstext.
Du kannst mehrere Zeilen verwenden.

Hinweise:
- Type optional (info|event|warning), Standard = info
- Start/End optional
- Link/LinkLabel optional
- Sobald die Datei gelöscht wird und bulletin:ingest läuft, verschwindet die Meldung wieder.
