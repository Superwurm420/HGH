HGH – Schüler App (Beta)

Progressive Web App (PWA) für die Holztechnik und Gestaltung Hildesheim.

Die App richtet sich an Schüler*innen der Fachschule und bündelt zentrale Informationen wie Stundenplan, Offline-Zugriff und zukünftige Erweiterungen in einer schlanken Web-Anwendung.

⸻

🎯 Ziel der App

Die HGH Schüler App soll:
	•	den aktuellen Stundenplan digital und mobil verfügbar machen
	•	auch offline funktionieren
	•	schnell, leichtgewichtig und ohne Login nutzbar sein
	•	als Grundlage für zukünftige Schul-Features dienen

Die Anwendung ist bewusst minimalistisch gehalten und basiert auf reinem HTML, CSS und JavaScript (keine Framework-Abhängigkeiten).


⸻

📱 Installation (minimal)

- **Android:** Browser-Menü öffnen → **„App installieren“** wählen.
- **iOS (Safari):** **Teilen** tippen → **„Zum Home-Bildschirm“** wählen.

⸻

📄 Stundenplan per PDF aktualisieren

	1.	Neue Stundenplan-PDF in `plan/` hochladen.

	2.	`npm run timetable:ingest` ausführen.

	3.	Das Script erkennt automatisch die neueste passende PDF (auch Sonderpläne), testet mehrere Parser-Varianten und übernimmt nur das qualitativ beste Ergebnis (mit Mindest-Qualitätsprüfung).

	4.	`content/stundenplan.json` wird atomar geschrieben (kein halbgeschriebener Zustand bei Fehlern).

	5.	Alte Stundenplan-PDFs werden dabei automatisch entfernt (standardmäßig bleibt nur die aktuelle Datei erhalten).

	6.	App neu laden – der aktualisierte Stundenplan wird angezeigt.

Optional: Mit `npm run timetable:ingest:dry` kann der Ablauf ohne Schreiben/Löschen geprüft werden.

⸻


### Daten-Pipeline (Stundenplan)

Die App verarbeitet `content/stundenplan.json` jetzt in einer klaren Pipeline:
1. **Input:** Laden der JSON-Datei (Netzwerk + Cache-Fallback)
2. **Parsing/Normalisierung:** Vereinheitlichung von Zeitslots, Klassen, Tagesdaten und `sameAs`
3. **Validierung:** strukturierte Hinweise bei fehlenden/ungültigen Feldern
4. **Rendering:** UI rendert ausschließlich das normalisierte Datenmodell

Bei Parsing-Problemen zeigt die Stundenplan-Ansicht eine sichtbare Hinweiskarte mit konkreten Ursachen.

🚀 Features (Beta)
	•	📅 Dynamischer Stundenplan (JSON-basiert)
	•	🔄 Offline-Fallback mit last-known-good-Speicherung
	•	📱 Installierbar als Progressive Web App
	•	🧰 PDF-Parser-Scaffold zur automatischen Generierung der Stundenplan-Daten
	•	🧪 Linting für sauberen Code (htmlhint + jshint)


⸻

💬 Fun-Messages anpassen (einfach erweiterbar)

Die dynamischen Meldungen liegen in `data/fun-messages.json` unter `default`.

- Pro Phase einfach einen neuen String in das passende Array einfügen (`beforeSchool`, `duringLesson`, `afterSchool`, `weekend`, `holiday`, …).
- Optional kannst du unter `default.all` Nachrichten eintragen, die **automatisch zu allen Phasen** hinzugefügt werden.
- Du kannst statt Array auch einen einzelnen String pro Phase nutzen (wird automatisch als Liste behandelt).

Verfügbare Platzhalter in Nachrichten:
- `{classId}` – aktuell gewählte Klasse
- `{subject}` – aktuelles Fach (oder nächstes)
- `{nextSubject}` – nächstes Fach
- `{slotLabel}` – z. B. `Std. 3`
- `{weekdayLabel}` – Wochentag (Montag, Dienstag, …)
- `{holidayName}` – Feiertagsname (falls zutreffend)

⸻

🛠️ Problembehebung: falsche Einträge im Google Jahreskalender

Wenn im Google Kalender in der Jahresansicht „falsche“ Termine erscheinen, liegt die Ursache meist nicht an einem einzelnen Termin, sondern an Kalender- oder Sync-Einstellungen:

1. **Sichtbare Kalender prüfen**
   - In der linken Leiste unter **„Meine Kalender“** und **„Weitere Kalender“** nacheinander Kalender ausblenden.
   - Häufig stammen „falsche“ Einträge aus Feiertags-, Aufgaben- oder geteilten Kalendern.

2. **Serientermine kontrollieren**
   - Einen betroffenen Termin öffnen und die Wiederholungsregel prüfen.
   - Änderungen bei Bedarf auf **„Alle Termine“** oder **„Diese und folgende“** anwenden.

3. **Zeitzone abgleichen**
   - Einstellungen → **Allgemein** → **Zeitzone**.
   - Eine falsche Zeitzone verschiebt Termine auf den Vortag/Folgetag.

4. **Importe (ICS) als Fehlerquelle prüfen**
   - Nach einem Import können Serienregeln oder Datumsformate fehlerhaft sein.
   - Den importierten Kalender testweise ausblenden oder neu importieren.

5. **Sync-Konflikte eingrenzen**
   - Immer zuerst in der Web-Version prüfen (`calendar.google.com`).
   - Wenn nur Mobilgeräte betroffen sind: App-Cache leeren oder Konto neu synchronisieren.

Kurzdiagnose:
- **Falsche Uhrzeit?** → Zeitzone prüfen.
- **Doppelte Termine?** → doppelten Kalender/Sync prüfen.
- **Falsche Tage über Monate?** → Serientermin oder fehlerhafter Import.
