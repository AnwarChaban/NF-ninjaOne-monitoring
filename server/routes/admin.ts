import { Router } from 'express';
import { getDb } from '../db';
import {
  getProduct,
  createProduct,
  updateProduct,
  getLatestVersion,
  storeProductVersion,
} from '../services/products';
import { isNinjaOneConfigured, isUnifiConfigured, isSophosConfigured } from '../services/runtime-settings';
import { syncNinjaOneData, fetchNinjaOneBackups } from '../services/ninjaone';
import { syncUnifiData } from '../services/unifi';
import { syncSophosData, syncSophosAlerts, fetchTenantsFromApi } from '../services/sophos';
import { productNames } from '../services/version-fetcher';
import { compareVersions } from '../services/comparator';
import { requireAuth, requireRole } from '../middleware/auth';
import { logAction } from '../services/audit';

const router = Router();

// All routes in this file start with /admin — scope auth to that prefix only
router.use('/admin', requireAuth, requireRole('administrator'));

// Device IDs are namespaced by source to avoid collisions across tables
const UNIFI_ID_OFFSET = 1_000_000;
const SOPHOS_ID_OFFSET = 2_000_000;

function extractNinjaDeviceId(externalDeviceId: string | null): number | undefined {
  if (!externalDeviceId) return undefined;
  const match = externalDeviceId.match(/^ninja-(\d+)$/);
  return match ? parseInt(match[1]) : undefined;
}

function toIntOrUndefined(value: unknown): number | undefined {
  const n = parseInt(String(value ?? ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

// --- Scraper Products ---

router.get('/admin/scraper-products', (_req, res) => {
  const db = getDb();
  const products = db
    .prepare("SELECT id, name, active FROM products WHERE type = 'scraped' ORDER BY name")
    .all() as Array<{ id: string; name: string; active: number }>;

  res.json(products.map(p => {
    const latest = getLatestVersion(p.id);
    return {
      product: p.id,
      name: productNames[p.id] || p.name,
      active: p.active === 1,
      latestVersion: latest?.version || '',
      releaseUrl: latest?.releaseUrl || '',
    };
  }));
});

router.put('/admin/scraper-products/:id', (req, res) => {
  const { active, name, latestVersion, releaseUrl } = req.body as {
    active?: boolean; name?: string; latestVersion?: string; releaseUrl?: string;
  };
  const existing = getProduct(req.params.id);

  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  updateProduct(req.params.id, {
    ...(active !== undefined && { active: active ? 1 : 0 }),
    ...(name !== undefined && { name }),
  });

  if (latestVersion) {
    storeProductVersion(req.params.id, latestVersion, 'scraped', releaseUrl);
  }

  logAction(req.user!, 'product.update', 'product', req.params.id, name ?? req.params.id, { active, latestVersion }, req);
  res.json({ ok: true });
});

// --- Custom Products ---

router.get('/admin/custom-products', (_req, res) => {
  const db = getDb();
  const products = db
    .prepare("SELECT id, name, active, created_at as createdAt FROM products WHERE type = 'custom' ORDER BY name")
    .all() as Array<{ id: string; name: string; active: number; createdAt: string }>;

  const result = products.map(p => {
    const latest = getLatestVersion(p.id);
    return {
      id: p.id,
      name: p.name,
      active: p.active === 1,
      latestVersion: latest?.version || '',
      releaseUrl: latest?.releaseUrl || '',
      createdAt: p.createdAt,
      updatedAt: latest?.checkedAt || p.createdAt,
    };
  });

  res.json(result);
});

router.post('/admin/custom-products', (req, res) => {
  const { id, name, latestVersion, releaseUrl } = req.body as {
    id?: string; name?: string; latestVersion?: string; releaseUrl?: string;
  };

  if (!id || !name || !latestVersion) {
    res.status(400).json({ error: 'id, name and latestVersion are required' });
    return;
  }

  if (getProduct(id)) {
    res.status(409).json({ error: 'Product already exists' });
    return;
  }

  createProduct(id, name, 'custom');
  storeProductVersion(id, latestVersion, 'scraped', releaseUrl);
  logAction(req.user!, 'product.create', 'product', id, name, { latestVersion }, req);
  res.json({ ok: true });
});

router.put('/admin/custom-products/:id', (req, res) => {
  const { name, latestVersion, releaseUrl, active } = req.body as {
    name?: string; latestVersion?: string; releaseUrl?: string; active?: boolean;
  };
  const existing = getProduct(req.params.id);

  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  updateProduct(req.params.id, {
    name: name ?? existing.name,
    active: active !== undefined ? (active ? 1 : 0) : existing.active,
  });

  if (latestVersion) {
    storeProductVersion(req.params.id, latestVersion, 'scraped', releaseUrl);
  }

  logAction(req.user!, 'product.update', 'product', req.params.id, name ?? existing.name, { active, latestVersion }, req);
  res.json({ ok: true });
});

router.delete('/admin/custom-products/:id', (req, res) => {
  const db = getDb();
  const existing = getProduct(req.params.id);

  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  logAction(req.user!, 'product.delete', 'product', req.params.id, existing.name, null, req);
  res.json({ ok: true });
});

// --- Products (generic, used by older admin endpoints) ---

router.get('/admin/products', (_req, res) => {
  const db = getDb();
  const products = db
    .prepare('SELECT id, name, type, active, created_at as createdAt FROM products ORDER BY name')
    .all() as Array<{ id: string; name: string; type: string; active: number; createdAt: string }>;

  const result = products.map(p => {
    const latest = getLatestVersion(p.id);
    return {
      id: p.id,
      name: productNames[p.id] || p.name,
      type: p.type,
      active: p.active === 1,
      latestVersion: latest?.version || '',
      checkedAt: latest?.checkedAt || '',
    };
  });

  res.json(result);
});

router.post('/admin/products', (req, res) => {
  const { id, name, type } = req.body as { id?: string; name?: string; type?: 'scraped' | 'custom' };
  if (!id || !name) {
    res.status(400).json({ error: 'id and name are required' });
    return;
  }

  if (getProduct(id)) {
    res.status(409).json({ error: 'Product already exists' });
    return;
  }

  createProduct(id, name, type || 'custom');
  logAction(req.user!, 'product.create', 'product', id, name, { type }, req);
  res.json({ ok: true });
});

router.delete('/admin/products/:id', (req, res) => {
  const db = getDb();
  const existing = getProduct(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  logAction(req.user!, 'product.delete', 'product', req.params.id, existing?.name ?? req.params.id, null, req);
  res.json({ ok: true });
});

router.put('/admin/products/:id', (req, res) => {
  const { name, active } = req.body as { name?: string; active?: boolean };
  const existing = getProduct(req.params.id);

  if (!existing) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  updateProduct(req.params.id, {
    name: name ?? existing.name,
    active: active !== undefined ? (active ? 1 : 0) : existing.active,
  });

  logAction(req.user!, 'product.update', 'product', req.params.id, name ?? existing.name, { active }, req);
  res.json({ ok: true });
});

// --- Customers ---

router.get('/admin/customers', (_req, res) => {
  const db = getDb();
  const customers = db
    .prepare('SELECT id, name FROM customers ORDER BY name')
    .all() as Array<{ id: number; name: string }>;

  const result = customers.map(customer => {
    const ninjaDevices = db.prepare(`
      SELECT nd.id, nd.name, nd.product_id as product, nd.current_version as currentVersion,
             nd.external_device_id as externalDeviceId, nc.ninja_org_id as ninjaOrgId
      FROM ninjaone_devices nd
      JOIN ninjaone_customers nc ON nd.ninjaone_customer_id = nc.id
      WHERE nc.customer_id = ?
    `).all(customer.id) as any[];

    const unifiDevices = db.prepare(`
      SELECT ud.id, ud.name, ud.product_id as product, ud.current_version as currentVersion
      FROM unifi_devices ud
      JOIN unifi_customers uc ON ud.unifi_customer_id = uc.id
      WHERE uc.customer_id = ?
    `).all(customer.id) as any[];

    const sophosDevices = db.prepare(`
      SELECT sd.id, sd.name, sd.product_id as product, sd.current_version as currentVersion
      FROM sophos_devices sd
      JOIN sophos_customers sc ON sd.sophos_customer_id = sc.id
      WHERE sc.customer_id = ?
    `).all(customer.id) as any[];

    const devices = [
      ...ninjaDevices.map((d: any) => ({
        id: d.id,
        name: d.name,
        product: d.product,
        currentVersion: d.currentVersion,
        orgId: toIntOrUndefined(d.ninjaOrgId),
        ninjaDeviceId: extractNinjaDeviceId(d.externalDeviceId),
      })),
      ...unifiDevices.map((d: any) => ({
        id: d.id + UNIFI_ID_OFFSET,
        name: d.name,
        product: d.product,
        currentVersion: d.currentVersion,
      })),
      ...sophosDevices.map((d: any) => ({
        id: d.id + SOPHOS_ID_OFFSET,
        name: d.name,
        product: d.product,
        currentVersion: d.currentVersion,
      })),
    ];

    return { id: customer.id, name: customer.name, devices };
  });

  res.json(result);
});

router.get('/admin/customers/:id', (req, res) => {
  const db = getDb();
  const customerId = parseInt(req.params.id);
  const customer = db
    .prepare('SELECT id, name FROM customers WHERE id = ?')
    .get(customerId) as { id: number; name: string } | undefined;

  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const ninjaOne = db
    .prepare('SELECT id, ninja_org_id as ninjaOrgId, name FROM ninjaone_customers WHERE customer_id = ?')
    .get(customerId) as any;

  const unifi = db
    .prepare('SELECT id, unifi_customer_id as unifiCustomerId, name FROM unifi_customers WHERE customer_id = ?')
    .get(customerId) as any;

  const sophos = db
    .prepare('SELECT id, sophos_customer_id as sophosCustomerId, name FROM sophos_customers WHERE customer_id = ?')
    .get(customerId) as any;

  res.json({ ...customer, ninjaOne: ninjaOne || null, unifi: unifi || null, sophos: sophos || null });
});

router.post('/admin/customers', (req, res) => {
  const db = getDb();
  const { name } = req.body as { name?: string };

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const now = new Date().toISOString();
  const result = db
    .prepare('INSERT INTO customers (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(name, now, now);

  logAction(req.user!, 'customer.create', 'customer', Number(result.lastInsertRowid), name, null, req);
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/admin/customers/:id', (req, res) => {
  const db = getDb();
  const { name } = req.body as { name?: string };
  const customerId = parseInt(req.params.id);

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE customers SET name = ?, updated_at = ? WHERE id = ?').run(name, now, customerId);
  logAction(req.user!, 'customer.update', 'customer', customerId, name, null, req);
  res.json({ ok: true });
});

router.delete('/admin/customers/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT name FROM customers WHERE id = ?').get(id) as { name: string } | undefined;
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  logAction(req.user!, 'customer.delete', 'customer', id, row?.name ?? String(id), null, req);
  res.json({ ok: true });
});

// --- Integration Accounts ---

router.post('/admin/customers/:id/ninjaone', (req, res) => {
  const db = getDb();
  const { ninjaOrgId, name } = req.body as { ninjaOrgId?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!ninjaOrgId || !name) {
    res.status(400).json({ error: 'ninjaOrgId and name are required' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = db
      .prepare('INSERT INTO ninjaone_customers (customer_id, ninja_org_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, ninjaOrgId, name, now, now);
    logAction(req.user!, 'integration.create', 'ninjaone', customerId, name, { ninjaOrgId }, req);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'NinjaOne account already exists for this customer' });
  }
});

router.post('/admin/customers/:id/unifi', (req, res) => {
  const db = getDb();
  const { unifiCustomerId, name } = req.body as { unifiCustomerId?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!unifiCustomerId || !name) {
    res.status(400).json({ error: 'unifiCustomerId and name are required' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = db
      .prepare('INSERT INTO unifi_customers (customer_id, unifi_customer_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, unifiCustomerId, name, now, now);
    logAction(req.user!, 'integration.create', 'unifi', customerId, name, { unifiCustomerId }, req);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'UniFi account already exists for this customer' });
  }
});

router.post('/admin/customers/:id/sophos', (req, res) => {
  const db = getDb();
  const { sophosCustomerId, name } = req.body as { sophosCustomerId?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!sophosCustomerId || !name) {
    res.status(400).json({ error: 'sophosCustomerId and name are required' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = db
      .prepare('INSERT INTO sophos_customers (customer_id, sophos_customer_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, sophosCustomerId, name, now, now);
    logAction(req.user!, 'integration.create', 'sophos', customerId, name, { sophosCustomerId }, req);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'Sophos account already exists for this customer' });
  }
});

// --- Devices ---

router.post('/admin/customers/:id/devices', (req, res) => {
  const db = getDb();
  const customerId = parseInt(req.params.id);
  const { name, product, currentVersion, ninjaDeviceId } = req.body as {
    name?: string; product?: string; currentVersion?: string; orgId?: number; ninjaDeviceId?: number;
  };

  if (!name || !product || !currentVersion) {
    res.status(400).json({ error: 'name, product and currentVersion are required' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  // Ensure product exists
  if (!getProduct(product)) {
    createProduct(product, productNames[product] || product, 'scraped');
  }

  const now = new Date().toISOString();
  const manualOrgId = `MANUAL-${customerId}`;

  // Get or create ninjaone_customer for manual entries
  let ninjaOneCustomer = db
    .prepare('SELECT id FROM ninjaone_customers WHERE customer_id = ? AND ninja_org_id = ?')
    .get(customerId, manualOrgId) as { id: number } | undefined;

  if (!ninjaOneCustomer) {
    const result = db
      .prepare('INSERT INTO ninjaone_customers (customer_id, ninja_org_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, manualOrgId, `Manuell`, now, now);
    ninjaOneCustomer = { id: result.lastInsertRowid as number };
  }

  const externalDeviceId = ninjaDeviceId ? `ninja-${ninjaDeviceId}` : `manual-${Date.now()}`;
  const result = db
    .prepare('INSERT INTO ninjaone_devices (ninjaone_customer_id, product_id, external_device_id, name, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(ninjaOneCustomer.id, product, externalDeviceId, name, currentVersion, now, now);

  logAction(req.user!, 'device.create', 'device', Number(result.lastInsertRowid), name, { product, currentVersion, customerId }, req);
  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/admin/devices/:id', (req, res) => {
  const db = getDb();
  const encodedId = parseInt(req.params.id);
  const { name, product, currentVersion } = req.body as {
    name?: string; product?: string; currentVersion?: string;
  };

  const now = new Date().toISOString();

  const source = encodedId >= SOPHOS_ID_OFFSET ? 'sophos' : encodedId >= UNIFI_ID_OFFSET ? 'unifi' : 'ninjaone';
  if (encodedId >= SOPHOS_ID_OFFSET) {
    const rawId = encodedId - SOPHOS_ID_OFFSET;
    db.prepare('UPDATE sophos_devices SET name = COALESCE(?, name), product_id = COALESCE(?, product_id), current_version = COALESCE(?, current_version), updated_at = ? WHERE id = ?')
      .run(name ?? null, product ?? null, currentVersion ?? null, now, rawId);
  } else if (encodedId >= UNIFI_ID_OFFSET) {
    const rawId = encodedId - UNIFI_ID_OFFSET;
    db.prepare('UPDATE unifi_devices SET name = COALESCE(?, name), product_id = COALESCE(?, product_id), current_version = COALESCE(?, current_version), updated_at = ? WHERE id = ?')
      .run(name ?? null, product ?? null, currentVersion ?? null, now, rawId);
  } else {
    db.prepare('UPDATE ninjaone_devices SET name = COALESCE(?, name), product_id = COALESCE(?, product_id), current_version = COALESCE(?, current_version), updated_at = ? WHERE id = ?')
      .run(name ?? null, product ?? null, currentVersion ?? null, now, encodedId);
  }

  logAction(req.user!, 'device.update', 'device', encodedId, name ?? String(encodedId), { source, product, currentVersion }, req);
  res.json({ ok: true });
});

router.delete('/admin/devices/:id', (req, res) => {
  const db = getDb();
  const encodedId = parseInt(req.params.id);
  const source = encodedId >= SOPHOS_ID_OFFSET ? 'sophos' : encodedId >= UNIFI_ID_OFFSET ? 'unifi' : 'ninjaone';

  if (encodedId >= SOPHOS_ID_OFFSET) {
    db.prepare('DELETE FROM sophos_devices WHERE id = ?').run(encodedId - SOPHOS_ID_OFFSET);
  } else if (encodedId >= UNIFI_ID_OFFSET) {
    db.prepare('DELETE FROM unifi_devices WHERE id = ?').run(encodedId - UNIFI_ID_OFFSET);
  } else {
    db.prepare('DELETE FROM ninjaone_devices WHERE id = ?').run(encodedId);
  }

  logAction(req.user!, 'device.delete', 'device', encodedId, String(encodedId), { source }, req);
  res.json({ ok: true });
});

// --- Backup Accounts ---

router.post('/admin/customers/:id/backup', (req, res) => {
  const db = getDb();
  const { fromEmail, name } = req.body as { fromEmail?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!fromEmail || !name) {
    res.status(400).json({ error: 'fromEmail and name are required' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = db
      .prepare('INSERT INTO backup_accounts (customer_id, from_email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, fromEmail, name, now, now);
    logAction(req.user!, 'backup_account.create', 'backup_account', customerId, name, { fromEmail }, req);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'Backup account already exists for this customer' });
  }
});

router.delete('/admin/customers/:id/backup', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT name FROM backup_accounts WHERE customer_id = ?').get(id) as { name: string } | undefined;
  db.prepare('DELETE FROM backup_accounts WHERE customer_id = ?').run(id);
  logAction(req.user!, 'backup_account.delete', 'backup_account', id, row?.name ?? String(id), null, req);
  res.json({ ok: true });
});

// --- NinjaOne Sync ---

router.post('/admin/ninjaone/sync', async (req, res) => {
  if (!isNinjaOneConfigured()) {
    res.status(400).json({ error: 'NinjaOne is not configured' });
    return;
  }
  try {
    const result = await syncNinjaOneData(`manual:${req.user?.username}`);
    logAction(req.user!, 'sync.manual', 'integration', 'ninjaone', 'NinjaOne', result, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- UniFi Sync ---

router.post('/admin/unifi/sync', async (req, res) => {
  if (!isUnifiConfigured()) {
    res.status(400).json({ error: 'UniFi is not configured' });
    return;
  }
  try {
    const result = await syncUnifiData(`manual:${req.user?.username}`);
    logAction(req.user!, 'sync.manual', 'integration', 'unifi', 'UniFi', result, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Sophos Tenants ---

router.get('/admin/sophos/tenants', (_req, res) => {
  const db = getDb();
  const tenants = db.prepare(`
    SELECT sc.id, sc.customer_id as customerId, sc.sophos_customer_id as tenantId,
           sc.name, c.name as customerName
    FROM sophos_customers sc
    JOIN customers c ON sc.customer_id = c.id
    ORDER BY c.name
  `).all() as Array<{ id: number; customerId: number; tenantId: string; name: string; customerName: string }>;

  const result = tenants.map(t => {
    const devices = db.prepare(`
      SELECT id, name, hostname, current_version as currentVersion
      FROM sophos_devices
      WHERE sophos_customer_id = ?
      ORDER BY name
    `).all(t.id) as Array<{ id: number; name: string; hostname: string; currentVersion: string }>;
    return { ...t, devices };
  });

  res.json(result);
});

router.delete('/admin/customers/:id/sophos', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT name FROM sophos_customers WHERE customer_id = ?').get(id) as { name: string } | undefined;
  db.prepare('DELETE FROM sophos_customers WHERE customer_id = ?').run(id);
  logAction(req.user!, 'integration.delete', 'sophos', id, row?.name ?? String(id), null, req);
  res.json({ ok: true });
});

router.get('/admin/sophos/unmatched-tenants', (_req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, tenant_id as tenantId, tenant_name as tenantName, synced_at as syncedAt
    FROM sophos_unmatched_tenants
    ORDER BY tenant_name
  `).all();
  res.json(rows);
});

router.post('/admin/sophos/assign-tenant', (req, res) => {
  const db = getDb();
  const { customerId, tenantId, tenantName } = req.body as {
    customerId?: number; tenantId?: string; tenantName?: string;
  };

  if (!customerId || !tenantId || !tenantName) {
    res.status(400).json({ error: 'customerId, tenantId und tenantName sind erforderlich' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Kunde nicht gefunden' });
    return;
  }

  const now = new Date().toISOString();
  try {
    db.prepare('INSERT INTO sophos_customers (customer_id, sophos_customer_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(customerId, tenantId, tenantName, now, now);
    db.prepare('DELETE FROM sophos_unmatched_tenants WHERE tenant_id = ?').run(tenantId);
    logAction(req.user!, 'integration.create', 'sophos', customerId, tenantName, { tenantId }, req);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Tenant oder Kunde bereits verknüpft' });
  }
});

router.get('/admin/sophos/api-tenants', async (_req, res) => {
  if (!isSophosConfigured()) {
    res.status(400).json({ error: 'Sophos ist nicht konfiguriert' });
    return;
  }
  try {
    const tenants = await fetchTenantsFromApi();
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- Sophos Sync ---

router.post('/admin/sophos/sync', async (req, res) => {
  if (!isSophosConfigured()) {
    res.status(400).json({ error: 'Sophos ist nicht konfiguriert' });
    return;
  }
  try {
    const result = await syncSophosData(`manual:${req.user?.username}`);
    const alertResult = await syncSophosAlerts().catch(err => {
      console.error('[Sophos] Alert sync failed after device sync:', err);
      return { total: 0 };
    });
    logAction(req.user!, 'sync.manual', 'integration', 'sophos', 'Sophos', { ...result, alerts: alertResult.total }, req);
    res.json({ ok: true, ...result, alerts: alertResult.total });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/admin/sophos/sync-alerts', async (req, res) => {
  if (!isSophosConfigured()) {
    res.status(400).json({ error: 'Sophos ist nicht konfiguriert' });
    return;
  }
  try {
    const result = await syncSophosAlerts();
    logAction(req.user!, 'sync.manual', 'integration', 'sophos_alerts', 'Sophos Alerts', result, req);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- UniFi Mappings ---

type UnifiCustomerResult = {
  id: number;
  customerId: number;
  unifiCustomerId: string;
  hostName: string;
  customerName: string;
  pendingSync: boolean;
  devices: Array<{ id: number; name: string; productId: string; currentVersion: string; latestVersion: string; status: string }>;
};

router.get('/admin/unifi/customers', (_req, res) => {
  const db = getDb();

  // Customers that were matched during the last sync
  const synced = db.prepare(`
    SELECT uc.id, uc.customer_id as customerId, uc.unifi_customer_id as unifiCustomerId,
           uc.name as hostName, c.name as customerName
    FROM unifi_customers uc
    JOIN customers c ON uc.customer_id = c.id
    ORDER BY c.name
  `).all() as Array<{ id: number; customerId: number; unifiCustomerId: string; hostName: string; customerName: string }>;

  const syncedCustomerIds = new Set(synced.map(s => s.customerId));

  const result: UnifiCustomerResult[] = synced.map(uc => {
    const devices = db.prepare(`
      SELECT id, name, product_id as productId, current_version as currentVersion
      FROM unifi_devices
      WHERE unifi_customer_id = ?
      ORDER BY name
    `).all(uc.id) as Array<{ id: number; name: string; productId: string; currentVersion: string }>;

    const devicesWithStatus = devices.map(d => {
      const latest = getLatestVersion(d.productId);
      const latestVersion = latest?.version ?? '';
      const status = latestVersion ? compareVersions(d.currentVersion, latestVersion, d.productId).status : 'unknown';
      return { ...d, latestVersion, status };
    });

    return { ...uc, pendingSync: false, devices: devicesWithStatus };
  });

  // Customers that have a manual mapping but are not yet in unifi_customers (pending sync)
  const pendingMapped = db.prepare(`
    SELECT DISTINCT c.id as customerId, c.name as customerName,
           GROUP_CONCAT(ucm.match_text, '|||') as mappingTexts
    FROM unifi_customer_mappings ucm
    JOIN customers c ON ucm.customer_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all() as Array<{ customerId: number; customerName: string; mappingTexts: string }>;

  for (const p of pendingMapped) {
    if (!syncedCustomerIds.has(p.customerId)) {
      result.push({
        id: -1,
        customerId: p.customerId,
        unifiCustomerId: '',
        hostName: p.mappingTexts,
        customerName: p.customerName,
        pendingSync: true,
        devices: [],
      });
    }
  }

  result.sort((a, b) => a.customerName.localeCompare(b.customerName));
  res.json(result);
});

router.get('/admin/unifi/mappings', (_req, res) => {
  const db = getDb();
  const mappings = db.prepare(`
    SELECT m.id, m.match_text as matchText, m.customer_id as customerId,
           c.name as customerName, m.created_at as createdAt
    FROM unifi_customer_mappings m
    JOIN customers c ON m.customer_id = c.id
    ORDER BY m.match_text
  `).all();
  res.json(mappings);
});

router.post('/admin/unifi/mappings', (req, res) => {
  const db = getDb();
  const { matchText, customerId } = req.body as { matchText?: string; customerId?: number };

  if (!matchText || !customerId) {
    res.status(400).json({ error: 'matchText and customerId are required' });
    return;
  }

  const customer = db.prepare('SELECT id FROM customers WHERE id = ?').get(customerId);
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }

  const now = new Date().toISOString();
  try {
    const result = db
      .prepare('INSERT INTO unifi_customer_mappings (match_text, customer_id, created_at) VALUES (?, ?, ?)')
      .run(matchText, customerId, now);
    db.prepare('DELETE FROM unifi_unmatched_hosts WHERE host_name = ?').run(matchText);
    logAction(req.user!, 'unifi_mapping.create', 'unifi_mapping', Number(result.lastInsertRowid), matchText, { customerId }, req);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (err) {
    const msg = (err as Error).message || '';
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      res.status(409).json({ error: 'Mapping for this match text already exists' });
    } else {
      console.error('[UniFi mapping] INSERT error:', msg);
      res.status(500).json({ error: `Mapping konnte nicht gespeichert werden: ${msg}` });
    }
  }
});

router.delete('/admin/unifi/mappings/:id', (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id);
  const row = db.prepare('SELECT match_text FROM unifi_customer_mappings WHERE id = ?').get(id) as { match_text: string } | undefined;
  db.prepare('DELETE FROM unifi_customer_mappings WHERE id = ?').run(id);
  logAction(req.user!, 'unifi_mapping.delete', 'unifi_mapping', id, row?.match_text ?? String(id), null, req);
  res.json({ ok: true });
});

// --- UniFi Unmatched Hosts ---

router.get('/admin/unifi/unmatched-hosts', (_req, res) => {
  const db = getDb();
  const hosts = db.prepare(`
    SELECT id, host_id as hostId, host_name as hostName, reason, synced_at as syncedAt
    FROM unifi_unmatched_hosts
    ORDER BY host_name
  `).all();
  res.json(hosts);
});

// --- NinjaOne Backups ---

router.get('/admin/ninjaone/backups', async (_req, res) => {
  try {
    const backups = await fetchNinjaOneBackups();
    res.json(backups);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
