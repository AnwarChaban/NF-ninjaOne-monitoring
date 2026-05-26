"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const runtime_settings_1 = require("../services/runtime-settings");
const backup_checker_1 = require("../services/backup-checker");
const graph_mail_1 = require("../services/graph-mail");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../services/audit");
const router = (0, express_1.Router)();
// --- Debug / Test ---
router.get('/admin/backup/test', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), async (_req, res) => {
    const { getGraphRuntimeConfig, getBackupMailbox, isGraphConfigured } = await Promise.resolve().then(() => __importStar(require('../services/runtime-settings')));
    const cfg = getGraphRuntimeConfig();
    const mailbox = getBackupMailbox();
    const info = {
        configured: isGraphConfigured(),
        tenantId: cfg.tenantId || '(nicht gesetzt)',
        clientId: cfg.clientId || '(nicht gesetzt)',
        clientSecret: cfg.clientSecret ? `***${cfg.clientSecret.slice(-4)}` : '(nicht gesetzt)',
        backupMailbox: mailbox || '(nicht gesetzt)',
    };
    if (!isGraphConfigured()) {
        res.json({ ok: false, info, error: 'Graph API nicht konfiguriert' });
        return;
    }
    // Token-Test
    try {
        const tokenUrl = `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: cfg.clientId,
                client_secret: cfg.clientSecret,
                scope: 'https://graph.microsoft.com/.default',
            }),
        });
        const tokenBody = await tokenRes.json();
        if (!tokenRes.ok) {
            res.json({ ok: false, info, step: 'token', error: tokenBody });
            return;
        }
        info.tokenOk = true;
        const token = tokenBody.access_token;
        // Mailbox-Test
        if (mailbox) {
            const mailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
            const mailboxRes = await fetch(mailboxUrl, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            const mailboxBody = await mailboxRes.json();
            if (!mailboxRes.ok) {
                res.json({ ok: false, info, step: 'mailbox', error: mailboxBody });
                return;
            }
            info.mailboxDisplayName = mailboxBody.displayName;
            info.mailboxUserPrincipalName = mailboxBody.userPrincipalName;
            // Nachrichten-Test (max 1)
            const msgUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages?$top=1&$select=subject,receivedDateTime,from`;
            const msgRes = await fetch(msgUrl, {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            });
            const msgBody = await msgRes.json();
            if (!msgRes.ok) {
                res.json({ ok: false, info, step: 'messages', error: msgBody });
                return;
            }
            info.firstMessage = msgBody.value?.[0]
                ? {
                    subject: msgBody.value[0].subject,
                    from: msgBody.value[0].from?.emailAddress?.address,
                    received: msgBody.value[0].receivedDateTime,
                }
                : 'Postfach leer';
        }
        res.json({ ok: true, info });
    }
    catch (err) {
        res.json({ ok: false, info, step: 'network', error: err.message });
    }
});
// --- Dashboard ---
router.get('/backup/status', (_req, res) => {
    try {
        const groups = (0, backup_checker_1.getBackupDashboardData)();
        res.json({ configured: (0, runtime_settings_1.isGraphConfigured)(), groups });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
router.post('/backup/sync', auth_1.requireAuth, async (_req, res) => {
    if (!(0, runtime_settings_1.isGraphConfigured)()) {
        res.status(400).json({ error: 'Microsoft Graph API ist nicht konfiguriert' });
        return;
    }
    try {
        const result = await (0, backup_checker_1.syncBackupEmails)();
        res.json({ ok: true, ...result });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// --- Admin: Backup Accounts ---
router.get('/admin/backup-accounts', auth_1.requireAuth, (_req, res) => {
    res.json((0, backup_checker_1.getAllBackupAccounts)());
});
// --- Admin: Backup Checks ---
router.get('/admin/backup-checks', auth_1.requireAuth, (_req, res) => {
    res.json((0, backup_checker_1.getAllBackupChecks)());
});
router.post('/admin/backup-checks', auth_1.requireAuth, (req, res) => {
    const db = (0, db_1.getDb)();
    const { backupAccountId, name, intervalHours, graceHours, subjectFilter, subjectMatchType, bodyFilter } = req.body;
    if (!backupAccountId || !name || !intervalHours) {
        res.status(400).json({ error: 'backupAccountId, name and intervalHours are required' });
        return;
    }
    const account = db.prepare('SELECT id FROM backup_accounts WHERE id = ?').get(backupAccountId);
    if (!account) {
        res.status(404).json({ error: 'Backup account not found' });
        return;
    }
    const now = new Date().toISOString();
    const result = db.prepare(`
    INSERT INTO backup_checks
      (backup_account_id, name, interval_hours, grace_hours, subject_filter, subject_match_type, body_filter, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(backupAccountId, name, intervalHours, graceHours ?? 1, subjectFilter ?? null, subjectMatchType ?? 'contains', bodyFilter ?? null, now, now);
    (0, audit_1.logAction)(req.user, 'backup_check.create', 'backup_check', Number(result.lastInsertRowid), name, { backupAccountId, intervalHours }, req);
    res.json({ ok: true, id: result.lastInsertRowid });
});
// Note: backup-check write routes intentionally require only requireAuth (not a specific role).
// Both administrators and techniker have full backup-check CRUD access per role design.
router.put('/admin/backup-checks/:id', auth_1.requireAuth, (req, res) => {
    const db = (0, db_1.getDb)();
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const { name, backupAccountId, intervalHours, graceHours, subjectFilter, subjectMatchType, bodyFilter, active } = req.body;
    if (!db.prepare('SELECT id FROM backup_checks WHERE id = ?').get(id)) {
        res.status(404).json({ error: 'Backup check not found' });
        return;
    }
    const now = new Date().toISOString();
    const updates = ['updated_at = ?'];
    const values = [now];
    if (name !== undefined) {
        updates.push('name = ?');
        values.push(name);
    }
    if (backupAccountId !== undefined) {
        updates.push('backup_account_id = ?');
        values.push(backupAccountId);
    }
    if (intervalHours !== undefined) {
        updates.push('interval_hours = ?');
        values.push(intervalHours);
    }
    if (graceHours !== undefined) {
        updates.push('grace_hours = ?');
        values.push(graceHours);
    }
    if (subjectFilter !== undefined) {
        updates.push('subject_filter = ?');
        values.push(subjectFilter ?? null);
    }
    if (subjectMatchType !== undefined) {
        updates.push('subject_match_type = ?');
        values.push(subjectMatchType);
    }
    if (bodyFilter !== undefined) {
        updates.push('body_filter = ?');
        values.push(bodyFilter ?? null);
    }
    if (active !== undefined) {
        updates.push('active = ?');
        values.push(active ? 1 : 0);
    }
    values.push(id);
    db.prepare(`UPDATE backup_checks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    (0, audit_1.logAction)(req.user, 'backup_check.update', 'backup_check', id, name ?? String(id), null, req);
    res.json({ ok: true });
});
router.post('/admin/backup-checks/:id/manual-status', auth_1.requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const { status, comment } = req.body;
    try {
        (0, backup_checker_1.setManualStatus)(id, status ?? null, req.user, comment ?? null);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(404).json({ error: e.message });
    }
});
router.post('/admin/backup-checks/:id/pause', auth_1.requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const { reason, pausedUntil } = req.body;
    if (!reason) {
        res.status(400).json({ error: 'reason is required' });
        return;
    }
    try {
        (0, backup_checker_1.pauseCheck)(id, req.user, reason, pausedUntil ?? null);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(404).json({ error: e.message });
    }
});
router.post('/admin/backup-checks/:id/resume', auth_1.requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    try {
        (0, backup_checker_1.resumeCheck)(id, req.user);
        res.json({ ok: true });
    }
    catch (e) {
        res.status(404).json({ error: e.message });
    }
});
router.delete('/admin/backup-checks/:id', auth_1.requireAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid id' });
        return;
    }
    const row = (0, db_1.getDb)().prepare('SELECT name FROM backup_checks WHERE id = ?').get(id);
    (0, db_1.getDb)().prepare('DELETE FROM backup_checks WHERE id = ?').run(id);
    (0, audit_1.logAction)(req.user, 'backup_check.delete', 'backup_check', id, row?.name ?? String(id), null, req);
    res.json({ ok: true });
});
// Recent emails for a backup account — used to auto-fill new check form
router.get('/admin/backup-accounts/:id/recent-emails', auth_1.requireAuth, async (req, res) => {
    if (!(0, runtime_settings_1.isGraphConfigured)()) {
        res.status(503).json({ error: 'Graph API nicht konfiguriert' });
        return;
    }
    const account = (0, db_1.getDb)()
        .prepare('SELECT * FROM backup_accounts WHERE id = ?')
        .get(parseInt(req.params.id, 10));
    if (!account) {
        res.status(404).json({ error: 'Account nicht gefunden' });
        return;
    }
    const hours = Math.min(parseInt(String(req.query.hours ?? '720')) || 720, 720);
    const sinceDays = Math.ceil(hours / 24);
    try {
        const emails = await (0, graph_mail_1.fetchEmailsFromSender)(account.from_email, sinceDays);
        // Filter to requested time window
        const since = Date.now() - hours * 3_600_000;
        const filtered = emails.filter(e => new Date(e.receivedAt).getTime() >= since);
        // Group by subject → unique jobs
        const jobMap = new Map();
        for (const email of filtered) {
            const existing = jobMap.get(email.subject);
            if (!existing) {
                jobMap.set(email.subject, { subject: email.subject, count: 1, lastReceivedAt: email.receivedAt, bodyPreview: email.bodyPreview });
            }
            else {
                existing.count++;
                if (new Date(email.receivedAt) > new Date(existing.lastReceivedAt)) {
                    existing.lastReceivedAt = email.receivedAt;
                }
            }
        }
        const jobs = Array.from(jobMap.values()).sort((a, b) => b.count - a.count);
        // Auto-detect interval from ALL email timestamps per subject
        function detectInterval(subject) {
            const times = emails
                .filter(e => e.subject === subject)
                .map(e => new Date(e.receivedAt).getTime())
                .sort((a, b) => b - a);
            if (times.length < 2)
                return 24;
            const gaps = times.slice(0, -1).map((t, i) => (t - times[i + 1]) / 3_600_000).filter(g => g > 0);
            if (gaps.length === 0)
                return 24;
            const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
            const nice = [1, 2, 4, 6, 8, 12, 24, 48, 72, 168];
            return nice.reduce((prev, curr) => Math.abs(curr - median) < Math.abs(prev - median) ? curr : prev);
        }
        const jobsWithInterval = jobs.map(j => ({ ...j, suggestedInterval: detectInterval(j.subject) }));
        // Overall suggested interval (for single-form use)
        const globalInterval = jobsWithInterval.length > 0
            ? jobsWithInterval[0].suggestedInterval
            : 24;
        res.json({
            emails: emails.slice(0, 5),
            jobs: jobsWithInterval,
            suggestedInterval: globalInterval,
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
