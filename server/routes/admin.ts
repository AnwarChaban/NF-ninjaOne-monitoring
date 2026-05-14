import { Router } from 'express';
import { getDb } from '../db';
import { 
  getAllProducts, 
  getProduct, 
  createProduct, 
  updateProduct,
  getLatestVersion,
  storeProductVersion
} from '../services/products';
import { 
  getAllCustomersWithAccounts, 
  getCustomerWithDevices 
} from '../services/customers';
import { isNinjaOneConfigured, isUnifiConfigured } from '../services/runtime-settings';
import { syncNinjaOneData } from '../services/ninjaone';
import { syncUnifiData } from '../services/unifi';

const router = Router();

// --- Products ---

router.get('/admin/products', (_req, res) => {
  const products = getAllProducts();
  const result = products.map(p => {
    const latest = getLatestVersion(p.id);
    return {
      id: p.id,
      name: p.name,
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

  const existing = getProduct(id);
  if (existing) {
    res.status(409).json({ error: 'Product already exists' });
    return;
  }

  createProduct(id, name, type || 'custom');
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
  const customers = getAllCustomersWithAccounts();
  res.json(customers);
});

router.get('/admin/customers/:id', (req, res) => {
  const customer = getCustomerWithDevices(parseInt(req.params.id));
  if (!customer) {
    res.status(404).json({ error: 'Customer not found' });
    return;
  }
  res.json(customer);
});

router.post('/admin/customers', (req, res) => {
  const db = getDb();
  const { name } = req.body as { name?: string };

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO customers (name, created_at, updated_at) VALUES (?, ?, ?)').run(name, now, now);

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
  const customerId = parseInt(req.params.id);

  // Cascade delete via foreign keys
  db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);

  res.json({ ok: true });
});

// --- NinjaOne Accounts ---

router.post('/admin/customers/:id/ninjaone', (req, res) => {
  const db = getDb();
  const { ninjaOrgId, name } = req.body as { ninjaOrgId?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!ninjaOrgId || !name) {
    res.status(400).json({ error: 'ninjaOrgId and name are required' });
    return;
  }

  // Check customer exists
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
  } catch (error) {
    res.status(409).json({ error: 'NinjaOne account already exists for this customer' });
  }
});

// --- Unifi Accounts ---

router.post('/admin/customers/:id/unifi', (req, res) => {
  const db = getDb();
  const { unifiCustomerId, name } = req.body as { unifiCustomerId?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!unifiCustomerId || !name) {
    res.status(400).json({ error: 'unifiCustomerId and name are required' });
    return;
  }

  // Check customer exists
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
  } catch (error) {
    res.status(409).json({ error: 'Unifi account already exists for this customer' });
  }
});

// --- Sophos Accounts ---

router.post('/admin/customers/:id/sophos', (req, res) => {
  const db = getDb();
  const { sophosCustomerId, name } = req.body as { sophosCustomerId?: string; name?: string };
  const customerId = parseInt(req.params.id);

  if (!sophosCustomerId || !name) {
    res.status(400).json({ error: 'sophosCustomerId and name are required' });
    return;
  }

  // Check customer exists
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
  } catch (error) {
    res.status(409).json({ error: 'Sophos account already exists for this customer' });
  }
});

// --- Sync endpoints ---

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

export default router;
