import { Router } from 'express';
import { getDb } from '../db';
import { getAllProducts, getLatestVersion } from '../services/products';
import { compareVersions } from '../services/comparator';
import {
  getAllBackupChecks,
} from '../services/backup-checker';
import type { BackupStatus, BackupCheck, BackupCheckStatus } from '../services/backup-checker';

const router = Router();

type UpdateStatus = 'up-to-date' | 'update-available' | 'major-update' | 'unknown';

interface CustomerSummary {
  id: number;
  name: string;
  totalDevices: number;
  outdatedDevices: number;
  backupStatus: BackupStatus | 'none';
}

interface DeviceDetail {
  id: number;
  name: string;
  hostname?: string;
  source: 'ninjaone' | 'unifi' | 'sophos';
  currentVersion: string;
  latestVersion?: string;
  status: UpdateStatus;
}

interface ProductGroup {
  productId: string;
  productName: string;
  latestVersion: string;
  releaseUrl: string;
  devices: DeviceDetail[];
}

interface CustomerDetail {
  id: number;
  name: string;
  products: ProductGroup[];
  backup: BackupCheckStatus[];
}

function computeBackupStatus(check: BackupCheck, db: ReturnType<typeof getDb>): BackupStatus {
  const lastResult = db.prepare(`
    SELECT id, check_id as checkId, received_at as receivedAt, subject, status
    FROM backup_check_results WHERE check_id = ?
    ORDER BY received_at DESC LIMIT 1
  `).get(check.id) as { receivedAt: string; status: 'success' | 'failed' } | undefined;

  if (!lastResult) return 'unknown';
  const ageHours = (Date.now() - new Date(lastResult.receivedAt).getTime()) / 3_600_000;
  if (ageHours > check.intervalHours + check.graceHours) return 'missed';
  return lastResult.status;
}

function worstBackupStatus(statuses: BackupStatus[]): BackupStatus {
  if (statuses.includes('failed')) return 'failed';
  if (statuses.includes('missed')) return 'missed';
  if (statuses.includes('unknown')) return 'unknown';
  if (statuses.includes('success')) return 'success';
  return 'unknown';
}

// GET /api/customers — list all customers with summary
router.get('/customers', (_req, res) => {
  const db = getDb();

  const customers = db
    .prepare('SELECT id, name FROM customers ORDER BY name')
    .all() as Array<{ id: number; name: string }>;

  const products = getAllProducts();
  const backupChecks = getAllBackupChecks().filter(c => c.active);

  const result: CustomerSummary[] = customers.map(customer => {
    let totalDevices = 0;
    let outdatedDevices = 0;

    for (const product of products) {
      const latest = getLatestVersion(product.id);
      const latestVersion = latest?.version || '';

      const ninjaRows = db.prepare(`
        SELECT nd.current_version as currentVersion
        FROM ninjaone_devices nd
        JOIN ninjaone_customers nc ON nd.ninjaone_customer_id = nc.id
        WHERE nc.customer_id = ? AND nd.product_id = ?
      `).all(customer.id, product.id) as Array<{ currentVersion: string }>;

      const unifiRows = db.prepare(`
        SELECT ud.current_version as currentVersion
        FROM unifi_devices ud
        JOIN unifi_customers uc ON ud.unifi_customer_id = uc.id
        WHERE uc.customer_id = ? AND ud.product_id = ?
      `).all(customer.id, product.id) as Array<{ currentVersion: string }>;

      const sophosRows = db.prepare(`
        SELECT sd.current_version as currentVersion
        FROM sophos_devices sd
        JOIN sophos_customers sc ON sd.sophos_customer_id = sc.id
        WHERE sc.customer_id = ? AND sd.product_id = ?
      `).all(customer.id, product.id) as Array<{ currentVersion: string }>;

      const allDevices = [...ninjaRows, ...unifiRows, ...sophosRows];
      totalDevices += allDevices.length;

      for (const device of allDevices) {
        if (!latestVersion) continue;
        const cmp = compareVersions(device.currentVersion, latestVersion, product.id);
        if (cmp.status === 'update-available' || cmp.status === 'major-update') {
          outdatedDevices++;
        }
      }
    }

    const customerChecks = backupChecks.filter(c => c.customerId === customer.id);
    const backupStatuses = customerChecks.map(c => computeBackupStatus(c, db));
    const backupStatus: BackupStatus | 'none' = customerChecks.length === 0
      ? 'none'
      : worstBackupStatus(backupStatuses);

    return { id: customer.id, name: customer.name, totalDevices, outdatedDevices, backupStatus };
  });

  res.json(result);
});

// GET /api/customers/:id — full detail for one customer
router.get('/customers/:id', (req, res) => {
  const db = getDb();
  const customerId = parseInt(req.params.id);
  if (!Number.isFinite(customerId)) {
    res.status(400).json({ error: 'Invalid customer id' });
    return;
  }

  const customer = db
    .prepare('SELECT id, name FROM customers WHERE id = ?')
    .get(customerId) as { id: number; name: string } | undefined;

  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const products = getAllProducts();
  const productGroups: ProductGroup[] = [];

  for (const product of products) {
    const latest = getLatestVersion(product.id);
    const latestVersion = latest?.version || '';

    const ninjaRows = db.prepare(`
      SELECT nd.id, nd.name, nd.current_version as currentVersion
      FROM ninjaone_devices nd
      JOIN ninjaone_customers nc ON nd.ninjaone_customer_id = nc.id
      WHERE nc.customer_id = ? AND nd.product_id = ?
      ORDER BY nd.name
    `).all(customerId, product.id) as Array<{ id: number; name: string; currentVersion: string }>;

    const unifiRows = db.prepare(`
      SELECT ud.id, ud.name, ud.current_version as currentVersion
      FROM unifi_devices ud
      JOIN unifi_customers uc ON ud.unifi_customer_id = uc.id
      WHERE uc.customer_id = ? AND ud.product_id = ?
      ORDER BY ud.name
    `).all(customerId, product.id) as Array<{ id: number; name: string; currentVersion: string }>;

    const sophosRows = db.prepare(`
      SELECT sd.id, sd.name, sd.hostname, sd.current_version as currentVersion
      FROM sophos_devices sd
      JOIN sophos_customers sc ON sd.sophos_customer_id = sc.id
      WHERE sc.customer_id = ? AND sd.product_id = ?
      ORDER BY sd.name
    `).all(customerId, product.id) as Array<{ id: number; name: string; hostname: string; currentVersion: string }>;

    const devices: DeviceDetail[] = [
      ...ninjaRows.map(d => ({
        ...d,
        source: 'ninjaone' as const,
        latestVersion: latestVersion || undefined,
        status: (latestVersion
          ? compareVersions(d.currentVersion, latestVersion, product.id).status
          : 'unknown') as UpdateStatus,
      })),
      ...unifiRows.map(d => ({
        ...d,
        source: 'unifi' as const,
        latestVersion: latestVersion || undefined,
        status: (latestVersion
          ? compareVersions(d.currentVersion, latestVersion, product.id).status
          : 'unknown') as UpdateStatus,
      })),
      ...sophosRows.map(d => ({
        ...d,
        source: 'sophos' as const,
        latestVersion: latestVersion || undefined,
        status: (latestVersion
          ? compareVersions(d.currentVersion, latestVersion, product.id).status
          : 'unknown') as UpdateStatus,
      })),
    ];

    if (devices.length > 0) {
      productGroups.push({
        productId: product.id,
        productName: product.name,
        latestVersion,
        releaseUrl: latest?.releaseUrl || '',
        devices,
      });
    }
  }

  // Backup checks for this customer with current status + recent history
  const backupChecks = getAllBackupChecks().filter(c => c.active && c.customerId === customerId);
  const SLOT_COUNT = 10;

  const backup: BackupCheckStatus[] = backupChecks.map(check => {
    const lastResult = db.prepare(`
      SELECT id, check_id as checkId, received_at as receivedAt, subject, status
      FROM backup_check_results WHERE check_id = ?
      ORDER BY received_at DESC LIMIT 1
    `).get(check.id) as { receivedAt: string; status: 'success' | 'failed' } | undefined;

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

    const currentStatus = computeBackupStatus(check, db);

    return {
      ...check,
      currentStatus,
      lastReceivedAt: lastResult?.receivedAt ?? null,
      lastEmailStatus: lastResult?.status ?? null,
      recentResults,
    };
  });

  const detail: CustomerDetail = {
    id: customer.id,
    name: customer.name,
    products: productGroups,
    backup,
  };

  res.json(detail);
});

// GET /api/sophos/overview — all customers with Sophos firewalls + update status
router.get('/sophos/overview', (_req, res) => {
  const db = getDb();

  const latest = getLatestVersion('sophos-firewall');
  const latestVersion = latest?.version || '';
  const releaseUrl = latest?.releaseUrl || '';

  const tenants = db.prepare(`
    SELECT sc.id, sc.sophos_customer_id as tenantId, sc.name as tenantName,
           c.id as customerId, c.name as customerName
    FROM sophos_customers sc
    JOIN customers c ON sc.customer_id = c.id
    ORDER BY c.name
  `).all() as Array<{ id: number; tenantId: string; tenantName: string; customerId: number; customerName: string }>;

  const result = tenants.map(t => {
    const firewalls = (db.prepare(`
      SELECT id, name, hostname, current_version as currentVersion
      FROM sophos_devices
      WHERE sophos_customer_id = ?
      ORDER BY name
    `).all(t.id) as Array<{ id: number; name: string; hostname: string; currentVersion: string }>).map(fw => ({
      ...fw,
      latestVersion: latestVersion || undefined,
      status: (latestVersion
        ? compareVersions(fw.currentVersion, latestVersion, 'sophos-firewall').status
        : 'unknown') as UpdateStatus,
    }));

    const alerts = db.prepare(`
      SELECT alert_id as alertId, category, description, severity, type, product, raised_at as raisedAt
      FROM sophos_alerts
      WHERE sophos_customer_id = ?
      ORDER BY raised_at DESC
    `).all(t.id) as Array<{
      alertId: string; category: string; description: string;
      severity: string; type: string; product: string; raisedAt: string;
    }>;

    return {
      customerId: t.customerId,
      customerName: t.customerName,
      tenantId: t.tenantId,
      latestVersion,
      releaseUrl,
      firewalls,
      alerts,
    };
  });

  res.json(result);
});

export default router;
