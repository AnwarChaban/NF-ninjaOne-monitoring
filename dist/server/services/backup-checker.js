"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setManualStatus = setManualStatus;
exports.pauseCheck = pauseCheck;
exports.resumeCheck = resumeCheck;
exports.checkPausedExpiry = checkPausedExpiry;
exports.syncBackupEmails = syncBackupEmails;
exports.getAllBackupAccounts = getAllBackupAccounts;
exports.getAllBackupChecks = getAllBackupChecks;
exports.getBackupDashboardData = getBackupDashboardData;
const db_1 = require("../db");
const graph_mail_1 = require("./graph-mail");
const runtime_settings_1 = require("./runtime-settings");
const sync_history_1 = require("./sync-history");
const audit_1 = require("./audit");
const FAIL_KEYWORDS = ['error', 'failed', 'failure', 'fehler', ' err '];
function detectEmailStatus(subject, bodyPreview) {
    const text = (subject + ' ' + bodyPreview).toLowerCase();
    if (FAIL_KEYWORDS.some(kw => text.includes(kw)))
        return 'failed';
    return 'success';
}
function matchesCheck(subject, bodyPreview, check) {
    if (check.subjectFilter) {
        const subjectMatch = check.subjectMatchType === 'exact'
            ? subject === check.subjectFilter
            : subject.toLowerCase().includes(check.subjectFilter.toLowerCase());
        if (!subjectMatch)
            return false;
    }
    if (check.bodyFilter) {
        if (!bodyPreview.toLowerCase().includes(check.bodyFilter.toLowerCase()))
            return false;
    }
    return true;
}
function computeCheckStatus(check, lastResult) {
    if (check.paused)
        return 'paused';
    if (check.manualStatus !== null)
        return check.manualStatus;
    if (!lastResult)
        return 'unknown';
    const ageHours = (Date.now() - new Date(lastResult.receivedAt).getTime()) / 3_600_000;
    if (ageHours > check.intervalHours + check.graceHours)
        return 'missed';
    return lastResult.status;
}
function getCheckInfo(checkId) {
    return (0, db_1.getDb)().prepare(`
    SELECT bc.name, c.name as customerName
    FROM backup_checks bc
    JOIN backup_accounts ba ON bc.backup_account_id = ba.id
    JOIN customers c ON ba.customer_id = c.id
    WHERE bc.id = ?
  `).get(checkId);
}
function setManualStatus(checkId, status, user, comment = null) {
    const db = (0, db_1.getDb)();
    const row = getCheckInfo(checkId);
    if (!row)
        throw new Error('Backup check not found');
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE backup_checks
    SET manual_status = ?, manual_status_set_at = ?, manual_status_set_by = ?,
        manual_status_comment = ?, updated_at = ?
    WHERE id = ?
  `).run(status ?? null, status ? now : null, status ? (user?.id ?? null) : null, comment ?? null, now, checkId);
    if (status !== null) {
        (0, audit_1.logAction)(user, 'backup_check_status_manual_set', 'backup_check', checkId, row.name, { checkName: row.name, customerName: row.customerName, status, comment }, null);
    }
    else {
        (0, audit_1.logAction)(user, 'backup_check_status_manual_cleared', 'backup_check', checkId, row.name, { checkName: row.name, customerName: row.customerName }, null);
    }
}
function pauseCheck(checkId, user, reason, pausedUntil = null) {
    const db = (0, db_1.getDb)();
    const row = getCheckInfo(checkId);
    if (!row)
        throw new Error('Backup check not found');
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE backup_checks
    SET paused = 1, paused_at = ?, paused_by = ?, paused_reason = ?, paused_until = ?, updated_at = ?
    WHERE id = ?
  `).run(now, user?.id ?? null, reason, pausedUntil ?? null, now, checkId);
    (0, audit_1.logAction)(user, 'backup_check_paused', 'backup_check', checkId, row.name, { checkName: row.name, customerName: row.customerName, reason, pausedUntil }, null);
}
function resumeCheck(checkId, user) {
    const db = (0, db_1.getDb)();
    const row = getCheckInfo(checkId);
    if (!row)
        throw new Error('Backup check not found');
    const now = new Date().toISOString();
    db.prepare(`
    UPDATE backup_checks
    SET paused = 0, paused_at = NULL, paused_by = NULL, paused_reason = NULL, paused_until = NULL, updated_at = ?
    WHERE id = ?
  `).run(now, checkId);
    (0, audit_1.logAction)(user, 'backup_check_resumed', 'backup_check', checkId, row.name, { checkName: row.name, customerName: row.customerName }, null);
}
function checkPausedExpiry() {
    const db = (0, db_1.getDb)();
    const now = new Date().toISOString();
    const expired = db.prepare(`
    SELECT id FROM backup_checks WHERE paused = 1 AND paused_until IS NOT NULL AND paused_until <= ?
  `).all(now);
    for (const { id } of expired) {
        try {
            resumeCheck(id, null);
        }
        catch (e) {
            console.error(`[BackupChecker] Auto-resume failed for check ${id}:`, e);
        }
    }
    if (expired.length > 0) {
        console.log(`[BackupChecker] Auto-resumed ${expired.length} paused check(s)`);
    }
}
async function syncBackupEmails(triggeredBy = 'cron') {
    if (!(0, runtime_settings_1.isGraphConfigured)())
        throw new Error('Microsoft Graph API is not configured');
    checkPausedExpiry();
    const syncId = (0, sync_history_1.startSync)('backup', triggeredBy, 'backup_emails');
    try {
        const result = await _syncBackupEmailsInternal();
        (0, sync_history_1.completeSync)(syncId, result.newResults, result.checked);
        return result;
    }
    catch (e) {
        (0, sync_history_1.failSync)(syncId, e.message);
        throw e;
    }
}
async function _syncBackupEmailsInternal() {
    if (!(0, runtime_settings_1.isGraphConfigured)())
        throw new Error('Microsoft Graph API is not configured');
    const db = (0, db_1.getDb)();
    const accounts = getAllBackupAccounts();
    if (accounts.length === 0)
        return { checked: 0, newResults: 0 };
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
        if (accountChecks.length === 0)
            continue;
        // TODO: Datumsfilter wieder aktivieren sobald Tests abgeschlossen
        // const maxIntervalDays = Math.min(
        //   Math.max(...accountChecks.map(c => c.intervalHours)) / 24 + 1,
        //   7,
        // );
        const maxIntervalDays = 365; // TEST: kein Datumsfilter, alle E-Mails abrufen
        const emails = await (0, graph_mail_1.fetchEmailsFromSender)(account.fromEmail, Math.ceil(maxIntervalDays));
        const transaction = db.transaction(() => {
            for (const email of emails) {
                for (const check of accountChecks) {
                    if (!matchesCheck(email.subject, email.bodyPreview, check))
                        continue;
                    const status = detectEmailStatus(email.subject, email.bodyPreview);
                    const info = insertResult.run(check.id, email.id, email.receivedAt, email.subject, status, now);
                    if (info.changes > 0)
                        newResults++;
                }
            }
        });
        transaction();
    }
    return { checked: allChecks.length, newResults };
}
function getAllBackupAccounts() {
    const db = (0, db_1.getDb)();
    return db.prepare(`
    SELECT ba.id, ba.customer_id as customerId, c.name as customerName,
           ba.from_email as fromEmail, ba.name
    FROM backup_accounts ba
    JOIN customers c ON ba.customer_id = c.id
    ORDER BY c.name
  `).all();
}
function getAllBackupChecks() {
    const db = (0, db_1.getDb)();
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
  `).all();
}
function getBackupDashboardData() {
    const db = (0, db_1.getDb)();
    const checks = getAllBackupChecks().filter(c => c.active);
    const statusList = checks.map(check => {
        const lastResult = db.prepare(`
      SELECT id, check_id as checkId, received_at as receivedAt, subject, status
      FROM backup_check_results WHERE check_id = ?
      ORDER BY received_at DESC LIMIT 1
    `).get(check.id);
        const SLOT_COUNT = 10;
        const slotMs = check.intervalHours * 3_600_000;
        const recentResults = [];
        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotEnd = new Date(Date.now() - i * slotMs).toISOString();
            const slotStart = new Date(Date.now() - (i + 1) * slotMs).toISOString();
            const hit = db.prepare(`
        SELECT status FROM backup_check_results
        WHERE check_id = ? AND received_at >= ? AND received_at < ?
        ORDER BY received_at DESC LIMIT 1
      `).get(check.id, slotStart, slotEnd);
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
    const groupMap = new Map();
    for (const item of statusList) {
        if (!groupMap.has(item.customerId)) {
            groupMap.set(item.customerId, {
                customerId: item.customerId,
                customerName: item.customerName,
                fromEmail: item.fromEmail,
                checks: [],
            });
        }
        groupMap.get(item.customerId).checks.push(item);
    }
    return Array.from(groupMap.values()).sort((a, b) => a.customerName.localeCompare(b.customerName, 'de'));
}
