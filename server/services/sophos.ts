import { getDb } from '../db';
import { getSophosRuntimeConfig } from './runtime-settings';
import { startSync, completeSync, failSync } from './sync-history';

interface SophosTenant {
  id: string;
  name: string;
  apiHost?: string;
}

interface SophosFirewall {
  id: string;
  name?: string;
  hostname?: string;
  firmwareVersion?: string;
  model?: string;
  product?: {
    name?: string;
    version?: string;
    osVersion?: string;
  };
}

function extractVersion(fw: SophosFirewall): string {
  // model: 'XGS138_XN01_SFOS 22.0.0 GA-Build411' → '22.0 GA' or '22.0 MR1'
  // Preferred: model gives us the GA/MR suffix which is what the scraper also uses
  if (fw.model) {
    const m = fw.model.match(/SFOS\s+(\d+\.\d+)(?:\.\d+)?\s+(GA|MR\s*\d+)/i);
    if (m) {
      const suffix = m[2].trim().toUpperCase();
      return suffix === 'GA' ? `${m[1]} GA` : `${m[1]} ${m[2].trim()}`;
    }
  }
  // Fallback: firmwareVersion 'XGS138_XN01_22.0.0.411' → '22.0.0'
  if (fw.firmwareVersion) {
    const m = fw.firmwareVersion.match(/(\d+\.\d+\.\d+)/);
    if (m) return m[1];
  }
  return fw.product?.osVersion || fw.product?.version || '';
}

interface SophosAlert {
  id: string;
  category: string;
  description: string;
  severity: string;
  type: string;
  product: string;
  raisedAt: string;
}

const TENANTS_API_URL = 'https://api.central.sophos.com/partner/v1/tenants';
const FIREWALLS_API_URL = 'https://api-eu02.central.sophos.com/firewall/v1/firewalls';
const ALERTS_API_URL = 'https://api-eu02.central.sophos.com/common/v1/alerts';

async function getAccessToken(tokenUrl: string, clientId: string, clientSecret: string, scope: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sophos token request failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Sophos token response missing access_token');
  return data.access_token;
}

export async function fetchTenantsFromApi(): Promise<SophosTenant[]> {
  const cfg = getSophosRuntimeConfig();
  const token = await getAccessToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret, cfg.scope);

  const res = await fetch(TENANTS_API_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Partner-ID': cfg.partnerId,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sophos tenants request failed (${res.status}): ${text}`);
  }

  const data = await res.json() as { items?: SophosTenant[] };
  return data.items ?? [];
}

async function fetchAlerts(token: string, tenantId: string): Promise<SophosAlert[]> {
  const alerts: SophosAlert[] = [];
  let pageKey: string | undefined;

  do {
    const url = new URL(ALERTS_API_URL);
    url.searchParams.set('pageSize', '100');
    if (pageKey) url.searchParams.set('pageFromKey', pageKey);

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Tenant-ID': tenantId,
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Sophos alerts request failed for tenant ${tenantId} (${res.status}): ${text}`);
    }

    const data = await res.json() as { items?: SophosAlert[]; pages?: { nextKey?: string } };
    for (const item of data.items ?? []) {
      alerts.push(item);
    }
    pageKey = data.pages?.nextKey;
  } while (pageKey);

  return alerts;
}

async function fetchFirewalls(token: string, tenantId: string): Promise<SophosFirewall[]> {
  const res = await fetch(FIREWALLS_API_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Tenant-ID': tenantId,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sophos firewalls request failed for tenant ${tenantId} (${res.status}): ${text}`);
  }

  const data = await res.json() as { items?: SophosFirewall[] };
  return data.items ?? [];
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(['gmbh', 'mbh', 'ag', 'kg', 'ug', 'ohg', 'gbr', 'se', 'ltd', 'co', 'und', 'the']);

function tokenize(value: string): string[] {
  return normalizeName(value)
    .split(' ')
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function matchTenantToCustomer(
  tenantName: string,
  customers: Array<{ id: number; name: string }>
): { id: number; name: string } | undefined {
  const tenantNorm = normalizeName(tenantName);
  const tenantTokens = new Set(tokenize(tenantName));

  // Strict: one contains the other
  const strict = customers.filter(c => {
    const cn = normalizeName(c.name);
    return tenantNorm.includes(cn) || cn.includes(tenantNorm);
  });
  if (strict.length === 1) return strict[0];

  // Token-based scoring
  const scored = customers.map(c => {
    const ct = tokenize(c.name);
    const matches = ct.filter(t => tenantTokens.has(t)).length;
    return { customer: c, matches, total: ct.length };
  }).filter(s => s.matches > 0 && (s.matches >= 2 || (s.matches === 1 && s.total === 1)));

  if (scored.length === 1) return scored[0].customer;

  return undefined;
}

export async function syncSophosData(triggeredBy = 'cron'): Promise<{ tenants: number; devices: number; unmatched: number }> {
  const custId = startSync('sophos', triggeredBy, 'sophos_customers');
  const devId  = startSync('sophos', triggeredBy, 'sophos_devices');
  try {
    const result = await _syncSophosDataInternal();
    completeSync(custId, 0, result.tenants);
    completeSync(devId, result.devices);
    return result;
  } catch (e) {
    failSync(custId, (e as Error).message);
    failSync(devId,  (e as Error).message);
    throw e;
  }
}

async function _syncSophosDataInternal(): Promise<{ tenants: number; devices: number; unmatched: number }> {
  const cfg = getSophosRuntimeConfig();
  const db = getDb();
  const now = new Date().toISOString();

  const token = await getAccessToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret, cfg.scope);

  const res = await fetch(TENANTS_API_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Partner-ID': cfg.partnerId,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sophos tenants request failed (${res.status}): ${text}`);
  }
  const tenantData = await res.json() as { items?: SophosTenant[] };
  const tenants = tenantData.items ?? [];

  const customers = db
    .prepare('SELECT id, name FROM customers')
    .all() as Array<{ id: number; name: string }>;

  let syncedTenants = 0;
  let syncedDevices = 0;
  let unmatchedCount = 0;

  // Clear stale unmatched list before re-populating
  db.prepare('DELETE FROM sophos_unmatched_tenants').run();

  for (const tenant of tenants) {
    // Check if already linked
    let sophosCustomer = db
      .prepare('SELECT id FROM sophos_customers WHERE sophos_customer_id = ?')
      .get(tenant.id) as { id: number } | undefined;

    // Auto-match by name if not yet linked
    if (!sophosCustomer) {
      const match = matchTenantToCustomer(tenant.name, customers);
      if (match) {
        try {
          const result = db
            .prepare('INSERT INTO sophos_customers (customer_id, sophos_customer_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(match.id, tenant.id, tenant.name, now, now);
          sophosCustomer = { id: result.lastInsertRowid as number };
          console.log(`[Sophos] Auto-matched tenant "${tenant.name}" → customer "${match.name}"`);
        } catch {
          // Already exists (race condition), try to fetch
          sophosCustomer = db
            .prepare('SELECT id FROM sophos_customers WHERE sophos_customer_id = ?')
            .get(tenant.id) as { id: number } | undefined;
        }
      }
    }

    if (!sophosCustomer) {
      db.prepare('INSERT OR REPLACE INTO sophos_unmatched_tenants (tenant_id, tenant_name, synced_at) VALUES (?, ?, ?)')
        .run(tenant.id, tenant.name, now);
      unmatchedCount++;
      continue;
    }

    syncedTenants++;

    let firewalls: SophosFirewall[];
    try {
      firewalls = await fetchFirewalls(token, tenant.id);
    } catch (error) {
      console.error(`[Sophos] Failed to fetch firewalls for tenant ${tenant.id} (${tenant.name}):`, error);
      continue;
    }

    for (const fw of firewalls) {
      const name = fw.name || fw.id;
      const hostname = fw.hostname || '';
      const version = extractVersion(fw);

      if (!version) continue;

      const existing = db
        .prepare('SELECT id FROM sophos_devices WHERE sophos_customer_id = ? AND external_device_id = ?')
        .get(sophosCustomer.id, fw.id) as { id: number } | undefined;

      if (existing) {
        db.prepare('UPDATE sophos_devices SET name = ?, hostname = ?, current_version = ?, updated_at = ? WHERE id = ?')
          .run(name, hostname, version, now, existing.id);
      } else {
        db.prepare(
          'INSERT INTO sophos_devices (sophos_customer_id, product_id, external_device_id, name, hostname, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(sophosCustomer.id, 'sophos-firewall', fw.id, name, hostname, version, now, now);
      }

      syncedDevices++;
    }
  }

  console.log(`[Sophos] Sync complete. ${syncedTenants} tenant(s), ${syncedDevices} device(s), ${unmatchedCount} unmatched.`);
  return { tenants: syncedTenants, devices: syncedDevices, unmatched: unmatchedCount };
}

export async function syncSophosAlerts(triggeredBy = 'cron'): Promise<{ total: number }> {
  const syncId = startSync('sophos', triggeredBy, 'sophos_alerts');
  try {
    const result = await _syncSophosAlertsInternal();
    completeSync(syncId, result.total);
    return result;
  } catch (e) {
    failSync(syncId, (e as Error).message);
    throw e;
  }
}

async function _syncSophosAlertsInternal(): Promise<{ total: number }> {
  const cfg = getSophosRuntimeConfig();
  const db = getDb();
  const now = new Date().toISOString();

  const token = await getAccessToken(cfg.tokenUrl, cfg.clientId, cfg.clientSecret, cfg.scope);

  const linkedTenants = db
    .prepare('SELECT id, sophos_customer_id FROM sophos_customers')
    .all() as Array<{ id: number; sophos_customer_id: string }>;

  let total = 0;

  for (const tenant of linkedTenants) {
    let alerts: SophosAlert[];
    try {
      alerts = await fetchAlerts(token, tenant.sophos_customer_id);
    } catch (error) {
      console.error(`[Sophos] Failed to fetch alerts for tenant ${tenant.sophos_customer_id}:`, error);
      continue;
    }

    db.prepare('DELETE FROM sophos_alerts WHERE sophos_customer_id = ?').run(tenant.id);

    const insert = db.prepare(`
      INSERT OR REPLACE INTO sophos_alerts
        (sophos_customer_id, alert_id, category, description, severity, type, product, raised_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((items: SophosAlert[]) => {
      for (const a of items) {
        insert.run(
          tenant.id, a.id,
          a.category || '', a.description || '', a.severity || '',
          a.type || '', a.product || '', a.raisedAt || '',
          now,
        );
      }
    });

    insertMany(alerts);
    total += alerts.length;
    console.log(`[Sophos] Synced ${alerts.length} alert(s) for tenant ${tenant.sophos_customer_id}`);
  }

  console.log(`[Sophos] Alerts sync complete. ${total} total alert(s).`);
  return { total };
}
