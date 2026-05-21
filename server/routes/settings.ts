import { Router } from 'express';
import { getDb } from '../db';
import { config } from '../config';
import { isNinjaOneConfigured, isSophosConfigured } from '../services/runtime-settings';
import { requireAuth, requireRole } from '../middleware/auth';

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
  settings.mockMode = isNinjaOneConfigured() ? 'false' : 'true';
  settings.sophosConfigured = isSophosConfigured() ? 'true' : 'false';
  res.json(settings);
});

router.put('/settings', requireAuth, requireRole('administrator'), (req, res) => {
  const db = getDb();
  const updates = req.body as Record<string, string>;

  const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const transaction = db.transaction(() => {
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) continue;
      stmt.run(key, value);
    }
  });
  transaction();

  res.json({ ok: true });
});

export default router;
