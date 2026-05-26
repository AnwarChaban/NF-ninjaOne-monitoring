import express from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { config } from './config';
import { getDb } from './db';
import productsRouter from './routes/products';
import checksRouter from './routes/checks';
import settingsRouter from './routes/settings';
import adminRouter from './routes/admin';
import backupRouter from './routes/backup';
import customersRouter from './routes/customers';
import usersRouter from './routes/users';
import logsRouter from './routes/logs';
import syncRouter from './routes/sync';
import { fetchAllLatestVersions } from './services/version-fetcher';
import { compareVersions } from './services/comparator';
import { sendNotifications, type UpdateNotification } from './services/notifier';
import { isNinjaOneConfigured, isGraphConfigured, isSophosConfigured, getCronSchedule, seedCronSettings, ALL_TASK_TYPES } from './services/runtime-settings';
import { cleanupOldLogs } from './services/audit';
import { checkExpiringSecrets } from './services/secret-expiry';
import { getAllDevicesByProduct } from './services/customers';
import { syncBackupEmails } from './services/backup-checker';
import { syncNinjaOneData, syncNinjaOneCustomers, syncNinjaOneDevices } from './services/ninjaone';
import { syncSophosData, syncSophosAlerts } from './services/sophos';

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', usersRouter);
app.use('/api', logsRouter);
app.use('/api', syncRouter);
app.use('/api', productsRouter);
app.use('/api', checksRouter);
app.use('/api', settingsRouter);
app.use('/api', backupRouter);
app.use('/api', customersRouter);
app.use('/api', adminRouter);

// Serve React frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Initialize DB + seed cron settings
getDb();
seedCronSettings();

// --- Scheduled version check (static cron, not user-configurable) ---
async function runScheduledCheck() {
  try {
    const versions = await fetchAllLatestVersions();
    const devicesByProduct = getAllDevicesByProduct();
    const updates: UpdateNotification[] = [];
    for (const version of versions) {
      if (!version.latestVersion) continue;
      const devices = devicesByProduct[version.product] || [];
      for (const device of devices) {
        const comparison = compareVersions(device.currentVersion, version.latestVersion, version.product);
        updates.push({ ...comparison, customer: device.customerName, device: `${device.source}-device` });
      }
    }
    await sendNotifications(updates);
    console.log(`[Scheduler] Version check complete. ${updates.length} device(s) checked.`);
  } catch (error) {
    console.error('[Scheduler] Version check failed:', error);
  }
}
cron.schedule(config.checkCron, runScheduledCheck);

// --- Dynamic cron jobs (configurable via UI) ---
const activeCronJobs = new Map<string, ScheduledTask>();

type TaskRunner = () => Promise<void>;

const TASK_RUNNERS: Record<string, TaskRunner> = {
  ninjaone_customers: async () => {
    if (!isNinjaOneConfigured()) return;
    const r = await syncNinjaOneCustomers('cron');
    console.log(`[Scheduler] ninjaone_customers done. ${r.customers} customers.`);
  },
  ninjaone_devices: async () => {
    if (!isNinjaOneConfigured()) return;
    const r = await syncNinjaOneDevices('cron');
    console.log(`[Scheduler] ninjaone_devices done. ${r.devices} devices.`);
  },
  unifi_customers: async () => {
    console.log('[Scheduler] unifi_customers: no standalone impl — trigger full UniFi sync via UI');
  },
  unifi_devices: async () => {
    console.log('[Scheduler] unifi_devices: no standalone impl — trigger full UniFi sync via UI');
  },
  sophos_customers: async () => {
    if (!isSophosConfigured()) return;
    const r = await syncSophosData('cron');
    console.log(`[Scheduler] sophos_customers done. ${r.tenants} tenants.`);
  },
  sophos_devices: async () => {
    if (!isSophosConfigured()) return;
    const r = await syncSophosData('cron');
    console.log(`[Scheduler] sophos_devices done. ${r.devices} devices.`);
  },
  sophos_alerts: async () => {
    if (!isSophosConfigured()) return;
    const r = await syncSophosAlerts('cron');
    console.log(`[Scheduler] sophos_alerts done. ${r.total} alerts.`);
  },
  backup_emails: async () => {
    if (!isGraphConfigured()) return;
    const r = await syncBackupEmails('cron');
    console.log(`[Scheduler] backup_emails done. ${r.newResults} new result(s).`);
  },
};

export function reloadCronJobs(): void {
  for (const [, job] of activeCronJobs) {
    try { job.stop(); } catch { /* ignore */ }
  }
  activeCronJobs.clear();

  for (const taskType of ALL_TASK_TYPES) {
    const schedule = getCronSchedule(taskType);
    const runner = TASK_RUNNERS[taskType];
    if (!runner) continue;
    const job = cron.schedule(schedule, async () => {
      try { await runner(); }
      catch (e) { console.error(`[Scheduler] ${taskType} failed:`, e); }
    });
    activeCronJobs.set(taskType, job);
  }

  console.log(`[Scheduler] ${ALL_TASK_TYPES.length} task cron jobs reloaded.`);
}

// Daily audit log cleanup + secret expiry check
cron.schedule('30 2 * * *', () => {
  const deleted = cleanupOldLogs();
  if (deleted > 0) console.log(`[Scheduler] Audit log cleanup: ${deleted} entries deleted`);
  checkExpiringSecrets();
});

// Start server
app.listen(config.port, () => {
  console.log(`[Server] Version Checker running on http://localhost:${config.port}`);

  reloadCronJobs();

  if (isNinjaOneConfigured()) {
    syncNinjaOneData('startup').catch(e => console.error('[Startup] NinjaOne sync failed:', e));
  }
  runScheduledCheck();
});
