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

📄 Stundenplan per PDF aktualisieren
	1.	Neue Stundenplan-PDF hochladen (bestehende Datei ersetzen).

	2.	Das Upload-Script verarbeitet die PDF automatisch.

	3.	Die Datei data/timetable.json wird dabei automatisch neu generiert.

	4.	App neu laden – der aktualisierte Stundenplan wird angezeigt.

Es ist kein manueller Befehl notwendig.
Die Umwandlung von PDF → JSON erfolgt automatisch nach dem Upload.

⸻

🚀 Features (Beta)
	•	📅 Dynamischer Stundenplan (JSON-basiert)
	•	🔄 Offline-Fallback mit last-known-good-Speicherung
	•	📱 Installierbar als Progressive Web App
	•	🧰 PDF-Parser-Scaffold zur automatischen Generierung der Stundenplan-Daten
	•	🧪 Linting für sauberen Code (htmlhint + jshint)
