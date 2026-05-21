import { getDb } from '../db';
import { fetchEmailsFromSender } from './graph-mail';
import { isGraphConfigured } from './runtime-settings';
import { startSync, completeSync, failSync } from './sync-history';

export type BackupStatus = 'success' | 'failed' | 'missed' | 'unknown';

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

function computeStatus(check: BackupCheck, lastResult: BackupCheckResult | null): BackupStatus {
  if (!lastResult) return 'unknown';
  const ageHours = (Date.now() - new Date(lastResult.receivedAt).getTime()) / 3_600_000;
  if (ageHours > check.intervalHours + check.graceHours) return 'missed';
  return lastResult.status;
}

export async function syncBackupEmails(triggeredBy = 'cron'): Promise<{ checked: number; newResults: number }> {
  if (!isGraphConfigured()) throw new Error('Microsoft Graph API is not configured');

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

  const allChecks = getAllBackupChecks().filter(c => c.active);

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
           bc.body_filter as bodyFilter, bc.active, bc.created_at as createdAt
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
      currentStatus: computeStatus(check, lastResult ?? null),
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
