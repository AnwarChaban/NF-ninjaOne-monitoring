import { Router } from 'express';
import { getDb } from '../db';
import {
  getProduct,
  createProduct,
  updateProduct,
  getLatestVersion,
  storeProductVersion,
} from '../services/products';
import { isNinjaOneConfigured, isUnifiConfigured } from '../services/runtime-settings';
import { syncNinjaOneData, fetchNinjaOneBackups } from '../services/ninjaone';
import { syncUnifiData } from '../services/unifi';
import { productNames } from '../services/version-fetcher';

const router = Router();

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
  res.json({ ok: true });
});

router.delete('/admin/products/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
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
  res.json({ ok: true });
});

router.delete('/admin/customers/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM customers WHERE id = ?').run(parseInt(req.params.id));
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

  res.json({ ok: true, id: result.lastInsertRowid });
});

router.put('/admin/devices/:id', (req, res) => {
  const db = getDb();
  const encodedId = parseInt(req.params.id);
  const { name, product, currentVersion } = req.body as {
    name?: string; product?: string; currentVersion?: string;
  };

  const now = new Date().toISOString();

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

  res.json({ ok: true });
});

router.delete('/admin/devices/:id', (req, res) => {
  const db = getDb();
  const encodedId = parseInt(req.params.id);

  if (encodedId >= SOPHOS_ID_OFFSET) {
    db.prepare('DELETE FROM sophos_devices WHERE id = ?').run(encodedId - SOPHOS_ID_OFFSET);
  } else if (encodedId >= UNIFI_ID_OFFSET) {
    db.prepare('DELETE FROM unifi_devices WHERE id = ?').run(encodedId - UNIFI_ID_OFFSET);
  } else {
    db.prepare('DELETE FROM ninjaone_devices WHERE id = ?').run(encodedId);
  }

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
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'Backup account already exists for this customer' });
  }
});

router.delete('/admin/customers/:id/backup', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM backup_accounts WHERE customer_id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// --- NinjaOne Sync ---

router.post('/admin/ninjaone/sync', async (_req, res) => {
  if (!isNinjaOneConfigured()) {
    res.status(400).json({ error: 'NinjaOne is not configured' });
    return;
  }

  try {
    const result = await syncNinjaOneData();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- UniFi Sync ---

router.post('/admin/unifi/sync', async (_req, res) => {
  if (!isUnifiConfigured()) {
    res.status(400).json({ error: 'UniFi is not configured' });
    return;
  }

  try {
    const result = await syncUnifiData();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// --- UniFi Mappings ---

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
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch {
    res.status(409).json({ error: 'Mapping for this match text already exists' });
  }
});

router.delete('/admin/unifi/mappings/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM unifi_customer_mappings WHERE id = ?').run(parseInt(req.params.id));
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
