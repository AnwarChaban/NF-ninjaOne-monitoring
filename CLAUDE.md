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

- `index.ts` — Express setup, route mounting, five cron jobs (version check, NinjaOne sync, Sophos sync, backup email sync, daily audit cleanup + secret expiry). **Route mounting order matters** — `backupRouter` must be mounted before `adminRouter` (see Auth below).
- `config.ts` — All env vars loaded here
- `db.ts` — SQLite via `better-sqlite3` with WAL mode and `foreign_keys = ON`. All schema migrations run on startup (ALTER TABLE for new columns on existing DBs).
- `services/runtime-settings.ts` — Settings read from DB `settings` table first, falling back to env vars. Use this for credentials at runtime.
- `services/auth.ts` — Session token creation/validation, password hashing via `crypto.scryptSync`
- `services/audit.ts` — `logAction()` for all write operations, `getLogs()` with filters, `cleanupOldLogs()`
- `services/sync-history.ts` — `startSync()` / `completeSync()` / `failSync()` wrappers used by all four sync services
- `services/secret-expiry.ts` — Checks `settings.expires_at` for expiring API credentials (≤14 days → warning)
- `services/products.ts` — CRUD for products and version storage
- `services/customers.ts` — CRUD for customers and fetching devices across all integrations
- `services/version-fetcher.ts` — Orchestrates scrapers; UniFi versions come from sync (not a scraper)
- `services/ninjaone.ts` — NinjaOne API client; accepts `triggeredBy` param for sync history
- `services/unifi.ts` — UniFi API client; fuzzy host→customer matching + manual mappings
- `services/sophos.ts` — Sophos Central API client; syncs tenants/devices/alerts
- `services/backup-checker.ts` — Backup monitoring via email matching; accepts `triggeredBy` param
- `services/graph-mail.ts` — Microsoft Graph API client; reads emails from shared mailbox
- `services/comparator.ts` — Semver comparison with vendor-specific normalization
- `services/notifier.ts` — Console, webhook, and Slack notifications
- `middleware/auth.ts` — `requireAuth` (validates Bearer token, attaches `req.user`) and `requireRole('administrator'|'techniker')`
- `scrapers/` — One file per product: `proxmox-ve`, `proxmox-backup`, `sophos`, `synology`, `teamviewer`. **UniFi has no scraper** — its version comes from the API sync.
- `mocks/ninjaone-data.ts` — Mock NinjaOne API response data used during development.
- `routes/users.ts` — Public: `POST /api/auth/setup` (first-run only), `GET /api/auth/users`, `POST /api/auth/login`, `POST /api/auth/logout`. Admin-only: `/api/users` CRUD
- `routes/logs.ts` — `GET /api/logs` + `GET /api/logs/meta` (admin only)
- `routes/sync.ts` — `GET /api/sync/status`, `GET /api/sync/history/:integration`, `POST /api/sync/:integration` (admin only)
- `routes/products.ts` — Dashboard API: `GET /api/products/status`
- `routes/customers.ts` — Customer detail + `GET /api/sophos/overview`
- `routes/checks.ts` — `POST /api/check` manual version check
- `routes/settings.ts` — `GET/PUT /api/settings` (admin), `PATCH /api/settings/:key` (set `expires_at`), `GET /api/settings/expiry`
- `routes/admin.ts` — All `/api/admin/*` routes. Uses `router.use('/admin', requireAuth, requireRole('administrator'))` — this path-scoped middleware **only** protects `/admin/*` paths.
- `routes/backup.ts` — `GET /api/backup/status` (public), backup sync + admin CRUD. **Must be mounted before `adminRouter`** because `/api/admin/backup-*` routes are here (techniker-accessible) and would otherwise be blocked by adminRouter's middleware.

### Auth System

**Roles:** `administrator` (full access) and `techniker` (dashboard + backup checks only)

**Login flow:** `POST /api/auth/login` with `{ username, password? }` → returns `{ token, user }`. Token stored in `localStorage` as `auth_token`. Frontend sends `Authorization: Bearer <token>` on every request via `apiFetch()` in `api.ts`.

**First user:** Call `POST /api/auth/setup` (works only when `users` table is empty) with `{ username, display_name, password }`.

**Password:** Only administrators can have passwords (optional). Techniker log in with username only. Password stored as `scrypt` hash in `users.password_hash`.

**Techniker access:** Dashboard, Backup status, Backup Checks CRUD (`/api/admin/backup-*`). No access to: Settings, Products admin, Customers admin, UniFi admin, Sophos admin, User Management, Audit Logs, Sync Overview.

### DB Schema (SQLite at `data/versions.db`)

Core tables:
- `customers` — top-level customer records
- `products` — product registry (id, name, type: `scraped`|`custom`, active)
- `product_versions` — version history per product and source
- `settings` — key/value store with optional `expires_at` and `expiry_warning_sent` columns
- `users` — login accounts with role and optional `password_hash`
- `user_sessions` — session tokens (expire after 30 days)
- `audit_logs` — all write operations with user, action, entity, IP
- `sync_history` — per-integration sync runs with status, device counts, error messages

Per-integration account + device tables: `ninjaone_customers/devices`, `unifi_customers/devices`, `sophos_customers/devices`

UniFi-specific: `unifi_customer_mappings`, `unifi_unmatched_hosts`

Sophos-specific: `sophos_unmatched_tenants`, `sophos_alerts`

Backup monitoring: `backup_accounts`, `backup_checks`, `backup_check_results`

### Frontend (`client/src/`)

- React 18 SPA with inline styles (no CSS framework), German UI
- **Auth gate:** `App.tsx` checks `localStorage` for `auth_token`. No token → `<Login>` screen. Token → app. `ExpiryBanner` shown to admins when any secret expires within 14 days.
- Hash routing: `#/admin` → `AdminLayout`, else → main dashboard with `Sidebar`
- `App.tsx` — Dashboard with version updates, Sophos alerts, backup status. Merges `unifi-os` + `unifi-network` into one card. Auto-refreshes 60s.
- `components/Login.tsx` — Username text input. Password field appears automatically if the selected admin has a password set (detected via `hasPassword` flag from API).
- `components/AdminLayout.tsx` — Admin shell. Tabs filtered by role: Techniker never sees this panel (Admin link in Sidebar hidden for Techniker). Admin tabs: Kunden, Produkte, UniFi, Sophos, Sync-Übersicht, Einstellungen, Benutzer, Audit-Protokoll.
- `components/BackupPage.tsx` — Tabs: "Übersicht" (BackupDashboard) + "Checks verwalten" (BackupChecksPage). Accessible from main Sidebar, not admin panel.
- `components/SyncOverview.tsx` — 4 cards (NinjaOne/UniFi/Sophos/Backup) with status, last run, expandable history, manual sync button. Auto-refreshes 30s.
- `components/AuditLogs.tsx` — Paginated log table with filters (date, user, action, entity type) and CSV export.
- `components/UserManagement.tsx` — User CRUD. Password field shown only for administrator role.
- `components/admin/BackupChecksPage.tsx` — Backup check configuration CRUD (account + schedule management).
- `components/admin/CustomersPage.tsx` — Customer management.
- `components/admin/ProductsPage.tsx` — Product registry management (enable/disable, add custom products).
- `components/admin/SettingsPage.tsx` — Inline `ExpiryRow` component next to each Client Secret field for setting/displaying expiry dates.
- `components/admin/SophosPage.tsx` — Sophos tenant-to-customer matching and unmatched tenant management.
- `components/admin/UnifiPage.tsx` — UniFi host-to-customer matching and manual mapping management.
- `api.ts` — All API calls go through `apiFetch()` which auto-injects `Authorization: Bearer` header. `getStoredUser()` / `setAuthSession()` / `clearAuthSession()` manage localStorage.

### Browser Extension (`browser-extension/ninja-widget-injector/`)

Injects a sidebar button + slide-in panel into NinjaOne (`app.rmmservice.eu`) that shows the Version Checker dashboard in an iframe.

- **Manifest V3** — compatible with Edge, Chrome, and Firefox
- `content.js` — uses `typeof browser !== 'undefined' ? browser : chrome` to handle Firefox vs Chrome/Edge API
- **Load in Firefox:** `about:debugging` → Dieser Firefox → Temporäre Erweiterung laden → select `manifest.json`
- **Load in Chrome/Edge:** `chrome://extensions` → Developer mode → Load unpacked → select the folder

## Adding a New Product Scraper

1. Create `server/scrapers/<product>.ts` exporting `async function fetch<Name>Version(): Promise<{ version: string; url: string }>`
2. Register it in `server/services/version-fetcher.ts`: add to `scrapers` map and `productNames` map
3. The product will be auto-seeded into the `products` table on first version fetch

## Settings vs. Env Vars

Integration credentials can be set via `.env` (loaded at startup) **or** via Admin → Settings UI (stored in `settings` table). `runtime-settings.ts` always reads DB first, falling back to config. Credentials updated via UI take effect immediately without restart.

## Environment Variables

Configured in `.env` (see `.env.example`). All loaded via `server/config.ts`.

- `NINJAONE_API_URL` — NinjaOne API base URL (default: `https://eu.ninjarmm.com`)
- `NINJAONE_CLIENT_ID` / `NINJAONE_CLIENT_SECRET` — NinjaOne OAuth credentials
- `NINJA_SYNC_CRON` — Cron for NinjaOne sync (default: `0 2 * * *`)
- `UNIFI_API_KEY` — UniFi API key (endpoint hardcoded to `api.ui.com/v1`)
- `SOPHOS_CLIENT_ID` / `SOPHOS_CLIENT_SECRET` / `SOPHOS_PARTNER_ID` / `SOPHOS_TOKEN_URL` / `SOPHOS_SCOPE` — Sophos Central credentials
- `SOPHOS_SYNC_CRON` — Cron for Sophos sync (default: `0 3 * * *`)
- `GRAPH_TENANT_ID` / `GRAPH_CLIENT_ID` / `GRAPH_CLIENT_SECRET` — Microsoft Graph credentials for backup email monitoring
- `BACKUP_MAILBOX` — UPN/email of the shared mailbox to read backup emails from
- `BACKUP_SYNC_CRON` — Cron for backup email sync (default: `*/15 * * * *`)
- `PORT` — Server port (default: `3001`)
- `CHECK_CRON` — Cron for scraper version checks (default: `0 */4 * * *`)
- `WEBHOOK_URL` / `SLACK_WEBHOOK_URL` — Notification targets

## Key Types

- `UpdateStatus`: `'up-to-date' | 'update-available' | 'major-update' | 'unknown'`
- `AuthUser` (services/auth.ts): `{ id, username, displayName, role }` — attached to `req.user` by `requireAuth`
- `SyncIntegration`: `'ninjaone' | 'unifi' | 'sophos' | 'backup'`
- `BackupStatus`: `'success' | 'failed' | 'missed' | 'unknown'`
- `ProductStatus` (routes/products.ts): full product state with nested customers/devices
- `AuditLogEntry` (services/audit.ts): log record with user, action, entity, IP, timestamp
