import express from 'express';
import cors from 'cors';
import path from 'path';
import cron from 'node-cron';
import { config } from './config';
import { getDb } from './db';
import productsRouter from './routes/products';
import checksRouter from './routes/checks';
import settingsRouter from './routes/settings';
import adminRouter from './routes/admin';
import { fetchAllLatestVersions } from './services/version-fetcher';
import { compareVersions } from './services/comparator';
import { sendNotifications, type UpdateNotification } from './services/notifier';
import { isNinjaOneConfigured } from './services/runtime-settings';
import { getAllDevicesByProduct } from './services/customers';
import { syncNinjaOneData } from './services/ninjaone';

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', productsRouter);
app.use('/api', checksRouter);
app.use('/api', settingsRouter);
app.use('/api', adminRouter);

// Serve React frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Initialize DB
getDb();

// Scheduled version check
async function runScheduledCheck() {
  console.log(`[Scheduler] Running version check at ${new Date().toISOString()}`);
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
    console.log(`[Scheduler] Check complete. ${updates.length} device(s) checked.`);
  } catch (error) {
    console.error('[Scheduler] Check failed:', error);
  }
}

cron.schedule(config.checkCron, runScheduledCheck);
console.log(`[Scheduler] Cron scheduled: ${config.checkCron}`);

cron.schedule(config.ninjaSyncCron, async () => {
  if (!isNinjaOneConfigured()) {
    return;
  }

  console.log(`[Scheduler] Running NinjaOne sync at ${new Date().toISOString()}`);
  try {
    const result = await syncNinjaOneData();
    console.log(`[Scheduler] NinjaOne sync complete. ${result.customers} customer(s), ${result.devices} device entry/entries.`);
  } catch (error) {
    console.error('[Scheduler] NinjaOne sync failed:', error);
  }
});
console.log(`[Scheduler] NinjaOne sync cron scheduled: ${config.ninjaSyncCron}`);

// Start server
app.listen(config.port, () => {
  console.log(`[Server] Version Checker running on http://localhost:${config.port}`);
  console.log(`[Server] NinjaOne: runtime-config enabled`);

  if (isNinjaOneConfigured()) {
    console.log('[Scheduler] Running initial NinjaOne sync...');
    syncNinjaOneData().catch(error => {
      console.error('[Scheduler] Initial NinjaOne sync failed:', error);
    });
  }

  // Run initial check on startup
  console.log('[Scheduler] Running initial version check...');
  runScheduledCheck();
});
