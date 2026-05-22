import { config } from '../config';
import { getDb } from '../db';
import { getNinjaOneRuntimeConfig, isNinjaOneConfigured } from './runtime-settings';
import { startSync, completeSync, failSync } from './sync-history';

export interface Customer {
  id: number;
  name: string;
  devices: Device[];
}

export interface Device {
  id: number;
  name: string;
  product: string;
  currentVersion: string;
  latestVersion?: string;
  orgId?: number;
  ninjaDeviceId?: number;
}

interface SoftwareEntry {
  product: string;
  currentVersion: string;
}

const GLOBAL_IGNORED_VERSION_VALUES = new Set([
  'nicht installiert',
  'not installed',
  'nichtinstalliert',
  'n/a',
  'na',
  '-',
  'none',
  'uninstalliert',
  'nicht vorhanden',
]);

const PRODUCT_VERSION_FIELD_MAP: Record<string, string[]> = {
  'teamviewer': ['teamViewerVersion', 'teamviewerVersion', 'tvVersion'],
  'synology-dsm': ['NASversion', 'nasVersion', 'synologyVersion', 'dsmVersion'],
  'sophos-firewall': ['sophosVersion', 'sophosFirewallVersion'],
  'unifi-network': ['unifiVersion', 'unifiNetworkVersion'],
  'proxmox-ve': ['proxmoxVeVersion', 'proxmoxVersion'],
  'proxmox-backup': ['proxmoxBackupVersion', 'pbsVersion'],
};

function normalizeCustomFieldValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function getCustomField(device: any, keys: string[]): string {
  const customFields = device?.customFields;

  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    for (const key of keys) {
      const value = normalizeCustomFieldValue(customFields[key]);
      if (value) return value;
    }
  }

  if (Array.isArray(customFields)) {
    for (const field of customFields) {
      const name = String(field?.name ?? field?.label ?? '').toLowerCase();
      if (!name) continue;
      for (const key of keys) {
        if (name === key.toLowerCase()) {
          const value = normalizeCustomFieldValue(field?.value);
          if (value) return value;
        }
      }
    }
  }

  return '';
}

function splitValueList(value: string): string[] {
  return value
    .split(/[\n,;|]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function toCustomFieldMap(customFields: any): Record<string, string> {
  const result: Record<string, string> = {};

  if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
    for (const [key, value] of Object.entries(customFields)) {
      const normalized = normalizeCustomFieldValue(value);
      if (normalized) result[key.toLowerCase()] = normalized;
    }
  }

  if (Array.isArray(customFields)) {
    for (const field of customFields) {
      const name = String(field?.name ?? field?.label ?? '').toLowerCase().trim();
      if (!name) continue;
      const value = normalizeCustomFieldValue(field?.value);
      if (value) result[name] = value;
    }
  }

  return result;
}

function getFieldValue(fieldMap: Record<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const value = fieldMap[alias.toLowerCase()];
    if (value) return value;
  }
  return '';
}

async function fetchDeviceCustomFieldMap(apiUrl: string, deviceId: number, authorizationHeader: string): Promise<Record<string, string>> {
  const endpoints = [
    `${apiUrl}/device/${deviceId}/custom-fields`,
  ];

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      headers: {
        'Authorization': authorizationHeader,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) continue;

    const payload = await res.json() as any;
    return toCustomFieldMap(payload?.results ?? payload?.customFields ?? payload);
  }

  return {};
}

function extractSoftwareEntries(device: any, fieldMap: Record<string, string>): SoftwareEntry[] {
  const entries: SoftwareEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (productRaw: string, versionRaw: string) => {
    const product = productRaw.trim();
    const currentVersion = versionRaw.trim();
    if (!product || !currentVersion) return;

    const normalizedVersion = currentVersion.toLowerCase().replace(/\s+/g, ' ').trim();
    if (GLOBAL_IGNORED_VERSION_VALUES.has(normalizedVersion)) {
      return;
    }

    const key = `${product.toLowerCase()}::${currentVersion.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ product, currentVersion });
  };

  const directProduct = getCustomField(device, ['product', 'Product', 'produkt']);
  const directVersion = getCustomField(device, ['currentVersion', 'current_version', 'version', 'CurrentVersion']);
  pushEntry(directProduct, directVersion);

  for (const [product, aliases] of Object.entries(PRODUCT_VERSION_FIELD_MAP)) {
    const version = getFieldValue(fieldMap, aliases);
    pushEntry(product, version);
  }

  const productsValue = fieldMap['products'] || fieldMap['software'] || fieldMap['installedsoftware'];
  const versionsValue = fieldMap['versions'] || fieldMap['softwareversions'] || fieldMap['installedsoftwareversions'];
  if (productsValue && versionsValue) {
    const products = splitValueList(productsValue);
    const versions = splitValueList(versionsValue);
    if (products.length === versions.length) {
      for (let i = 0; i < products.length; i++) {
        pushEntry(products[i], versions[i]);
      }
    }
  }

  for (const [key, value] of Object.entries(fieldMap)) {
    const productMatch = key.match(/^(product|software|produkt)(?:[_-]?(\d+))$/i);
    if (!productMatch) continue;
    const suffix = productMatch[2];
    if (!suffix) continue;
    const version =
      fieldMap[`currentversion_${suffix}`] ||
      fieldMap[`currentversion-${suffix}`] ||
      fieldMap[`current_version_${suffix}`] ||
      fieldMap[`current_version-${suffix}`] ||
      fieldMap[`version_${suffix}`] ||
      fieldMap[`version-${suffix}`];
    if (version) pushEntry(value, version);
  }

  return entries;
}

function getDevicesFromApiPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.devices)) return payload.devices;
  return [];
}

async function fetchOrganizationDevices(apiUrl: string, orgId: number, authorizationHeader: string): Promise<any[]> {
  const endpoints = [
    `${apiUrl}/organization/${orgId}/devices`,
  ];

  for (const endpoint of endpoints) {
    const res = await fetch(endpoint, {
      headers: {
        'Authorization': authorizationHeader,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.warn(`[NinjaOne] Device endpoint failed (${res.status}) for org ${orgId}: ${endpoint}`);
      continue;
    }

    const payload = await res.json() as any;
    return getDevicesFromApiPayload(payload);
  }

  return [];
}

function saveNinjaOneCustomers(customers: Customer[]): number {
  const db = getDb();
  const now = new Date().toISOString();
  const selectCustomer = db.prepare('SELECT id FROM customers WHERE name = ?');
  const insertCustomer = db.prepare('INSERT INTO customers (name, created_at, updated_at) VALUES (?, ?, ?)');
  const upsertNinjaOneCustomer = db.prepare(
    `INSERT INTO ninjaone_customers (customer_id, ninja_org_id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(ninja_org_id) DO UPDATE SET customer_id = excluded.customer_id, updated_at = excluded.updated_at`
  );

  let count = 0;
  for (const customer of customers) {
    const orgId = customer.id;
    if (!orgId) continue;

    let customerId = (selectCustomer.get(customer.name) as any)?.id;
    if (!customerId) {
      customerId = insertCustomer.run(customer.name, now, now).lastInsertRowid;
    }
    upsertNinjaOneCustomer.run(customerId, String(orgId), `NinjaOne ${customer.name}`, now, now);
    count++;
  }
  return count;
}

function saveNinjaOneDevices(customers: Customer[]): number {
  const db = getDb();
  const now = new Date().toISOString();
  const selectNinjaOneCustomer = db.prepare('SELECT id FROM ninjaone_customers WHERE ninja_org_id = ?');
  const deleteNinjaDevices = db.prepare('DELETE FROM ninjaone_devices WHERE ninjaone_customer_id = ?');
  const insertNinjaDevice = db.prepare(
    `INSERT INTO ninjaone_devices (ninjaone_customer_id, product_id, external_device_id, name, current_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const upsertProduct = db.prepare(
    'INSERT OR IGNORE INTO products (id, name, type, active, created_at) VALUES (?, ?, ?, 1, ?)'
  );

  let deviceCount = 0;
  const transaction = db.transaction(() => {
    for (const customer of customers) {
      const orgId = customer.id;
      if (!orgId) continue;
      const ninjaRow = selectNinjaOneCustomer.get(String(orgId)) as { id: number } | undefined;
      if (!ninjaRow) continue;
      deleteNinjaDevices.run(ninjaRow.id);
      for (const device of customer.devices) {
        const productId = device.product || null;
        if (productId) {
          upsertProduct.run(productId, productId, 'scraped', now);
        }
        insertNinjaDevice.run(
          ninjaRow.id,
          productId,
          `ninja-${device.ninjaDeviceId || 'unknown'}`,
          device.name,
          device.currentVersion || '',
          now,
          now
        );
        deviceCount++;
      }
    }
  });
  transaction();
  return deviceCount;
}

// Token cache
let cachedToken: string | null = null;
let tokenExpiry: number = 0;
let tokenCacheKey: string | null = null;

function getAuthBaseUrl(apiUrl: string): string {
  if (!apiUrl) return 'https://eu.ninjarmm.com';
  try {
    const normalized = apiUrl.startsWith('http') ? apiUrl : `https://${apiUrl}`;
    const url = new URL(normalized);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'https://eu.ninjarmm.com';
  }
}

async function getAccessToken(apiUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const currentCacheKey = `${apiUrl}::${clientId}`;

  if (tokenCacheKey !== currentCacheKey) {
    cachedToken = null;
    tokenExpiry = 0;
    tokenCacheKey = currentCacheKey;
  }

  // Return cached token if still valid
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken as string;
  }

  if (!clientId || !clientSecret) {
    throw new Error('NinjaOne Client ID and Client Secret are required');
  }

  console.log('[NinjaOne] Requesting new access token...');

  const tokenUrl = `${getAuthBaseUrl(apiUrl)}/ws/oauth/token`;
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'monitoring',
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  // Set expiry to 5 minutes before actual expiry (usually 3600 seconds)
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

  console.log('[NinjaOne] Access token obtained successfully');
  return cachedToken as string;
}

async function getAuthorizationHeader(apiUrl: string, apiKey: string, clientId: string, clientSecret: string): Promise<string> {
  if (apiKey) {
    return `Bearer ${apiKey}`;
  }

  const token = await getAccessToken(apiUrl, clientId, clientSecret);
  return `Bearer ${token}`;
}

async function fetchFromNinjaOne(): Promise<Customer[]> {
  const { apiUrl, apiKey, clientId, clientSecret } = getNinjaOneRuntimeConfig();

  if (!apiUrl) {
    throw new Error('NinjaOne API URL is required');
  }

  const authorizationHeader = await getAuthorizationHeader(apiUrl, apiKey, clientId, clientSecret);

  const res = await fetch(`${apiUrl}/organizations`, {
    headers: {
      'Authorization': authorizationHeader,
      'Accept': 'application/json',
    },
  });
  //  console.log('[NinjaOne] Fetching organizations from NinjaOne API...');

  if (!res.ok) {
    throw new Error(`NinjaOne API error: ${res.status} ${res.statusText}`);
  }

  const orgs = await res.json() as any[];

  const customers: Customer[] = [];
  for (const org of orgs) {
    const devices = await fetchOrganizationDevices(apiUrl, org.id, authorizationHeader);
    // console.log(`[NinjaOne] Fetching devices for organization ${org.id} from NinjaOne API...`);
    const mappedDevices: Device[] = [];

    for (const d of devices) {
      const rawId = Number(d.id);
      if (!Number.isFinite(rawId) || rawId <= 0) continue;

      const customFieldMap = {
        ...toCustomFieldMap(d?.customFields),
        ...(await fetchDeviceCustomFieldMap(apiUrl, rawId, authorizationHeader)),
      };

      const name = d.systemName || d.dnsName || `Device-${d.id}`;
      const softwareEntries = extractSoftwareEntries(d, customFieldMap);

      if (softwareEntries.length === 0) {
        mappedDevices.push({
          id: rawId,
          name,
          product: '',
          currentVersion: '',
          orgId: Number(org.id),
          ninjaDeviceId: rawId,
        });
      } else {
        mappedDevices.push(...softwareEntries.map((entry, index) => ({
          id: rawId * 100 + index + 1,
          name,
          product: entry.product,
          currentVersion: entry.currentVersion,
          orgId: Number(org.id),
          ninjaDeviceId: rawId,
        })));
      }
    }

    customers.push({
      id: org.id,
      name: org.name,
      devices: mappedDevices,
    });
  }

  return customers;
}


export interface BackupJob {
  deviceId: number;
  deviceName: string;
  orgName: string;
  planName: string;
  status: string;
  lastRunTime?: string;
  sizeBytes?: number;
}

export async function fetchNinjaOneBackups(): Promise<BackupJob[]> {
  const { apiUrl, apiKey, clientId, clientSecret } = getNinjaOneRuntimeConfig();
  if (!apiUrl) throw new Error('NinjaOne API URL is required');

  const authorizationHeader = await getAuthorizationHeader(apiUrl, apiKey, clientId, clientSecret);

  const res = await fetch(`${apiUrl}/queries/backup-jobs`, {
    headers: { 'Authorization': authorizationHeader, 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`NinjaOne backup API error: ${res.status} ${res.statusText}`);
  }

  const payload = await res.json() as any;
  const results: any[] = Array.isArray(payload) ? payload : (payload?.results ?? []);

  return results.map((job: any) => ({
    deviceId: Number(job.deviceId ?? job.id ?? 0),
    deviceName: String(job.deviceName ?? job.systemName ?? job.deviceSystemName ?? '–'),
    orgName: String(job.organizationName ?? job.orgName ?? '–'),
    planName: String(job.planName ?? job.name ?? '–'),
    status: String(job.status ?? 'UNKNOWN'),
    lastRunTime: job.lastRunTime
      ? (typeof job.lastRunTime === 'number'
        ? new Date(job.lastRunTime * 1000).toISOString()
        : String(job.lastRunTime))
      : (job.createTime
        ? (typeof job.createTime === 'number'
          ? new Date(job.createTime * 1000).toISOString()
          : String(job.createTime))
        : undefined),
    sizeBytes: job.sizeBytes != null ? Number(job.sizeBytes) : undefined,
  }));
}

export async function syncNinjaOneCustomers(triggeredBy = 'cron'): Promise<{ customers: number }> {
  if (!isNinjaOneConfigured()) return { customers: 0 };
  const syncId = startSync('ninjaone', triggeredBy, 'ninjaone_customers');
  try {
    const data = await fetchFromNinjaOne();
    const count = saveNinjaOneCustomers(data);
    completeSync(syncId, 0, count);
    return { customers: count };
  } catch (e) {
    failSync(syncId, (e as Error).message);
    throw e;
  }
}

export async function syncNinjaOneDevices(triggeredBy = 'cron'): Promise<{ devices: number }> {
  if (!isNinjaOneConfigured()) return { devices: 0 };
  const syncId = startSync('ninjaone', triggeredBy, 'ninjaone_devices');
  try {
    const data = await fetchFromNinjaOne();
    const count = saveNinjaOneDevices(data);
    completeSync(syncId, count);
    return { devices: count };
  } catch (e) {
    failSync(syncId, (e as Error).message);
    throw e;
  }
}

// Full sync: one API call, two task_type history entries
export async function syncNinjaOneData(triggeredBy = 'cron'): Promise<{ customers: number; devices: number }> {
  if (!isNinjaOneConfigured()) return { customers: 0, devices: 0 };
  const custId = startSync('ninjaone', triggeredBy, 'ninjaone_customers');
  const devId  = startSync('ninjaone', triggeredBy, 'ninjaone_devices');
  try {
    const data = await fetchFromNinjaOne();
    const customers = saveNinjaOneCustomers(data);
    completeSync(custId, 0, customers);
    const devices = saveNinjaOneDevices(data);
    completeSync(devId, devices);
    return { customers, devices };
  } catch (e) {
    failSync(custId, (e as Error).message);
    failSync(devId,  (e as Error).message);
    throw e;
  }
}

export async function syncNinjaOneUsers(_triggeredBy = 'manual'): Promise<{ synced: number; created: number; updated: number }> {
  if (!isNinjaOneConfigured()) throw new Error('NinjaOne ist nicht konfiguriert');

  const { apiUrl, apiKey, clientId, clientSecret } = getNinjaOneRuntimeConfig();
  const authHeader = await getAuthorizationHeader(apiUrl, apiKey, clientId, clientSecret);

  const res = await fetch(`${apiUrl}/users`, {
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`NinjaOne /users Fehler: ${res.status} ${res.statusText}`);

  const rawUsers = await res.json() as any[];

  // Only sync users with @net in their email (company filter)
  const filtered = rawUsers.filter(u => {
    const email = String(u.email || '').toLowerCase();
    return email.includes('@net') && (u.uid || u.userUid);
  });

  const db = getDb();
  const now = new Date().toISOString();

  const selectByNinjaUid = db.prepare('SELECT id FROM users WHERE ninja_uid = ?');
  const selectByEmail    = db.prepare('SELECT id FROM users WHERE email = ?');
  const selectByUsername = db.prepare('SELECT id FROM users WHERE username = ?');

  const updateByNinjaUid = db.prepare(
    'UPDATE users SET display_name = ?, email = ? WHERE ninja_uid = ?'
  );
  const linkNinjaUid = db.prepare(
    'UPDATE users SET ninja_uid = ?, display_name = ? WHERE id = ?'
  );
  const insertUser = db.prepare(
    'INSERT INTO users (username, display_name, role, email, ninja_uid, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  let created = 0;
  let updated = 0;

  const transaction = db.transaction(() => {
    for (const u of filtered) {
      const ninjaUid   = String(u.uid ?? u.userUid);
      const email      = String(u.email).toLowerCase().trim();
      const firstName  = String(u.firstName ?? '').trim();
      const lastName   = String(u.lastName  ?? '').trim();
      const displayName = (firstName || lastName)
        ? [firstName, lastName].filter(Boolean).join(' ')
        : email;

      // 1. Already linked by ninja_uid → update name/email
      const byUid = selectByNinjaUid.get(ninjaUid) as { id: number } | undefined;
      if (byUid) {
        updateByNinjaUid.run(displayName, email, ninjaUid);
        updated++;
        continue;
      }

      // 2. Manually created user with same email → link ninja_uid
      const byEmail = selectByEmail.get(email) as { id: number } | undefined;
      if (byEmail) {
        linkNinjaUid.run(ninjaUid, displayName, byEmail.id);
        updated++;
        continue;
      }

      // 3. Create new techniker account
      const baseUsername = email.split('@')[0];
      const username = !(selectByUsername.get(baseUsername)) ? baseUsername : email;
      try {
        insertUser.run(username, displayName, 'techniker', email, ninjaUid, now);
        created++;
      } catch { /* skip on unique conflict */ }
    }
  });

  transaction();
  console.log(`[NinjaOne] User sync: ${filtered.length} gefunden, ${created} neu, ${updated} aktualisiert`);
  return { synced: filtered.length, created, updated };
}

export async function getCustomers(): Promise<Customer[]> {
  return await fetchFromNinjaOne();
}

