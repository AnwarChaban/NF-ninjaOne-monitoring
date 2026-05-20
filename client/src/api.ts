const BASE = '/api';

async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  let message = '';

  try {
    const data = await res.json() as { error?: string; message?: string };
    message = (data?.error || data?.message || '').trim();
  } catch {
  }

  if (!message) {
    try {
      const text = await res.text();
      if (text) {
        message = text.trim();
      }
    } catch {
    }
  }

  const statusSuffix = ` (HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''})`;
  throw new Error(message || `${fallbackMessage}${statusSuffix}`);
}

export interface DeviceStatus {
  id: number;
  name: string;
  hostname?: string;
  groupLabel?: string;
  currentVersion: string;
  latestVersion?: string;
  status: 'up-to-date' | 'update-available' | 'major-update' | 'unknown';
  orgId?: number;
  ninjaDeviceId?: number;
}

export interface CustomerStatus {
  id: number;
  name: string;
  devices: DeviceStatus[];
}

export interface ProductStatus {
  product: string;
  productName: string;
  latestVersion: string;
  releaseUrl: string;
  checkedAt: string;
  error?: string;
  customers: CustomerStatus[];
}

export async function fetchProducts(): Promise<ProductStatus[]> {
  const res = await fetch(`${BASE}/products`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json();
}

export async function triggerCheck(product?: string): Promise<any> {
  const res = await fetch(`${BASE}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product ? { product } : {}),
  });
  if (!res.ok) throw new Error('Check failed');
  return res.json();
}

export async function fetchSettings(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/settings`);
  if (!res.ok) throw new Error('Failed to fetch settings');
  return res.json();
}

// --- Admin Types ---

export interface ScraperProduct {
  product: string;
  name: string;
  active: boolean;
  latestVersion: string;
  releaseUrl: string;
}

export interface CustomProduct {
  id: string;
  name: string;
  latestVersion: string;
  releaseUrl: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MockDevice {
  id: number;
  name: string;
  product: string;
  currentVersion: string;
  orgId?: number;
  ninjaDeviceId?: number;
}

export interface MockCustomer {
  id: number;
  name: string;
  devices: MockDevice[];
}

export interface UnifiCustomerMapping {
  id: number;
  matchText: string;
  customerId: number;
  customerName: string;
  createdAt: string;
}

export interface UnifiUnmatchedHost {
  id: number;
  hostId?: string;
  hostName: string;
  reason: string;
  syncedAt: string;
}

// --- Admin: Scraper Products ---

export async function fetchScraperProducts(): Promise<ScraperProduct[]> {
  const res = await fetch(`${BASE}/admin/scraper-products`);
  if (!res.ok) throw new Error('Failed to fetch scraper products');
  return res.json();
}

export async function deleteScraperProduct(id: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/products/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete product');
}

export async function updateScraperProduct(id: string, data: boolean | { active?: boolean; name?: string; latestVersion?: string; releaseUrl?: string }): Promise<void> {
  const payload = typeof data === 'boolean' ? { active: data } : data;
  const res = await fetch(`${BASE}/admin/scraper-products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update scraper product');
}

// --- Admin: Custom Products ---

export async function fetchCustomProducts(): Promise<CustomProduct[]> {
  const res = await fetch(`${BASE}/admin/custom-products`);
  if (!res.ok) throw new Error('Failed to fetch custom products');
  return res.json();
}

export async function createCustomProduct(data: { id: string; name: string; latestVersion: string; releaseUrl?: string }): Promise<void> {
  const res = await fetch(`${BASE}/admin/custom-products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create custom product');
}

export async function updateCustomProduct(id: string, data: { name?: string; latestVersion?: string; releaseUrl?: string; active?: boolean }): Promise<void> {
  const res = await fetch(`${BASE}/admin/custom-products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update custom product');
}

export async function deleteCustomProduct(id: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/custom-products/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete custom product');
}

// --- Admin: Customers ---

export async function fetchCustomers(): Promise<MockCustomer[]> {
  const res = await fetch(`${BASE}/admin/customers`);
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}

export async function createCustomer(name: string): Promise<{ ok: boolean; id: number }> {
  const res = await fetch(`${BASE}/admin/customers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to create customer');
  return res.json();
}

export async function updateCustomer(id: number, name: string): Promise<void> {
  const res = await fetch(`${BASE}/admin/customers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error('Failed to update customer');
}

export async function deleteCustomer(id: number): Promise<void> {
  const res = await fetch(`${BASE}/admin/customers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete customer');
}

// --- Admin: Devices ---

export async function createDevice(customerId: number, data: {
  name: string;
  product: string;
  currentVersion: string;
  orgId?: number;
  ninjaDeviceId?: number;
}): Promise<{ ok: boolean; id: number }> {
  const res = await fetch(`${BASE}/admin/customers/${customerId}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create device');
  return res.json();
}

export async function triggerNinjaSync(): Promise<{ ok: boolean; customers: number; devices: number }> {
  const res = await fetch(`${BASE}/admin/ninjaone/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return throwApiError(res, 'Failed to sync NinjaOne data');
  return res.json();
}

export async function triggerUnifiSync(): Promise<{
  ok: boolean;
  customers: number;
  hosts: number;
  devices: number;
  unmatchedHosts: number;
  ambiguousHosts: number;
}> {
  try {
    const res = await fetch(`${BASE}/admin/unifi/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return throwApiError(res, 'Failed to sync UniFi data');
    return res.json();
  } catch (error) {
    const message = (error as Error)?.message?.trim();
    throw new Error(message || 'Failed to sync UniFi data (network error)');
  }
}

export async function fetchUnifiMappings(): Promise<UnifiCustomerMapping[]> {
  const res = await fetch(`${BASE}/admin/unifi/mappings`);
  if (!res.ok) throw new Error('Failed to fetch UniFi mappings');
  return res.json();
}

export async function createUnifiMapping(data: { matchText: string; customerId: number }): Promise<void> {
  const res = await fetch(`${BASE}/admin/unifi/mappings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return throwApiError(res, 'Failed to create UniFi mapping');
}

export async function deleteUnifiMapping(id: number): Promise<void> {
  const res = await fetch(`${BASE}/admin/unifi/mappings/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete UniFi mapping');
}

export interface SophosFirewallStatus {
  id: number;
  name: string;
  hostname: string;
  currentVersion: string;
  latestVersion?: string;
  status: 'up-to-date' | 'update-available' | 'major-update' | 'unknown';
}

export interface SophosAlert {
  alertId: string;
  category: string;
  description: string;
  severity: string;
  type: string;
  product: string;
  raisedAt: string;
}

export interface SophosCustomerOverview {
  customerId: number;
  customerName: string;
  tenantId: string;
  latestVersion: string;
  releaseUrl: string;
  firewalls: SophosFirewallStatus[];
  alerts: SophosAlert[];
}

export async function fetchSophosOverview(): Promise<SophosCustomerOverview[]> {
  const res = await fetch(`${BASE}/sophos/overview`);
  if (!res.ok) throw new Error('Failed to fetch Sophos overview');
  return res.json();
}

export interface SophosTenantEntry {
  id: number;
  customerId: number;
  customerName: string;
  tenantId: string;
  name: string;
  devices: Array<{ id: number; name: string; hostname: string; currentVersion: string }>;
}

export async function fetchSophosTenants(): Promise<SophosTenantEntry[]> {
  const res = await fetch(`${BASE}/admin/sophos/tenants`);
  if (!res.ok) throw new Error('Failed to fetch Sophos tenants');
  return res.json();
}

export async function createSophosAccount(customerId: number, data: { sophosCustomerId: string; name: string }): Promise<void> {
  const res = await fetch(`${BASE}/admin/customers/${customerId}/sophos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return throwApiError(res, 'Failed to create Sophos account');
}

export async function deleteSophosAccount(customerId: number): Promise<void> {
  const res = await fetch(`${BASE}/admin/customers/${customerId}/sophos`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete Sophos account');
}

export interface SophosUnmatchedTenant {
  id: number;
  tenantId: string;
  tenantName: string;
  syncedAt: string;
}

export interface SophosApiTenant {
  id: string;
  name: string;
}

export async function fetchSophosUnmatchedTenants(): Promise<SophosUnmatchedTenant[]> {
  const res = await fetch(`${BASE}/admin/sophos/unmatched-tenants`);
  if (!res.ok) throw new Error('Failed to fetch unmatched Sophos tenants');
  return res.json();
}

export async function fetchSophosApiTenants(): Promise<SophosApiTenant[]> {
  const res = await fetch(`${BASE}/admin/sophos/api-tenants`);
  if (!res.ok) return throwApiError(res, 'Failed to fetch Sophos API tenants');
  return res.json();
}

export async function assignSophosTenant(data: { customerId: number; tenantId: string; tenantName: string }): Promise<void> {
  const res = await fetch(`${BASE}/admin/sophos/assign-tenant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return throwApiError(res, 'Failed to assign Sophos tenant');
}

export async function triggerSophosSync(): Promise<{ ok: boolean; tenants: number; devices: number; unmatched: number; alerts: number }> {
  const res = await fetch(`${BASE}/admin/sophos/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return throwApiError(res, 'Failed to sync Sophos data');
  return res.json();
}

export async function triggerSophosAlertsSync(): Promise<{ ok: boolean; total: number }> {
  const res = await fetch(`${BASE}/admin/sophos/sync-alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) return throwApiError(res, 'Failed to sync Sophos alerts');
  return res.json();
}

export async function fetchUnifiUnmatchedHosts(): Promise<UnifiUnmatchedHost[]> {
  const res = await fetch(`${BASE}/admin/unifi/unmatched-hosts`);
  if (!res.ok) throw new Error('Failed to fetch unmatched UniFi hosts');
  return res.json();
}

export async function updateDevice(id: number, data: { name?: string; product?: string; currentVersion?: string }): Promise<void> {
  const res = await fetch(`${BASE}/admin/devices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update device');
}

export async function deleteDevice(id: number): Promise<void> {
  const res = await fetch(`${BASE}/admin/devices/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete device');
}

// --- Backup ---

export type BackupStatus = 'success' | 'failed' | 'missed' | 'unknown';

export interface BackupAccount {
  id: number;
  customerId: number;
  customerName: string;
  fromEmail: string;
  name: string;
}

export interface BackupCheckDef {
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

export interface BackupCheckStatus extends BackupCheckDef {
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

export interface BackupDashboardResponse {
  configured: boolean;
  groups: BackupCustomerGroup[];
}

export async function fetchBackupStatus(): Promise<BackupDashboardResponse> {
  const res = await fetch(`${BASE}/backup/status`);
  if (!res.ok) throw new Error('Failed to fetch backup status');
  return res.json();
}

export async function triggerBackupSync(): Promise<{ ok: boolean; checked: number; newResults: number }> {
  const res = await fetch(`${BASE}/backup/sync`, { method: 'POST' });
  if (!res.ok) return throwApiError(res, 'Backup sync failed');
  return res.json();
}

export async function fetchBackupAccounts(): Promise<BackupAccount[]> {
  const res = await fetch(`${BASE}/admin/backup-accounts`);
  if (!res.ok) throw new Error('Failed to fetch backup accounts');
  return res.json();
}

export async function createBackupAccount(customerId: number, data: { fromEmail: string; name: string }): Promise<{ ok: boolean; id: number }> {
  const res = await fetch(`${BASE}/admin/customers/${customerId}/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return throwApiError(res, 'Failed to create backup account');
  return res.json();
}

export async function deleteBackupAccount(customerId: number): Promise<void> {
  const res = await fetch(`${BASE}/admin/customers/${customerId}/backup`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete backup account');
}

export async function fetchBackupChecks(): Promise<BackupCheckDef[]> {
  const res = await fetch(`${BASE}/admin/backup-checks`);
  if (!res.ok) throw new Error('Failed to fetch backup checks');
  return res.json();
}

export async function createBackupCheck(data: {
  backupAccountId: number; name: string; intervalHours: number;
  graceHours?: number; subjectFilter?: string | null;
  subjectMatchType?: 'contains' | 'exact'; bodyFilter?: string | null;
}): Promise<{ ok: boolean; id: number }> {
  const res = await fetch(`${BASE}/admin/backup-checks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return throwApiError(res, 'Failed to create backup check');
  return res.json();
}

export async function updateBackupCheck(id: number, data: Partial<Omit<BackupCheckDef, 'id' | 'customerName' | 'fromEmail' | 'createdAt'>>): Promise<void> {
  const res = await fetch(`${BASE}/admin/backup-checks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return throwApiError(res, 'Failed to update backup check');
}

export async function deleteBackupCheck(id: number): Promise<void> {
  const res = await fetch(`${BASE}/admin/backup-checks/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete backup check');
}

// --- Customer Overview & Detail ---

export interface CustomerSummary {
  id: number;
  name: string;
  totalDevices: number;
  outdatedDevices: number;
  backupStatus: BackupStatus | 'none';
}

export interface CustomerDeviceDetail {
  id: number;
  name: string;
  hostname?: string;
  source: 'ninjaone' | 'unifi' | 'sophos';
  currentVersion: string;
  latestVersion?: string;
  status: 'up-to-date' | 'update-available' | 'major-update' | 'unknown';
}

export interface CustomerProductGroup {
  productId: string;
  productName: string;
  latestVersion: string;
  releaseUrl: string;
  devices: CustomerDeviceDetail[];
}

export interface CustomerDetail {
  id: number;
  name: string;
  products: CustomerProductGroup[];
  backup: BackupCheckStatus[];
}

export async function fetchCustomerList(): Promise<CustomerSummary[]> {
  const res = await fetch(`${BASE}/customers`);
  if (!res.ok) throw new Error('Failed to fetch customers');
  return res.json();
}

export async function fetchCustomerDetail(id: number): Promise<CustomerDetail> {
  const res = await fetch(`${BASE}/customers/${id}`);
  if (!res.ok) throw new Error('Failed to fetch customer detail');
  return res.json();
}

// --- Admin: Settings ---

export async function updateSettings(data: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update settings');
}
