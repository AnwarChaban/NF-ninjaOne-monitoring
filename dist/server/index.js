"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.reloadCronJobs = reloadCronJobs;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const node_cron_1 = __importDefault(require("node-cron"));
const config_1 = require("./config");
const db_1 = require("./db");
const products_1 = __importDefault(require("./routes/products"));
const checks_1 = __importDefault(require("./routes/checks"));
const settings_1 = __importDefault(require("./routes/settings"));
const admin_1 = __importDefault(require("./routes/admin"));
const backup_1 = __importDefault(require("./routes/backup"));
const customers_1 = __importDefault(require("./routes/customers"));
const users_1 = __importDefault(require("./routes/users"));
const logs_1 = __importDefault(require("./routes/logs"));
const sync_1 = __importDefault(require("./routes/sync"));
const version_fetcher_1 = require("./services/version-fetcher");
const comparator_1 = require("./services/comparator");
const notifier_1 = require("./services/notifier");
const runtime_settings_1 = require("./services/runtime-settings");
const audit_1 = require("./services/audit");
const secret_expiry_1 = require("./services/secret-expiry");
const customers_2 = require("./services/customers");
const backup_checker_1 = require("./services/backup-checker");
const ninjaone_1 = require("./services/ninjaone");
const sophos_1 = require("./services/sophos");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// API routes
app.use('/api', users_1.default);
app.use('/api', logs_1.default);
app.use('/api', sync_1.default);
app.use('/api', products_1.default);
app.use('/api', checks_1.default);
app.use('/api', settings_1.default);
app.use('/api', backup_1.default);
app.use('/api', customers_1.default);
app.use('/api', admin_1.default);
// Serve React frontend in production
const clientDist = path_1.default.join(__dirname, '..', 'client', 'dist');
app.use(express_1.default.static(clientDist));
app.get('*', (_req, res) => {
    res.sendFile(path_1.default.join(clientDist, 'index.html'));
});
// Initialize DB + seed cron settings
(0, db_1.getDb)();
(0, runtime_settings_1.seedCronSettings)();
// --- Scheduled version check (static cron, not user-configurable) ---
async function runScheduledCheck() {
    try {
        const versions = await (0, version_fetcher_1.fetchAllLatestVersions)();
        const devicesByProduct = (0, customers_2.getAllDevicesByProduct)();
        const updates = [];
        for (const version of versions) {
            if (!version.latestVersion)
                continue;
            const devices = devicesByProduct[version.product] || [];
            for (const device of devices) {
                const comparison = (0, comparator_1.compareVersions)(device.currentVersion, version.latestVersion, version.product);
                updates.push({ ...comparison, customer: device.customerName, device: `${device.source}-device` });
            }
        }
        await (0, notifier_1.sendNotifications)(updates);
        console.log(`[Scheduler] Version check complete. ${updates.length} device(s) checked.`);
    }
    catch (error) {
        console.error('[Scheduler] Version check failed:', error);
    }
}
node_cron_1.default.schedule(config_1.config.checkCron, runScheduledCheck);
// --- Dynamic cron jobs (configurable via UI) ---
const activeCronJobs = new Map();
const TASK_RUNNERS = {
    ninjaone_customers: async () => {
        if (!(0, runtime_settings_1.isNinjaOneConfigured)())
            return;
        const r = await (0, ninjaone_1.syncNinjaOneCustomers)('cron');
        console.log(`[Scheduler] ninjaone_customers done. ${r.customers} customers.`);
    },
    ninjaone_devices: async () => {
        if (!(0, runtime_settings_1.isNinjaOneConfigured)())
            return;
        const r = await (0, ninjaone_1.syncNinjaOneDevices)('cron');
        console.log(`[Scheduler] ninjaone_devices done. ${r.devices} devices.`);
    },
    unifi_customers: async () => {
        console.log('[Scheduler] unifi_customers: no standalone impl — trigger full UniFi sync via UI');
    },
    unifi_devices: async () => {
        console.log('[Scheduler] unifi_devices: no standalone impl — trigger full UniFi sync via UI');
    },
    sophos_customers: async () => {
        if (!(0, runtime_settings_1.isSophosConfigured)())
            return;
        const r = await (0, sophos_1.syncSophosData)('cron');
        console.log(`[Scheduler] sophos_customers done. ${r.tenants} tenants.`);
    },
    sophos_devices: async () => {
        if (!(0, runtime_settings_1.isSophosConfigured)())
            return;
        const r = await (0, sophos_1.syncSophosData)('cron');
        console.log(`[Scheduler] sophos_devices done. ${r.devices} devices.`);
    },
    sophos_alerts: async () => {
        if (!(0, runtime_settings_1.isSophosConfigured)())
            return;
        const r = await (0, sophos_1.syncSophosAlerts)('cron');
        console.log(`[Scheduler] sophos_alerts done. ${r.total} alerts.`);
    },
    backup_emails: async () => {
        if (!(0, runtime_settings_1.isGraphConfigured)())
            return;
        const r = await (0, backup_checker_1.syncBackupEmails)('cron');
        console.log(`[Scheduler] backup_emails done. ${r.newResults} new result(s).`);
    },
};
function reloadCronJobs() {
    for (const [, job] of activeCronJobs) {
        try {
            job.stop();
        }
        catch { /* ignore */ }
    }
    activeCronJobs.clear();
    for (const taskType of runtime_settings_1.ALL_TASK_TYPES) {
        const schedule = (0, runtime_settings_1.getCronSchedule)(taskType);
        const runner = TASK_RUNNERS[taskType];
        if (!runner)
            continue;
        const job = node_cron_1.default.schedule(schedule, async () => {
            try {
                await runner();
            }
            catch (e) {
                console.error(`[Scheduler] ${taskType} failed:`, e);
            }
        });
        activeCronJobs.set(taskType, job);
    }
    console.log(`[Scheduler] ${runtime_settings_1.ALL_TASK_TYPES.length} task cron jobs reloaded.`);
}
// Daily audit log cleanup + secret expiry check
node_cron_1.default.schedule('30 2 * * *', () => {
    const deleted = (0, audit_1.cleanupOldLogs)();
    if (deleted > 0)
        console.log(`[Scheduler] Audit log cleanup: ${deleted} entries deleted`);
    (0, secret_expiry_1.checkExpiringSecrets)();
});
// Start server
app.listen(config_1.config.port, () => {
    console.log(`[Server] Version Checker running on http://localhost:${config_1.config.port}`);
    reloadCronJobs();
    if ((0, runtime_settings_1.isNinjaOneConfigured)()) {
        (0, ninjaone_1.syncNinjaOneData)('startup').catch(e => console.error('[Startup] NinjaOne sync failed:', e));
    }
    runScheduledCheck();
});
