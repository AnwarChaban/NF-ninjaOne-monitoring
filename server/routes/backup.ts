import { Router } from 'express';
import { getDb } from '../db';
import { isGraphConfigured } from '../services/runtime-settings';
import {
  syncBackupEmails,
  getBackupDashboardData,
  getAllBackupChecks,
  getAllBackupAccounts,
} from '../services/backup-checker';

const router = Router();

// --- Debug / Test ---

router.get('/admin/backup/test', async (_req, res) => {
  const { getGraphRuntimeConfig, getBackupMailbox, isGraphConfigured } = await import('../services/runtime-settings');
  const cfg = getGraphRuntimeConfig();
  const mailbox = getBackupMailbox();

  const info: Record<string, unknown> = {
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
    const tokenBody = await tokenRes.json() as any;

    if (!tokenRes.ok) {
      res.json({ ok: false, info, step: 'token', error: tokenBody });
      return;
    }

    info.tokenOk = true;
    const token = tokenBody.access_token as string;

    // Mailbox-Test
    if (mailbox) {
      const mailboxUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}`;
      const mailboxRes = await fetch(mailboxUrl, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      const mailboxBody = await mailboxRes.json() as any;

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
      const msgBody = await msgRes.json() as any;

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
  } catch (err) {
    res.json({ ok: false, info, step: 'network', error: (err as Error).message });
  }
});

// --- Dashboard ---

router.get('/backup/status', (_req, res) => {
  try {
    const groups = getBackupDashboardData();
    res.json({ configured: isGraphConfigured(), groups });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/backup/sync', async (_req, res) => {
  if (!isGraphConfigured()) {
    res.status(400).json({ error: 'Microsoft Graph API ist nicht konfiguriert' });
    return;
  }
  try {
    const result = await syncBackupEmails();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Admin: Backup Accounts ---

router.get('/admin/backup-accounts', (_req, res) => {
  res.json(getAllBackupAccounts());
});

// --- Admin: Backup Checks ---

router.get('/admin/backup-checks', (_req, res) => {
  res.json(getAllBackupChecks());
});

router.post('/admin/backup-checks', (req, res) => {
  const db = getDb();
  const { backupAccountId, name, intervalHours, graceHours, subjectFilter, subjectMatchType, bodyFilter } =
    req.body as {
      backupAccountId?: number;
      name?: string;
      intervalHours?: number;
      graceHours?: number;
      subjectFilter?: string | null;
      subjectMatchType?: 'contains' | 'exact';
      bodyFilter?: string | null;
    };

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
  `).run(
    backupAccountId,
    name,
    intervalHours,
    graceHours ?? 1,
    subjectFilter ?? null,
    subjectMatchType ?? 'contains',
    bodyFilter ?? null,
    now,
    now,
  );

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/admin/backup-checks/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const { name, backupAccountId, intervalHours, graceHours, subjectFilter, subjectMatchType, bodyFilter, active } =
    req.body as {
      name?: string;
      backupAccountId?: number;
      intervalHours?: number;
      graceHours?: number;
      subjectFilter?: string | null;
      subjectMatchType?: 'contains' | 'exact';
      bodyFilter?: string | null;
      active?: boolean;
    };

  if (!db.prepare('SELECT id FROM backup_checks WHERE id = ?').get(id)) {
    res.status(404).json({ error: 'Backup check not found' });
    return;
  }

  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const values: unknown[] = [now];

  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (backupAccountId !== undefined) { updates.push('backup_account_id = ?'); values.push(backupAccountId); }
  if (intervalHours !== undefined) { updates.push('interval_hours = ?'); values.push(intervalHours); }
  if (graceHours !== undefined) { updates.push('grace_hours = ?'); values.push(graceHours); }
  if (subjectFilter !== undefined) { updates.push('subject_filter = ?'); values.push(subjectFilter ?? null); }
  if (subjectMatchType !== undefined) { updates.push('subject_match_type = ?'); values.push(subjectMatchType); }
  if (bodyFilter !== undefined) { updates.push('body_filter = ?'); values.push(bodyFilter ?? null); }
  if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }

  values.push(id);
  db.prepare(`UPDATE backup_checks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

router.delete('/admin/backup-checks/:id', (req, res) => {
  getDb().prepare('DELETE FROM backup_checks WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

export default router;
