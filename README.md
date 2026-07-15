# Kanada-Packliste Familie 2026

Gemeinsame, mobile Packliste für Allgemein, Marc, Nici, Nils, Lou und Laila.

## Funktionen

- Live-Synchronisierung auf mehreren Geräten
- dauerhaftes Tracking: wer wann eingepackt, wieder geöffnet, ergänzt oder gelöscht hat
- mehrere Reisen; neue Listen können leer oder aus einer bestehenden Vorlage erstellt werden
- mobiler JSON-Import und -Export, auf unterstützten Smartphones direkt über das Teilen-Menü
- anonyme Geräte-Anmeldung mit gemeinsamem Familiencode
- Row-Level Security: Datenzugriff nur für beigetretene Familiengeräte
- Offline-Anzeige und lokale Warteschlange für Änderungen
- eigene Einträge, Löschen, Suche, Filter und Fortschritt
- installierbar auf dem Smartphone (PWA)

## Einrichtung

1. Neues Supabase-Projekt erstellen.
2. `supabase/schema.sql` im SQL Editor ausführen.
3. In Supabase unter Authentication → Providers die anonyme Anmeldung aktivieren.
4. Einen Familiencode wählen, dessen SHA-256-Hash erzeugen und mit `supabase/seed-family.sql` die Familie samt Startliste anlegen.
5. Projekt-URL und öffentlichen `anon`/`publishable` Key in `config.js` eintragen.
6. Repository über GitHub Pages veröffentlichen.

Der Familiencode selbst gehört weder in GitHub noch in `config.js`.
