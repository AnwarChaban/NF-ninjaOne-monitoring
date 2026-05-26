import { getDb } from '../db';
import { fetchEmailsFromSender } from './graph-mail';
import { isGraphConfigured } from './runtime-settings';
import { startSync, completeSync, failSync } from './sync-history';
import { logAction } from './audit';
import type { AuthUser } from './auth';

export type BackupStatus = 'success' | 'failed' | 'missed' | 'unknown' | 'paused';

export interface BackupAccount {
  id: number;
  customerId: number;
  customerName: string;
  fromEmail: string;
  name: string;
}

export interface BackupCheck {
  id: number;
  backupAccountId: number;
  customerId: number;
  customerName: string;
  fromEmail: string;
  name: string;
  intervalHours: number;
  graceHours: number;
  subjectFilter: string | null;
  subjectMatchType: 'contains' | 'exact';
  bodyFilter: string | null;
  active: boolean;
  createdAt: string;
  paused: boolean;
  pausedAt: string | null;
  pausedBy: number | null;
  pausedReason: string | null;
  pausedUntil: string | null;
  manualStatus: 'success' | 'failed' | 'missed' | 'unknown' | null;
  manualStatusSetAt: string | null;
  manualStatusSetBy: number | null;
  manualStatusComment: string | null;
}

export interface BackupCheckResult {
  id: number;
  checkId: number;
  receivedAt: string;
  subject: string;
  status: 'success' | 'failed';
}

export interface BackupCheckStatus extends BackupCheck {
  currentStatus: BackupStatus;
  lastReceivedAt: string | null;
  lastEmailStatus: 'success' | 'failed' | null;
  recentResults: Array<{ slotEnd: string; status: 'success' | 'failed' | 'missed' }>;
}

export interface BackupCustomerGroup {
  customerId: number;
  customerName: string;
  fromEmail: string;
  checks: BackupCheckStatus[];
}

const FAIL_KEYWORDS = ['error', 'failed', 'failure', 'fehler', ' err '];

function detectEmailStatus(subject: string, bodyPreview: string): 'success' | 'failed' {
  const text = (subject + ' ' + bodyPreview).toLowerCase();
  if (FAIL_KEYWORDS.some(kw => text.includes(kw))) return 'failed';
  return 'success';
}

function matchesCheck(subject: string, bodyPreview: string, check: BackupCheck): boolean {
  if (check.subjectFilter) {
    const subjectMatch = check.subjectMatchType === 'exact'
      ? subject === check.subjectFilter
      : subject.toLowerCase().includes(check.subjectFilter.toLowerCase());
    if (!subjectMatch) return false;
  }

  if (check.bodyFilter) {
    if (!bodyPreview.toLowerCase().includes(check.bodyFilter.toLowerCase())) return false;
  }

  return true;
}

function computeCheckStatus(check: BackupCheck, lastResult: BackupCheckResult | null): BackupStatus {
  if (check.paused) return 'paused';
  if (check.manualStatus !== null) return check.manualStatus;
  if (!lastResult) return 'unknown';
  const ageHours = (Date.now() - new Date(lastResult.receivedAt).getTime()) / 3_600_000;
  if (ageHours > check.intervalHours + check.graceHours) return 'missed';
  return lastResult.status;
}

function getCheckInfo(checkId: number): { name: string; customerName: string } | undefined {
  return getDb().prepare(`
    SELECT bc.name, c.name as customerName
    FROM backup_checks bc
    JOIN backup_accounts ba ON bc.backup_account_id = ba.id
    JOIN customers c ON ba.customer_id = c.id
    WHERE bc.id = ?
  `).get(checkId) as { name: string; customerName: string } | undefined;
}

export function setManualStatus(
  checkId: number,
  status: 'success' | 'failed' | 'missed' | 'unknown' | null,
  user: AuthUser | null,
  comment: string | null = null,
): void {
  const db = getDb();
  const row = getCheckInfo(checkId);
  if (!row) throw new Error('Backup check not found');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE backup_checks
    SET manual_status = ?, manual_status_set_at = ?, manual_status_set_by = ?,
        manual_status_comment = ?, updated_at = ?
    WHERE id = ?
  `).run(
    status ?? null,
    status ? now : null,
    status ? (user?.id ?? null) : null,
    comment ?? null,
    now,
    checkId,
  );

  if (status !== null) {
    logAction(user, 'backup_check_status_manual_set', 'backup_check', checkId, row.name,
      { checkName: row.name, customerName: row.customerName, status, comment }, null);
  } else {
    logAction(user, 'backup_check_status_manual_cleared', 'backup_check', checkId, row.name,
      { checkName: row.name, customerName: row.customerName }, null);
  }
}

export function pauseCheck(
  checkId: number,
  user: AuthUser | null,
  reason: string,
  pausedUntil: string | null = null,
): void {
  const db = getDb();
  const row = getCheckInfo(checkId);
  if (!row) throw new Error('Backup check not found');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE backup_checks
    SET paused = 1, paused_at = ?, paused_by = ?, paused_reason = ?, paused_until = ?, updated_at = ?
    WHERE id = ?
  `).run(now, user?.id ?? null, reason, pausedUntil ?? null, now, checkId);

  logAction(user, 'backup_check_paused', 'backup_check', checkId, row.name,
    { checkName: row.name, customerName: row.customerName, reason, pausedUntil }, null);
}

export function resumeCheck(checkId: number, user: AuthUser | null): void {
  const db = getDb();
  const row = getCheckInfo(checkId);
  if (!row) throw new Error('Backup check not found');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE backup_checks
    SET paused = 0, paused_at = NULL, paused_by = NULL, paused_reason = NULL, paused_until = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, checkId);

  logAction(user, 'backup_check_resumed', 'backup_check', checkId, row.name,
    { checkName: row.name, customerName: row.customerName }, null);
}

export function checkPausedExpiry(): void {
  const db = getDb();
  const now = new Date().toISOString();
  const expired = db.prepare(`
    SELECT id FROM backup_checks WHERE paused = 1 AND paused_until IS NOT NULL AND paused_until <= ?
  `).all(now) as Array<{ id: number }>;

  for (const { id } of expired) {
    try {
      resumeCheck(id, null);
    } catch (e) {
      console.error(`[BackupChecker] Auto-resume failed for check ${id}:`, e);
    }
  }

  if (expired.length > 0) {
    console.log(`[BackupChecker] Auto-resumed ${expired.length} paused check(s)`);
  }
}

export async function syncBackupEmails(triggeredBy = 'cron'): Promise<{ checked: number; newResults: number }> {
  if (!isGraphConfigured()) throw new Error('Microsoft Graph API is not configured');

  checkPausedExpiry();

  const syncId = startSync('backup', triggeredBy, 'backup_emails');
  try {
    const result = await _syncBackupEmailsInternal();
    completeSync(syncId, result.newResults, result.checked);
    return result;
  } catch (e) {
    failSync(syncId, (e as Error).message);
    throw e;
  }
}

async function _syncBackupEmailsInternal(): Promise<{ checked: number; newResults: number }> {
  if (!isGraphConfigured()) throw new Error('Microsoft Graph API is not configured');

  const db = getDb();
  const accounts = getAllBackupAccounts();
  if (accounts.length === 0) return { checked: 0, newResults: 0 };

  const allChecks = getAllBackupChecks().filter(c => c.active && !c.paused);

  const insertResult = db.prepare(`
    INSERT OR IGNORE INTO backup_check_results
      (check_id, message_id, received_at, subject, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let newResults = 0;
  const now = new Date().toISOString();

  for (const account of accounts) {
    const accountChecks = allChecks.filter(c => c.backupAccountId === account.id);
    if (accountChecks.length === 0) continue;

    // TODO: Datumsfilter wieder aktivieren sobald Tests abgeschlossen
    // const maxIntervalDays = Math.min(
    //   Math.max(...accountChecks.map(c => c.intervalHours)) / 24 + 1,
    //   7,
    // );
    const maxIntervalDays = 365; // TEST: kein Datumsfilter, alle E-Mails abrufen

    const emails = await fetchEmailsFromSender(account.fromEmail, Math.ceil(maxIntervalDays));

    const transaction = db.transaction(() => {
      for (const email of emails) {
        for (const check of accountChecks) {
          if (!matchesCheck(email.subject, email.bodyPreview, check)) continue;
          const status = detectEmailStatus(email.subject, email.bodyPreview);
          const info = insertResult.run(check.id, email.id, email.receivedAt, email.subject, status, now);
          if (info.changes > 0) newResults++;
        }
      }
    });

    transaction();
  }

  return { checked: allChecks.length, newResults };
}

export function getAllBackupAccounts(): BackupAccount[] {
  const db = getDb();
  return db.prepare(`
    SELECT ba.id, ba.customer_id as customerId, c.name as customerName,
           ba.from_email as fromEmail, ba.name
    FROM backup_accounts ba
    JOIN customers c ON ba.customer_id = c.id
    ORDER BY c.name
  `).all() as BackupAccount[];
}

export function getAllBackupChecks(): BackupCheck[] {
  const db = getDb();
  return db.prepare(`
    SELECT bc.id, bc.backup_account_id as backupAccountId,
           ba.customer_id as customerId, c.name as customerName,
           ba.from_email as fromEmail,
           bc.name, bc.interval_hours as intervalHours, bc.grace_hours as graceHours,
           bc.subject_filter as subjectFilter, bc.subject_match_type as subjectMatchType,
           bc.body_filter as bodyFilter, bc.active, bc.created_at as createdAt,
           bc.paused, bc.paused_at as pausedAt, bc.paused_by as pausedBy,
           bc.paused_reason as pausedReason, bc.paused_until as pausedUntil,
           bc.manual_status as manualStatus, bc.manual_status_set_at as manualStatusSetAt,
           bc.manual_status_set_by as manualStatusSetBy,
           bc.manual_status_comment as manualStatusComment
    FROM backup_checks bc
    JOIN backup_accounts ba ON bc.backup_account_id = ba.id
    JOIN customers c ON ba.customer_id = c.id
    ORDER BY c.name, bc.name
  `).all() as BackupCheck[];
}

export function getBackupDashboardData(): BackupCustomerGroup[] {
  const db = getDb();
  const checks = getAllBackupChecks().filter(c => c.active);

  const statusList: BackupCheckStatus[] = checks.map(check => {
    const lastResult = db.prepare(`
      SELECT id, check_id as checkId, received_at as receivedAt, subject, status
      FROM backup_check_results WHERE check_id = ?
      ORDER BY received_at DESC LIMIT 1
    `).get(check.id) as BackupCheckResult | undefined;

    const SLOT_COUNT = 10;
    const slotMs = check.intervalHours * 3_600_000;
    const recentResults: Array<{ slotEnd: string; status: 'success' | 'failed' | 'missed' }> = [];

    for (let i = 0; i < SLOT_COUNT; i++) {
      const slotEnd = new Date(Date.now() - i * slotMs).toISOString();
      const slotStart = new Date(Date.now() - (i + 1) * slotMs).toISOString();
      const hit = db.prepare(`
        SELECT status FROM backup_check_results
        WHERE check_id = ? AND received_at >= ? AND received_at < ?
        ORDER BY received_at DESC LIMIT 1
      `).get(check.id, slotStart, slotEnd) as { status: 'success' | 'failed' } | undefined;
      recentResults.push({ slotEnd, status: hit ? hit.status : 'missed' });
    }

    return {
      ...check,
      currentStatus: computeCheckStatus(check, lastResult ?? null),
      lastReceivedAt: lastResult?.receivedAt ?? null,
      lastEmailStatus: lastResult?.status ?? null,
      recentResults,
    };
  });

  // Group by customer
  const groupMap = new Map<number, BackupCustomerGroup>();
  for (const item of statusList) {
    if (!groupMap.has(item.customerId)) {
      groupMap.set(item.customerId, {
        customerId: item.customerId,
        customerName: item.customerName,
        fromEmail: item.fromEmail,
        checks: [],
      });
    }
    groupMap.get(item.customerId)!.checks.push(item);
  }

  return Array.from(groupMap.values()).sort((a, b) =>
    a.customerName.localeCompare(b.customerName, 'de')
  );
}
