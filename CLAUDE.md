# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Run backend (:3001) + frontend (:5173) concurrently with hot-reload
npm run dev:server   # Backend only (tsx watch)
npm run dev:client   # Frontend only (Vite)
npm run build        # Build client (Vite) then server (tsc)
npm start            # Run production build (node dist/server/index.js)
npx tsc --noEmit     # Type-check entire project
```

Docker: `docker-compose up --build`

No test framework is configured yet.

## Architecture

Full-stack TypeScript monorepo — Express backend + React/Vite frontend, single `package.json`.

**Data flow:** Scrapers fetch latest versions from vendor websites → stored in SQLite `product_versions` → compared (semver) against customer device versions from integration APIs (NinjaOne, UniFi, Sophos) → served via REST API → rendered in React dashboard. A cron scheduler (`node-cron`) runs checks periodically and sends webhook/Slack notifications.

**Two TypeScript configs:** `tsconfig.json` (client, ESNext/bundler) and `tsconfig.server.json` (server, CommonJS output to `dist/`).

**Dev proxy:** Vite proxies `/api/*` to `http://localhost:3001`. In production, Express serves the built React app as static files from `client/dist/`.

### Backend (`server/`)

- `index.ts` — Express setup, route mounting, two cron jobs (version check + NinjaOne sync), initial sync on startup
- `config.ts` — All env vars loaded here. `useNinjaOne` is derived from presence of API key or OAuth credentials
- `db.ts` — SQLite via `better-sqlite3` with WAL mode and `foreign_keys = ON`. Seeds mock data on first run
- `services/runtime-settings.ts` — Settings read from DB `settings` table first, falling back to env vars. Use this for NinjaOne/UniFi/webhook config at runtime (not just from `.env`)
- `services/products.ts` — CRUD for products and version storage (`product_versions` table)
- `services/customers.ts` — CRUD for customers and fetching devices across all integrations
- `services/version-fetcher.ts` — Orchestrates scrapers; UniFi versions come from sync (not a scraper), so it reads cached `product_versions` for `unifi-*` products
- `services/ninjaone.ts` — NinjaOne API client; syncs devices into `ninjaone_devices` table
- `services/unifi.ts` — UniFi API client; fetches hosts/devices with paginated requests, matches hosts to customers by name (fuzzy + manual mappings in `unifi_customer_mappings`), syncs into `unifi_devices`
- `services/comparator.ts` — Semver comparison with normalization for vendor-specific formats (Synology build numbers, Sophos MR suffixes)
- `services/notifier.ts` — Console, webhook, and Slack notifications
- `scrapers/` — One file per product (synology-dsm, sophos-firewall, proxmox-ve, proxmox-backup, teamviewer). Each exports `async function fetch<Name>Version(): Promise<{ version: string; url: string }>`. **UniFi has no scraper** — its version comes from the API sync.
- `routes/admin.ts` — CRUD for products, customers, and integration accounts (NinjaOne/UniFi/Sophos), plus manual sync endpoints

### DB Schema (SQLite at `data/versions.db`)

Core tables:
- `customers` — top-level customer records
- `products` — product registry (id, name, type: `scraped`|`custom`, active)
- `product_versions` — version history per product and source (`scraped`, `ninjaone`, `unifi`, `sophos`)
- `settings` — key/value store for runtime configuration (overrides env vars)

Per-integration account + device tables (each integration has its own pair):
- `ninjaone_customers` / `ninjaone_devices`
- `unifi_customers` / `unifi_devices`
- `sophos_customers` / `sophos_devices`

UniFi-specific:
- `unifi_customer_mappings` — manual host-name → customer mappings for UniFi sync
- `unifi_unmatched_hosts` — hosts that couldn't be matched during sync

### Frontend (`client/src/`)

- React 18 SPA with inline styles (no CSS framework), German UI
- Hash-based routing: `#/admin` → AdminLayout, else → Dashboard
- `App.tsx` — Dashboard: shows only products with pending updates, sorted by number of outdated devices. Merges `unifi-os` and `unifi-network` into a single "UniFi" card. Auto-refreshes every 60s.
- `components/AdminLayout.tsx` — Admin shell with sub-pages for Products, Customers, Settings
- `api.ts` — Typed fetch wrappers for all API endpoints

## Adding a New Product Scraper

1. Create `server/scrapers/<product>.ts` exporting `async function fetch<Name>Version(): Promise<{ version: string; url: string }>`
2. Register it in `server/services/version-fetcher.ts`: add to `scrapers` map and `productNames` map
3. The product will be auto-seeded into the `products` table on first version fetch; or add it to `seedMockData()` in `db.ts` for mock data

## Settings vs. Env Vars

Integration credentials can be set either via `.env` (loaded at startup) **or** via the Admin → Settings UI (stored in `settings` table). The `runtime-settings.ts` functions always read DB first, falling back to config. This means credentials updated via UI take effect immediately without restart.

## Environment Variables

Configured in `.env` (see `.env.example`). All loaded via `server/config.ts`.

- `NINJAONE_API_URL` — NinjaOne API base URL (default: `https://eu.ninjarmm.com`)
- `NINJAONE_CLIENT_ID` / `NINJAONE_CLIENT_SECRET` / `NINJAONE_API_KEY` — NinjaOne credentials
- `NINJA_SYNC_CRON` — Cron for NinjaOne sync (default: `0 2 * * *`)
- `UNIFI_API_KEY` / `UNIFI_CLIENT_ID` / `UNIFI_CLIENT_SECRET` — UniFi API credentials (endpoint is hardcoded to `api.ui.com/v1`)
- `PORT` — Server port (default: `3001`)
- `CHECK_CRON` — Cron for scraper version checks (default: `0 */4 * * *`)
- `WEBHOOK_URL` / `SLACK_WEBHOOK_URL` — Notification targets

## Key Types

- `UpdateStatus`: `'up-to-date' | 'update-available' | 'major-update' | 'unknown'`
- `ProductStatus` (routes/products.ts): full product state with nested customers/devices for the dashboard API
- `VersionInfo` (services/version-fetcher.ts): product + latestVersion + releaseUrl + checkedAt
- `UpdateNotification` (services/notifier.ts): used across comparator → notifier pipeline
