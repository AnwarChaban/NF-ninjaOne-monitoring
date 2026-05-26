"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const config_1 = require("../config");
const runtime_settings_1 = require("../services/runtime-settings");
const auth_1 = require("../middleware/auth");
const secret_expiry_1 = require("../services/secret-expiry");
const audit_1 = require("../services/audit");
const cron_parser_1 = require("cron-parser");
const index_1 = require("../index");
const router = (0, express_1.Router)();
const ALLOWED_SETTINGS_KEYS = new Set([
    'ninjaoneApiKey',
    'ninjaoneClientId',
    'ninjaoneClientSecret',
    'unifiApiKey',
    'unifiClientId',
    'unifiClientSecret',
    'sophosTokenUrl',
    'sophosClientId',
    'sophosClientSecret',
    'sophosPartnerId',
    'sophosScope',
    'graphTenantId',
    'graphClientId',
    'graphClientSecret',
    'backupMailbox',
    'showUpToDateDevices',
]);
router.get('/settings', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (_req, res) => {
    const db = (0, db_1.getDb)();
    const settings = {
        ninjaoneApiKey: config_1.config.ninjaone.apiKey || '',
        ninjaoneClientId: config_1.config.ninjaone.clientId || '',
        ninjaoneClientSecret: config_1.config.ninjaone.clientSecret || '',
        unifiApiKey: '',
        unifiClientId: '',
        unifiClientSecret: '',
        sophosTokenUrl: config_1.config.sophos.tokenUrl || '',
        sophosClientId: config_1.config.sophos.clientId || '',
        sophosClientSecret: config_1.config.sophos.clientSecret || '',
        sophosPartnerId: config_1.config.sophos.partnerId || '',
        sophosScope: config_1.config.sophos.scope || 'token',
        graphTenantId: config_1.config.graph.tenantId || '',
        graphClientId: config_1.config.graph.clientId || '',
        graphClientSecret: config_1.config.graph.clientSecret || '',
        backupMailbox: config_1.config.backupMailbox || '',
        showUpToDateDevices: 'false',
    };
    const rows = db.prepare('SELECT key, value FROM settings').all();
    for (const row of rows) {
        if (ALLOWED_SETTINGS_KEYS.has(row.key)) {
            settings[row.key] = row.value;
        }
    }
    settings.sophosConfigured = (0, runtime_settings_1.isSophosConfigured)() ? 'true' : 'false';
    res.json(settings);
});
router.put('/settings', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (req, res) => {
    const db = (0, db_1.getDb)();
    const updates = req.body;
    const changed = [];
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const transaction = db.transaction(() => {
        for (const [key, value] of Object.entries(updates)) {
            if (!ALLOWED_SETTINGS_KEYS.has(key))
                continue;
            stmt.run(key, value);
            changed.push(key);
        }
    });
    transaction();
    if (changed.length > 0) {
        (0, audit_1.logAction)(req.user, 'settings.update', 'settings', null, null, { changed }, req);
    }
    res.json({ ok: true });
});
// PATCH /api/settings/:key — update value + optional expires_at
router.patch('/settings/:key', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (req, res) => {
    const key = req.params['key'];
    if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        res.status(400).json({ error: 'Unknown settings key' });
        return;
    }
    const { value, expires_at } = req.body;
    const db = (0, db_1.getDb)();
    if (value !== undefined) {
        db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
    if (expires_at !== undefined) {
        db.prepare('UPDATE settings SET expires_at = ?, expiry_warning_sent = 0 WHERE key = ?').run(expires_at ?? null, key);
    }
    (0, audit_1.logAction)(req.user, 'settings.update', 'settings', key, key, { expires_at }, req);
    res.json({ ok: true });
});
// GET /api/settings/expiry — secret expiry status (admin only)
router.get('/settings/expiry', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (_req, res) => {
    res.json((0, secret_expiry_1.getExpiryStatus)());
});
// GET /api/settings/cron — all per-task cron schedules
router.get('/settings/cron', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (_req, res) => {
    const tasks = ['ninjaone_customers', 'ninjaone_devices', 'unifi_customers', 'unifi_devices', 'sophos_customers', 'sophos_devices', 'sophos_alerts', 'backup_emails'];
    res.json(Object.fromEntries(tasks.map(t => [t, (0, runtime_settings_1.getCronSchedule)(t)])));
});
// PATCH /api/settings/cron/:taskType — update per-task cron schedule
router.patch('/settings/cron/:taskType', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (req, res) => {
    const integration = req.params['taskType'];
    const valid = ['ninjaone_customers', 'ninjaone_devices', 'unifi_customers', 'unifi_devices', 'sophos_customers', 'sophos_devices', 'sophos_alerts', 'backup_emails'];
    if (!valid.includes(integration)) {
        res.status(400).json({ error: 'Ungültiger Task-Typ' });
        return;
    }
    const { cronExpression } = req.body;
    if (!cronExpression?.trim()) {
        res.status(400).json({ error: 'cronExpression ist erforderlich' });
        return;
    }
    try {
        cron_parser_1.CronExpressionParser.parse(cronExpression.trim());
    }
    catch {
        res.status(400).json({ error: 'Ungültiger Cron-Ausdruck' });
        return;
    }
    (0, runtime_settings_1.updateCronSchedule)(integration, cronExpression.trim());
    (0, index_1.reloadCronJobs)();
    (0, audit_1.logAction)(req.user, 'sync_cron_updated', 'cron', integration, integration, { cronExpression: cronExpression.trim() }, req);
    res.json({ ok: true });
});
exports.default = router;
