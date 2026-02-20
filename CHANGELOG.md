# Changelog

## Unreleased

### Refactor (behavior-preserving)
- Zentrale Pfad-Konfiguration eingeführt (`js/config/paths.js`), um Asset-/Data-Pfade nicht mehr zu hardcoden.
- JavaScript-Entry in `js/app.js` verschoben (vorher `app.js`) und Parser nach `js/modules/`.
- Runtime-JSON-Dateien nach `assets/data/runtime/` verschoben (vorher `data/`), damit Daten/Assets konsistenter liegen.
- Kleine Helper-Module für DOM/Storage/Text extrahiert (`js/utils/*`).

### Notes
- Ziel: bessere Wartbarkeit und einfachere Änderungen, ohne Features/UI zu verändern.
