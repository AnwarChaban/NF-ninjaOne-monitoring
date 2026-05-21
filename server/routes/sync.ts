import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { getAllLatestByTaskType, getSyncHistoryByTask } from '../services/sync-history';
import { syncNinjaOneCustomers, syncNinjaOneDevices, syncNinjaOneData } from '../services/ninjaone';
import { syncUnifiData } from '../services/unifi';
import { syncSophosData, syncSophosAlerts } from '../services/sophos';
import { syncBackupEmails } from '../services/backup-checker';
import { logAction } from '../services/audit';
import { getCronSchedule } from '../services/runtime-settings';
import type { TaskType } from '../services/sync-history';

const router = Router();

// Maps task_type → sub-label for display
const TASK_LABELS: Record<TaskType, string> = {
  ninjaone_customers: 'Kunden',
  ninjaone_devices:   'Geräte',
  unifi_customers:    'Kunden',
  unifi_devices:      'Geräte',
  sophos_customers:   'Kunden',
  sophos_devices:     'Geräte',
  sophos_alerts:      'Alerts',
  backup_emails:      'E-Mail',
};

function taskStatus(record: any, taskType: TaskType) {
  const base = {
    cronSchedule:    getCronSchedule(taskType),
    lastRun:         null as string | null,
    completedAt:     null as string | null,
    status:          'never' as string,
    devicesSynced:   0,
    customersSynced: 0,
    error:           null as string | null,
  };
  if (!record) return base;
  return {
    ...base,
    lastRun:         record.startedAt,
    completedAt:     record.completedAt,
    status:          record.status,
    devicesSynced:   record.devicesSynced,
    customersSynced: record.customersSynced,
    error:           record.errorMessage,
  };
}

// GET /api/sync/status — per-task cron schedules
router.get('/sync/status', requireAuth, requireRole('administrator'), (_req, res) => {
  const latest = getAllLatestByTaskType();

  res.json({
    ninjaone: {
      customers: taskStatus(latest['ninjaone_customers'], 'ninjaone_customers'),
      devices:   taskStatus(latest['ninjaone_devices'],   'ninjaone_devices'),
    },
    unifi: {
      customers: taskStatus(latest['unifi_customers'], 'unifi_customers'),
      devices:   taskStatus(latest['unifi_devices'],   'unifi_devices'),
    },
    sophos: {
      customers: taskStatus(latest['sophos_customers'], 'sophos_customers'),
      devices:   taskStatus(latest['sophos_devices'],   'sophos_devices'),
      alerts:    taskStatus(latest['sophos_alerts'],    'sophos_alerts'),
    },
    backup: {
      emails: taskStatus(latest['backup_emails'], 'backup_emails'),
    },
  });
});

// GET /api/sync/history/:integration/:taskType
router.get('/sync/history/:integration/:taskType', requireAuth, requireRole('administrator'), (req, res) => {
  const taskType = `${req.params['integration']}_${req.params['taskType']}` as TaskType;
  const valid = Object.keys(TASK_LABELS) as TaskType[];
  if (!valid.includes(taskType)) {
    res.status(400).json({ error: 'Invalid task type' });
    return;
  }
  res.json(getSyncHistoryByTask(taskType, 20));
});

// POST /api/sync/:integration/:taskType — manual trigger (admin only)
router.post('/sync/:integration/:taskType', requireAuth, requireRole('administrator'), async (req, res) => {
  const { integration, taskType } = req.params as { integration: string; taskType: string };
  const user = req.user!;
  const triggeredBy = `manual:${user.username}`;
  const fullTaskType = `${integration}_${taskType}` as TaskType;

  try {
    let result: Record<string, number>;

    switch (fullTaskType) {
      case 'ninjaone_customers': { const r = await syncNinjaOneCustomers(triggeredBy); result = r; break; }
      case 'ninjaone_devices':   { const r = await syncNinjaOneDevices(triggeredBy);   result = r; break; }
      case 'unifi_customers':
      case 'unifi_devices': {
        const r = await syncUnifiData(triggeredBy);
        result = { customers: r.customers, devices: r.devices };
        break;
      }
      case 'sophos_customers':
      case 'sophos_devices': {
        const r = await syncSophosData(triggeredBy);
        result = { tenants: r.tenants, devices: r.devices };
        break;
      }
      case 'sophos_alerts': {
        const r = await syncSophosAlerts(triggeredBy);
        result = { alerts: r.total };
        break;
      }
      case 'backup_emails': {
        const r = await syncBackupEmails(triggeredBy);
        result = { checked: r.checked, newResults: r.newResults };
        break;
      }
      default:
        res.status(400).json({ error: 'Invalid task type' });
        return;
    }

    logAction(user, 'sync_task_triggered_manual', 'integration', fullTaskType, fullTaskType, result, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /api/sync/:integration — full integration sync (backward compat)
router.post('/sync/:integration', requireAuth, requireRole('administrator'), async (req, res) => {
  const integration = req.params['integration'];
  const user = req.user!;
  const triggeredBy = `manual:${user.username}`;

  try {
    let result: Record<string, number>;

    switch (integration) {
      case 'ninjaone': { const r = await syncNinjaOneData(triggeredBy); result = r; break; }
      case 'unifi':    { const r = await syncUnifiData(triggeredBy); result = { customers: r.customers, devices: r.devices }; break; }
      case 'sophos': {
        const [r1, r2] = await Promise.all([syncSophosData(triggeredBy), syncSophosAlerts(triggeredBy)]);
        result = { tenants: r1.tenants, devices: r1.devices, alerts: r2.total };
        break;
      }
      case 'backup':   { const r = await syncBackupEmails(triggeredBy); result = { checked: r.checked, newResults: r.newResults }; break; }
      default:
        res.status(400).json({ error: 'Invalid integration' });
        return;
    }

    logAction(user, 'sync.manual', 'integration', integration, integration, result, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
