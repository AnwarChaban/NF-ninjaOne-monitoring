# Version Checker – Technische Informationen für die Präsentation

## 1) Zielbild (1 Slide)

- **Problem:** Kundenumgebungen enthalten viele Produkte mit unterschiedlichen Release-Zyklen.
- **Lösung:** Zentrale Plattform, die Hersteller-Versionen automatisch ermittelt, mit installierten Versionen vergleicht und Update-Bedarf sichtbar macht.
- **Nutzen:** Weniger manueller Rechercheaufwand, schnellere Reaktionszeit bei Updates, bessere Transparenz über Kundenlandschaften.

---

## 2) Systemarchitektur (1 Slide)

- **Stack:** Full-Stack TypeScript Monorepo
  - Backend: Express + node-cron + better-sqlite3
  - Frontend: React 18 + Vite
- **Laufzeitmodell:**
  - Entwicklung: `npm run dev` (Backend `:3001`, Frontend `:5173` mit Proxy auf `/api`)
  - Produktion: Express liefert API und statische Frontend-Build-Dateien aus
- **Datenpersistenz:** SQLite (`data/versions.db`), WAL-Modus aktiv

---

## 3) Datenfluss End-to-End (1 Slide)

1. Scraper holen aktuelle Hersteller-Versionen (z. B. Synology, Sophos, Proxmox, TeamViewer).
2. Ergebnisse werden in `version_cache` und `check_history` gespeichert.
3. Gerätebestände kommen aus NinjaOne-Sync **oder** Mock-Daten (Fallback).
4. Vergleichslogik bewertet pro Gerät den Status:
   - `up-to-date`
   - `update-available`
   - `major-update`
   - `unknown`
5. Dashboard zeigt priorisierte Produkte mit verfügbarem Updatebedarf.
6. Optional: Benachrichtigung via Webhook / Slack.

---

## 4) Backend-Bausteine (1–2 Slides)

### API-Routen

- `GET /api/products` → aggregierte Produkt-/Kunden-/Gerätesicht für das Dashboard
- `POST /api/check` → manueller Check (ein Produkt oder alle)
- `GET /api/settings`, `PUT /api/settings` → Runtime-Einstellungen
- `GET/PUT/POST/DELETE /api/admin/*` → Administration (Produkte, Kunden, Geräte, Syncs)

### Scheduler (node-cron)

- Regelmäßiger Versionscheck: `CHECK_CRON` (Default: alle 4 Stunden)
- NinjaOne-Sync: `NINJA_SYNC_CRON` (Default: täglich 02:00)
- Beim Serverstart:
  - initialer Versionscheck
  - optional initialer NinjaOne-Sync (wenn konfiguriert)

### Vergleichslogik

- Semver-basierter Vergleich mit produktspezifischer Normalisierung (z. B. herstellerspezifische Versionsformate)
- Ergebnis wird für Dashboard und Benachrichtigungspipeline genutzt

---

## 5) Datenmodell (1 Slide)

### Kern-Tabellen

- `version_cache` – letzter bekannter Stand pro Produkt
- `check_history` – historisierte Check-Ergebnisse
- `settings` – Laufzeitkonfiguration
- `scraper_products` – aktiv/inaktiv je Scraper-Produkt
- `custom_products` – manuell gepflegte Produkte
- `mock_customers`, `mock_devices` – Kunden-/Gerätebasis für Mock- bzw. Verwaltungsmodus
- `unifi_customer_mappings`, `unifi_unmatched_hosts` – UniFi-Zuordnung und nicht gematchte Hosts

### Technische Merkmale

- SQLite mit `journal_mode=WAL` und aktivierten Foreign Keys
- DB-Migrationen pragmatisch im Startprozess (z. B. Spalten-Erweiterungen)

---

## 6) Frontend & UX (1 Slide)

- React SPA mit Dashboard + Admin-Bereich (`#/admin`)
- Auto-Refresh alle 60 Sekunden
- Sortierung nach Relevanz:
  1. Anzahl veralteter Geräte
  2. Gesamtgerätezahl
  3. Produktname
- Fokus auf operative Sicht:
  - Update-indizierte Statusanzeige
  - Zuletzt-aktualisiert-Zeit
  - ein-/ausblendbare up-to-date Geräte (Setting)

---

## 7) Integrationen & Konfiguration (1 Slide)

### Externe Quellen

- Herstellerseiten via Scraper
- NinjaOne API (API Key oder OAuth Client Credentials)
- UniFi API (optional, API Key)

### Relevante Umgebungsvariablen

- `PORT`, `CHECK_CRON`, `NINJA_SYNC_CRON`
- `NINJAONE_API_URL`, `NINJAONE_API_KEY`, `NINJAONE_CLIENT_ID`, `NINJAONE_CLIENT_SECRET`
- `UNIFI_API_KEY`, `UNIFI_CLIENT_ID`, `UNIFI_CLIENT_SECRET`
- `WEBHOOK_URL`, `SLACK_WEBHOOK_URL`

---

## 8) Betrieb, Qualität, Risiken (1 Slide)

### Betriebsaspekte

- Einfache Bereitstellung lokal oder via Docker Compose
- Single-Binary-ähnlicher Betrieb in Produktion (ein Node-Prozess bedient API + Frontend)

### Qualität

- TypeScript-basierter Build (`npm run build`)
- Typprüfung möglich über `npx tsc --noEmit`
- Aktuell kein dediziertes Test-Framework konfiguriert

### Technische Risiken / Grenzen

- Scraper-Abhängigkeit von Herstellerseiten (HTML-Änderungen können Parsing brechen)
- SQLite für kleine bis mittlere Last geeignet; horizontale Skalierung begrenzt
- Secrets-Handling aktuell über Env + Settings-Store (für Enterprise ggf. Secret-Manager sinnvoll)

---

## 9) Empfohlener Demo-Ablauf (für die Präsentation)

1. Dashboard öffnen, Gesamtzahl Geräte + Updatebedarf zeigen.
2. Produktkarte aufklappen, konkrete Geräte mit Status demonstrieren.
3. Manuellen Check via API/Admin auslösen (`POST /api/check`).
4. Optional: Admin-Bereich zeigen (Produkt aktiv/inaktiv, Custom Product anlegen).
5. Optional: NinjaOne-/UniFi-Sync anstoßen und aktualisierte Datenlage zeigen.

---

## 10) Nächste technische Ausbaustufen (Roadmap-Slide)

- Automatisierte Tests (Unit + Integrationspfad für API und Comparator)
- Robusteres Scraping (Retry/Backoff/Monitoring pro Quelle)
- Rollen-/Rechtemodell für Admin-Funktionen
- Auditierbare Change-Events und erweitertes Reporting (Trend über Zeit)
- Optionaler Wechsel auf relationale Server-DB bei steigender Last
