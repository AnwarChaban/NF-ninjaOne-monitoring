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

export async function updateScraperProduct(id: string, active: boolean): Promise<void> {
  const res = await fetch(`${BASE}/admin/scraper-products/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
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

// --- Admin: Settings ---

export async function updateSettings(data: Record<string, string>): Promise<void> {
  const res = await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update settings');
}
