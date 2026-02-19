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

	4.	`data/timetable.json` wird atomar geschrieben (kein halbgeschriebener Zustand bei Fehlern).

	5.	Alte Stundenplan-PDFs werden dabei automatisch entfernt (standardmäßig bleibt nur die aktuelle Datei erhalten).

	6.	App neu laden – der aktualisierte Stundenplan wird angezeigt.

Optional: Mit `npm run timetable:ingest:dry` kann der Ablauf ohne Schreiben/Löschen geprüft werden.

⸻

🚀 Features (Beta)
	•	📅 Dynamischer Stundenplan (JSON-basiert)
	•	🔄 Offline-Fallback mit last-known-good-Speicherung
	•	📱 Installierbar als Progressive Web App
	•	🧰 PDF-Parser-Scaffold zur automatischen Generierung der Stundenplan-Daten
	•	🧪 Linting für sauberen Code (htmlhint + jshint)
