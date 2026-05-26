"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const sync_history_1 = require("../services/sync-history");
const ninjaone_1 = require("../services/ninjaone");
const unifi_1 = require("../services/unifi");
const sophos_1 = require("../services/sophos");
const backup_checker_1 = require("../services/backup-checker");
const audit_1 = require("../services/audit");
const runtime_settings_1 = require("../services/runtime-settings");
const router = (0, express_1.Router)();
// Maps task_type → sub-label for display
const TASK_LABELS = {
    ninjaone_customers: 'Kunden',
    ninjaone_devices: 'Geräte',
    unifi_customers: 'Kunden',
    unifi_devices: 'Geräte',
    sophos_customers: 'Kunden',
    sophos_devices: 'Geräte',
    sophos_alerts: 'Alerts',
    backup_emails: 'E-Mail',
};
function taskStatus(record, taskType) {
    const base = {
        cronSchedule: (0, runtime_settings_1.getCronSchedule)(taskType),
        lastRun: null,
        completedAt: null,
        status: 'never',
        devicesSynced: 0,
        customersSynced: 0,
        error: null,
    };
    if (!record)
        return base;
    return {
        ...base,
        lastRun: record.startedAt,
        completedAt: record.completedAt,
        status: record.status,
        devicesSynced: record.devicesSynced,
        customersSynced: record.customersSynced,
        error: record.errorMessage,
    };
}
// GET /api/sync/status — per-task cron schedules
router.get('/sync/status', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (_req, res) => {
    const latest = (0, sync_history_1.getAllLatestByTaskType)();
    res.json({
        ninjaone: {
            customers: taskStatus(latest['ninjaone_customers'], 'ninjaone_customers'),
            devices: taskStatus(latest['ninjaone_devices'], 'ninjaone_devices'),
        },
        unifi: {
            customers: taskStatus(latest['unifi_customers'], 'unifi_customers'),
            devices: taskStatus(latest['unifi_devices'], 'unifi_devices'),
        },
        sophos: {
            customers: taskStatus(latest['sophos_customers'], 'sophos_customers'),
            devices: taskStatus(latest['sophos_devices'], 'sophos_devices'),
            alerts: taskStatus(latest['sophos_alerts'], 'sophos_alerts'),
        },
        backup: {
            emails: taskStatus(latest['backup_emails'], 'backup_emails'),
        },
    });
});
// GET /api/sync/history/:integration/:taskType
router.get('/sync/history/:integration/:taskType', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (req, res) => {
    const taskType = `${req.params['integration']}_${req.params['taskType']}`;
    const valid = Object.keys(TASK_LABELS);
    if (!valid.includes(taskType)) {
        res.status(400).json({ error: 'Invalid task type' });
        return;
    }
    res.json((0, sync_history_1.getSyncHistoryByTask)(taskType, 20));
});
// POST /api/sync/:integration/:taskType — manual trigger (admin only)
router.post('/sync/:integration/:taskType', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), async (req, res) => {
    const { integration, taskType } = req.params;
    const user = req.user;
    const triggeredBy = `manual:${user.username}`;
    const fullTaskType = `${integration}_${taskType}`;
    try {
        let result;
        switch (fullTaskType) {
            case 'ninjaone_customers': {
                const r = await (0, ninjaone_1.syncNinjaOneCustomers)(triggeredBy);
                result = r;
                break;
            }
            case 'ninjaone_devices': {
                const r = await (0, ninjaone_1.syncNinjaOneDevices)(triggeredBy);
                result = r;
                break;
            }
            case 'ninjaone_users': {
                const r = await (0, ninjaone_1.syncNinjaOneUsers)(triggeredBy);
                result = { synced: r.synced, created: r.created, updated: r.updated };
                break;
            }
            case 'unifi_customers':
            case 'unifi_devices': {
                const r = await (0, unifi_1.syncUnifiData)(triggeredBy);
                result = { customers: r.customers, devices: r.devices };
                break;
            }
            case 'sophos_customers':
            case 'sophos_devices': {
                const r = await (0, sophos_1.syncSophosData)(triggeredBy);
                result = { tenants: r.tenants, devices: r.devices };
                break;
            }
            case 'sophos_alerts': {
                const r = await (0, sophos_1.syncSophosAlerts)(triggeredBy);
                result = { alerts: r.total };
                break;
            }
            case 'backup_emails': {
                const r = await (0, backup_checker_1.syncBackupEmails)(triggeredBy);
                result = { checked: r.checked, newResults: r.newResults };
                break;
            }
            default:
                res.status(400).json({ error: 'Invalid task type' });
                return;
        }
        (0, audit_1.logAction)(user, 'sync_task_triggered_manual', 'integration', fullTaskType, fullTaskType, result, req);
        res.json({ ok: true, ...result });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// POST /api/sync/:integration — full integration sync (backward compat)
router.post('/sync/:integration', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), async (req, res) => {
    const integration = req.params['integration'];
    const user = req.user;
    const triggeredBy = `manual:${user.username}`;
    try {
        let result;
        switch (integration) {
            case 'ninjaone': {
                const r = await (0, ninjaone_1.syncNinjaOneData)(triggeredBy);
                result = r;
                break;
            }
            case 'unifi': {
                const r = await (0, unifi_1.syncUnifiData)(triggeredBy);
                result = { customers: r.customers, devices: r.devices };
                break;
            }
            case 'sophos': {
                const [r1, r2] = await Promise.all([(0, sophos_1.syncSophosData)(triggeredBy), (0, sophos_1.syncSophosAlerts)(triggeredBy)]);
                result = { tenants: r1.tenants, devices: r1.devices, alerts: r2.total };
                break;
            }
            case 'backup': {
                const r = await (0, backup_checker_1.syncBackupEmails)(triggeredBy);
                result = { checked: r.checked, newResults: r.newResults };
                break;
            }
            default:
                res.status(400).json({ error: 'Invalid integration' });
                return;
        }
        (0, audit_1.logAction)(user, 'sync.manual', 'integration', integration, integration, result, req);
        res.json({ ok: true, ...result });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
