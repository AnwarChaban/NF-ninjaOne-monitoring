import { Router } from 'express';
import { getDb } from '../db';
import { config } from '../config';
import { isNinjaOneConfigured, isSophosConfigured, getCronSchedule, updateCronSchedule } from '../services/runtime-settings';
import { requireAuth, requireRole } from '../middleware/auth';
import { getExpiryStatus } from '../services/secret-expiry';
import { logAction } from '../services/audit';
import { CronExpressionParser } from 'cron-parser';
import { reloadCronJobs } from '../index';

const router = Router();

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

router.get('/settings', requireAuth, requireRole('administrator'), (_req, res) => {
  const db = getDb();
  const settings: Record<string, string> = {
    ninjaoneApiKey: config.ninjaone.apiKey || '',
    ninjaoneClientId: config.ninjaone.clientId || '',
    ninjaoneClientSecret: config.ninjaone.clientSecret || '',
    unifiApiKey: '',
    unifiClientId: '',
    unifiClientSecret: '',
    sophosTokenUrl: config.sophos.tokenUrl || '',
    sophosClientId: config.sophos.clientId || '',
    sophosClientSecret: config.sophos.clientSecret || '',
    sophosPartnerId: config.sophos.partnerId || '',
    sophosScope: config.sophos.scope || 'token',
    graphTenantId: config.graph.tenantId || '',
    graphClientId: config.graph.clientId || '',
    graphClientSecret: config.graph.clientSecret || '',
    backupMailbox: config.backupMailbox || '',
    showUpToDateDevices: 'false',
  };

  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  for (const row of rows) {
    if (ALLOWED_SETTINGS_KEYS.has(row.key)) {
      settings[row.key] = row.value;
    }
  }
  settings.sophosConfigured = isSophosConfigured() ? 'true' : 'false';
  res.json(settings);
});

router.put('/settings', requireAuth, requireRole('administrator'), (req, res) => {
  const db = getDb();
  const updates = req.body as Record<string, string>;
  const changed: string[] = [];

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) continue;
      stmt.run(key, value);
      changed.push(key);
    }
  });
  transaction();

  if (changed.length > 0) {
    logAction(req.user!, 'settings.update', 'settings', null, null, { changed }, req);
  }

  res.json({ ok: true });
});

// PATCH /api/settings/:key — update value + optional expires_at
router.patch('/settings/:key', requireAuth, requireRole('administrator'), (req, res) => {
  const key = req.params['key'] as string;
  if (!ALLOWED_SETTINGS_KEYS.has(key)) {
    res.status(400).json({ error: 'Unknown settings key' });
    return;
  }

  const { value, expires_at } = req.body as { value?: string; expires_at?: string | null };
  const db = getDb();

  if (value !== undefined) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
  if (expires_at !== undefined) {
    db.prepare('UPDATE settings SET expires_at = ?, expiry_warning_sent = 0 WHERE key = ?').run(expires_at ?? null, key);
  }

  logAction(req.user!, 'settings.update', 'settings', key, key, { expires_at }, req);
  res.json({ ok: true });
});

// GET /api/settings/expiry — secret expiry status (admin only)
router.get('/settings/expiry', requireAuth, requireRole('administrator'), (_req, res) => {
  res.json(getExpiryStatus());
});

// GET /api/settings/cron — all per-task cron schedules
router.get('/settings/cron', requireAuth, requireRole('administrator'), (_req, res) => {
  const tasks = ['ninjaone_customers', 'ninjaone_devices', 'unifi_customers', 'unifi_devices', 'sophos_customers', 'sophos_devices', 'sophos_alerts', 'backup_emails'];
  res.json(Object.fromEntries(tasks.map(t => [t, getCronSchedule(t)])));
});

// PATCH /api/settings/cron/:taskType — update per-task cron schedule
router.patch('/settings/cron/:taskType', requireAuth, requireRole('administrator'), (req, res) => {
  const integration = req.params['taskType'] as string;
  const valid = ['ninjaone_customers', 'ninjaone_devices', 'unifi_customers', 'unifi_devices', 'sophos_customers', 'sophos_devices', 'sophos_alerts', 'backup_emails'];
  if (!valid.includes(integration)) {
    res.status(400).json({ error: 'Ungültiger Task-Typ' });
    return;
  }

  const { cronExpression } = req.body as { cronExpression?: string };
  if (!cronExpression?.trim()) {
    res.status(400).json({ error: 'cronExpression ist erforderlich' });
    return;
  }

  try {
    CronExpressionParser.parse(cronExpression.trim());
  } catch {
    res.status(400).json({ error: 'Ungültiger Cron-Ausdruck' });
    return;
  }

  updateCronSchedule(integration, cronExpression.trim());
  reloadCronJobs();
  logAction(req.user!, 'sync_cron_updated', 'cron', integration, integration, { cronExpression: cronExpression.trim() }, req);
  res.json({ ok: true });
});

export default router;
