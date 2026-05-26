import { getDb } from '../db';
import { getUnifiRuntimeConfig, isUnifiConfigured } from './runtime-settings';
import { storeProductVersion } from './products';
import { startSync, completeSync, failSync } from './sync-history';
import semver from 'semver';

interface UnifiHost {
  id: string;
  name: string;
  controllerUuid: string;
  osCurrentVersion: string;
  osLatestVersion: string;
  networkCurrentVersion: string;
  networkLatestVersion: string;
}

interface UnifiDevice {
  id: string;
  name: string;
  hostId: string;
  controllerUuid: string;
  deviceType: string;
  version: string;
  latestAvailableVersion: string;
  firmwareStatus: string;
}

const FORCED_UPDATE_MARKER = '__update_available__';

interface AuthCandidate {
  label: string;
  headers: Record<string, string>;
}

interface CustomerMatcher {
  id: number;
  name: string;
  normalizedName: string;
  tokens: string[];
}

interface ManualHostMapping {
  matchText: string;
  normalizedMatchText: string;
  customerId: number;
}

const CUSTOMER_NAME_STOPWORDS = new Set([
  'gmbh', 'mbh', 'ag', 'kg', 'ug', 'ohg', 'gbr', 'se', 'ltd',
  'co', 'company', 'gruppe', 'group', 'holding', 'und', 'the',
  'der', 'die', 'das', 'von', 'for', 'net', 'factory',
]);

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function tokenizeName(value: string): string[] {
  return normalizeName(value)
    .split(' ')
    .map(token => token.trim())
    .filter(token => token.length >= 3 && !CUSTOMER_NAME_STOPWORDS.has(token));
}

function pickCustomerForHost(hostName: string, customers: CustomerMatcher[]): { customer?: CustomerMatcher; ambiguous: boolean } {
  const normalizedHostName = normalizeName(hostName);
  if (!normalizedHostName) return { ambiguous: false };

  const strictMatches = customers.filter(customer =>
    normalizedHostName.includes(customer.normalizedName) || customer.normalizedName.includes(normalizedHostName)
  );

  if (strictMatches.length === 1) {
    return { customer: strictMatches[0], ambiguous: false };
  }

  if (strictMatches.length > 1) {
    return { ambiguous: true };
  }

  const hostTokens = new Set(tokenizeName(hostName));

  const scored = customers
    .map(customer => {
      const tokenMatches = customer.tokens.filter(token => hostTokens.has(token));
      const matchCount = tokenMatches.length;
      const coverage = customer.tokens.length > 0 ? matchCount / customer.tokens.length : 0;
      const qualifies = matchCount >= 2 || (matchCount === 1 && customer.tokens.length === 1);

      return {
        customer,
        matchCount,
        coverage,
        qualifies,
      };
    })
    .filter(candidate => candidate.qualifies)
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      if (b.coverage !== a.coverage) return b.coverage - a.coverage;
      return b.customer.normalizedName.length - a.customer.normalizedName.length;
    });

  if (scored.length === 0) {
    return { ambiguous: false };
  }

  if (scored.length === 1) {
    return { customer: scored[0].customer, ambiguous: false };
  }

  const top = scored[0];
  const second = scored[1];
  const sameScore = top.matchCount === second.matchCount && top.coverage === second.coverage;

  if (sameScore) {
    return { ambiguous: true };
  }

  return { customer: top.customer, ambiguous: false };
}

function pickManualCustomerForHost(hostName: string, mappings: ManualHostMapping[], customersById: Map<number, CustomerMatcher>): { customer?: CustomerMatcher; ambiguous: boolean } {
  const normalizedHostName = normalizeName(hostName);
  if (!normalizedHostName) return { ambiguous: false };

  const matchingMappings = mappings
    .filter(mapping => mapping.normalizedMatchText && normalizedHostName.includes(mapping.normalizedMatchText))
    .sort((a, b) => b.normalizedMatchText.length - a.normalizedMatchText.length);

  if (matchingMappings.length === 0) {
    return { ambiguous: false };
  }

  const bestLength = matchingMappings[0].normalizedMatchText.length;
  const topMappings = matchingMappings.filter(mapping => mapping.normalizedMatchText.length === bestLength);
  const uniqueCustomerIds = [...new Set(topMappings.map(mapping => mapping.customerId))];

  if (uniqueCustomerIds.length !== 1) {
    return { ambiguous: true };
  }

  return {
    customer: customersById.get(uniqueCustomerIds[0]),
    ambiguous: false,
  };
}

function extractDataArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function isGroupedHostRecord(raw: any): boolean {
  return Array.isArray(raw?.devices);
}

function flattenGroupedDeviceRecords(records: any[]): any[] {
  const flattened: any[] = [];

  for (const record of records) {
    if (!isGroupedHostRecord(record)) {
      flattened.push(record);
      continue;
    }

    const parentHostId = normalizeString(record?.hostId || record?.id || record?.uuid);
    const parentHostName = normalizeString(record?.hostName || record?.name || record?.hostname);

    for (const device of record.devices) {
      if (!device || typeof device !== 'object') continue;
      flattened.push({
        ...device,
        hostId: normalizeString(device?.hostId || parentHostId),
        hostName: normalizeString(device?.hostName || parentHostName),
      });
    }
  }

  return flattened;
}

function extractGroupedHostRecords(records: any[]): any[] {
  return records.filter(isGroupedHostRecord);
}

function extractNetworkControllerVersion(reportedState: any): { currentVersion: string; availableVersion: string } {
  const controllers = Array.isArray(reportedState?.controllers) ? reportedState.controllers : [];

  const networkController = controllers.find((controller: any) => {
    const name = normalizeString(controller?.name).toLowerCase();
    const type = normalizeString(controller?.type).toLowerCase();
    return name === 'network' || (type === 'controller' && name.includes('network'));
  });

  return {
    currentVersion: normalizeString(
      networkController?.version ||
      networkController?.uiVersion ||
      networkController?.versionRaw
    ),
    availableVersion: normalizeString(networkController?.updateAvailable),
  };
}

function withPaging(url: string, limit: number, offset: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set('limit', String(limit));
  parsed.searchParams.set('offset', String(offset));
  return parsed.toString();
}

function resolveNextUrl(baseUrl: string, payload: any): string {
  const directNext = normalizeString(payload?.pagination?.next || payload?.next || payload?.links?.next || payload?.meta?.next);
  if (directNext) {
    return new URL(directNext, baseUrl).toString();
  }

  const nextCursor = normalizeString(payload?.pagination?.nextCursor || payload?.meta?.nextCursor || payload?.nextCursor);
  if (nextCursor) {
    const parsed = new URL(baseUrl);
    parsed.searchParams.set('cursor', nextCursor);
    return parsed.toString();
  }

  return '';
}

function getRecordIdentifier(item: any, fallbackIndex?: number): string {
  const preferredKeys = [
    item?.id,
    item?.deviceId,
    item?.device_id,
    item?.hostId,
    item?.host_id,
    item?.uuid,
    item?.controllerUuid,
    item?.controller_uuid,
    item?.serial,
    item?.mac,
  ];

  for (const key of preferredKeys) {
    const normalized = normalizeString(key);
    if (normalized) return normalized;
  }

  const name = normalizeString(item?.name || item?.hostname || item?.displayName);
  const model = normalizeString(item?.model || item?.type || item?.deviceType || item?.category);
  if (name || model) {
    return `${name}::${model}`;
  }

  if (fallbackIndex !== undefined) {
    return `idx:${fallbackIndex}`;
  }

  return '';
}

function getAuthCandidates(apiKey: string): AuthCandidate[] {
  const trimmed = apiKey.trim();
  if (!trimmed) return [];

  return [
    { label: 'Authorization: Bearer', headers: { 'Authorization': `Bearer ${trimmed}` } },
    { label: 'x-api-key', headers: { 'x-api-key': trimmed } },
    { label: 'X-API-Key', headers: { 'X-API-Key': trimmed } },
    { label: 'Authorization (raw token)', headers: { 'Authorization': trimmed } },
  ];
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.trim();
  } catch {
    return '';
  }
}

async function fetchWithAuthFallback(url: string, authCandidates: AuthCandidate[], entityName: string): Promise<{ response: Response; auth: AuthCandidate }> {
  if (authCandidates.length === 0) {
    throw new Error('UniFi API key is missing');
  }

  let lastUnauthorizedBody = '';

  for (const auth of authCandidates) {
    const response = await fetch(url, {
      headers: {
        ...auth.headers,
        'Accept': 'application/json',
      },
    });

    if (response.status === 401) {
      const errorBody = await readErrorBody(response);
      lastUnauthorizedBody = errorBody || lastUnauthorizedBody;
      continue;
    }

    return { response, auth };
  }

  const bodySuffix = lastUnauthorizedBody ? ` - ${lastUnauthorizedBody}` : '';
  throw new Error(`UniFi ${entityName} request failed (401 Unauthorized) for all auth modes${bodySuffix}`);
}

async function fetchPaginatedRecords(url: string, authCandidates: AuthCandidate[], entityName: string): Promise<any[]> {
  const limit = 200;
  const maxPages = 100;
  const uniqueById = new Map<string, any>();

  let offset = 0;
  let currentUrl = withPaging(url, limit, offset);
  let lastSignature = '';
  let selectedAuth: AuthCandidate | null = null;

  for (let page = 0; page < maxPages && currentUrl; page++) {
    let response: Response;

    if (!selectedAuth) {
      const selected = await fetchWithAuthFallback(currentUrl, authCandidates, entityName);
      response = selected.response;
      selectedAuth = selected.auth;
    } else {
      response = await fetch(currentUrl, {
        headers: {
          ...selectedAuth.headers,
          'Accept': 'application/json',
        },
      });

      if (response.status === 401) {
        selectedAuth = null;
        const selected = await fetchWithAuthFallback(currentUrl, authCandidates, entityName);
        response = selected.response;
        selectedAuth = selected.auth;
      }
    }

    if (!response.ok) {
      const errorBody = await readErrorBody(response);
      const bodySuffix = errorBody ? ` - ${errorBody}` : '';
      throw new Error(`UniFi ${entityName} request failed (${response.status} ${response.statusText})${bodySuffix}`);
    }

    const payload = await response.json() as any;
    const items = extractDataArray(payload);

    const signature = `${items.length}:${getRecordIdentifier(items[0])}:${getRecordIdentifier(items[items.length - 1])}`;
    if (page > 0 && signature === lastSignature) {
      break;
    }
    lastSignature = signature;

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const id = getRecordIdentifier(item, index);
      if (id) {
        uniqueById.set(id, item);
      }
    }

    const nextUrl = resolveNextUrl(currentUrl, payload);
    if (nextUrl) {
      currentUrl = nextUrl;
      continue;
    }

    if (items.length < limit) {
      break;
    }

    offset += limit;
    currentUrl = withPaging(url, limit, offset);
  }

  return Array.from(uniqueById.values());
}

function parseHost(raw: any): UnifiHost {
  const reported = raw?.reportedState || {};
  const reportedHardware = reported?.hardware || {};
  const firmwareUpdate = reported?.firmwareUpdate || raw?.firmwareUpdate || {};
  const networkController = extractNetworkControllerVersion(reported);
  const nestedDevices = Array.isArray(raw?.devices) ? raw.devices : [];
  const consoleDevice = nestedDevices.find((device: any) => !!device?.isConsole) || null;

  return {
    id: normalizeString(raw?.id || raw?.hostId || raw?.host_id || raw?.uuid || raw?.controller_uuid || raw?.controllerUuid || raw?.serial || raw?.mac),
    name: normalizeString(raw?.name || raw?.hostName || raw?.hostname || raw?.displayName || reported?.name),
    controllerUuid: normalizeString(reported?.controller_uuid || raw?.controller_uuid || raw?.controllerUuid),
    osCurrentVersion: normalizeString(
      reportedHardware?.firmwareVersion ||
      reported?.firmwareVersion ||
      consoleDevice?.version ||
      raw?.firmwareVersion ||
      raw?.version
    ),
    osLatestVersion: normalizeString(
      firmwareUpdate?.latestAvailableVersion ||
      consoleDevice?.updateAvailable ||
      reported?.latestAvailableVersion ||
      raw?.latestAvailableVersion
    ),
    networkCurrentVersion: normalizeString(networkController.currentVersion),
    networkLatestVersion: normalizeString(networkController.availableVersion),
  };
}

function parseDevice(raw: any): UnifiDevice {
  const reported = raw?.reportedState || {};
  const host = raw?.host || {};
  const hardware = raw?.hardware || {};
  const firmwareUpdate = raw?.firmwareUpdate || {};

  return {
    id: normalizeString(raw?.id || raw?.deviceId || raw?.device_id || raw?.uuid || raw?.serial || raw?.mac),
    name: normalizeString(raw?.name || raw?.hostname || raw?.displayName),
    hostId: normalizeString(raw?.hostId || raw?.host_id || host?.id || raw?.parentHostId),
    controllerUuid: normalizeString(reported?.controller_uuid || raw?.controller_uuid || raw?.controllerUuid),
    deviceType: normalizeString(raw?.type || raw?.deviceType || raw?.category || raw?.model),
    version: normalizeString(
      hardware?.firmwareVersion ||
      raw?.firmwareVersion ||
      raw?.firmware?.version ||
      reported?.firmwareVersion ||
      raw?.version ||
      reported?.version
    ),
    latestAvailableVersion: normalizeString(
      firmwareUpdate?.latestAvailableVersion ||
      raw?.updateAvailable ||
      raw?.latestAvailableVersion ||
      raw?.availableFirmwareVersion ||
      reported?.latestAvailableVersion
    ),
    firmwareStatus: normalizeString(raw?.firmwareStatus || reported?.firmwareStatus),
  };
}

function toComparableSemver(version: string): string | null {
  const cleaned = normalizeString(version).replace(/^v/i, '');
  if (!cleaned) return null;
  const coerced = semver.coerce(cleaned);
  return coerced ? coerced.version : null;
}

// Returns true only for plain numeric semver strings like "7.4.162" or "5.1.11".
// Rejects device firmware strings like "UVC.SAV539gP.v5.3.89..." that the UniFi
// API sometimes returns for the Network App latest-version field.
function isCleanVersion(version: string): boolean {
  return /^\d+\.\d+(\.\d+)*$/.test(normalizeString(version));
}

function pickHighestVersion(versions: string[]): string {
  let highestRaw = '';
  let highestSemver: string | null = null;

  for (const candidateRaw of versions) {
    const candidate = normalizeString(candidateRaw);
    if (!candidate) continue;

    const candidateSemver = toComparableSemver(candidate);
    if (!highestRaw) {
      highestRaw = candidate;
      highestSemver = candidateSemver;
      continue;
    }

    if (candidateSemver && highestSemver) {
      if (semver.gt(candidateSemver, highestSemver)) {
        highestRaw = candidate;
        highestSemver = candidateSemver;
      }
      continue;
    }

    if (candidateSemver && !highestSemver) {
      highestRaw = candidate;
      highestSemver = candidateSemver;
      continue;
    }
  }

  return highestRaw;
}

export async function syncUnifiData(triggeredBy = 'cron'): Promise<{ customers: number; hosts: number; devices: number; unmatchedHosts: number; ambiguousHosts: number }> {
  if (!isUnifiConfigured()) {
    throw new Error('UniFi is not configured');
  }

  const custId = startSync('unifi', triggeredBy, 'unifi_customers');
  const devId  = startSync('unifi', triggeredBy, 'unifi_devices');
  try {
    const result = await _syncUnifiDataInternal();
    completeSync(custId, 0, result.customers);
    completeSync(devId, result.devices);
    return result;
  } catch (e) {
    failSync(custId, (e as Error).message);
    failSync(devId,  (e as Error).message);
    throw e;
  }
}

async function _syncUnifiDataInternal(): Promise<{ customers: number; hosts: number; devices: number; unmatchedHosts: number; ambiguousHosts: number }> {
  if (!isUnifiConfigured()) {
    throw new Error('UniFi is not configured');
  }

  const runtime = getUnifiRuntimeConfig();
  const authCandidates = getAuthCandidates(runtime.apiKey);

  const [hostPayload, devicePayload] = await Promise.all([
    fetchPaginatedRecords(runtime.hostsApiUrl, authCandidates, 'hosts'),
    fetchPaginatedRecords(runtime.devicesApiUrl, authCandidates, 'devices'),
  ]);

  const groupedHostsFromHostPayload = extractGroupedHostRecords(hostPayload);
  const groupedHostsFromDevicePayload = extractGroupedHostRecords(devicePayload);

  const hostCandidates = [
    ...hostPayload,
    ...groupedHostsFromDevicePayload,
  ];

  const flattenedDevices = flattenGroupedDeviceRecords(devicePayload);

  const hostsById = new Map<string, UnifiHost>();
  for (const hostRaw of hostCandidates) {
    const parsedHost = parseHost(hostRaw);
    if (!parsedHost.id || !parsedHost.name) continue;
    if (!hostsById.has(parsedHost.id)) {
      hostsById.set(parsedHost.id, parsedHost);
      continue;
    }

    const existing = hostsById.get(parsedHost.id)!;
    hostsById.set(parsedHost.id, {
      ...existing,
      name: existing.name || parsedHost.name,
      controllerUuid: existing.controllerUuid || parsedHost.controllerUuid,
      osCurrentVersion: existing.osCurrentVersion || parsedHost.osCurrentVersion,
      osLatestVersion: existing.osLatestVersion || parsedHost.osLatestVersion,
      networkCurrentVersion: existing.networkCurrentVersion || parsedHost.networkCurrentVersion,
      networkLatestVersion: existing.networkLatestVersion || parsedHost.networkLatestVersion,
    });
  }

  const hosts = Array.from(hostsById.values());
  const devices = flattenedDevices.map(parseDevice).filter(device => !!device.id);

  const db = getDb();
  const customers = db.prepare('SELECT id, name FROM customers').all() as Array<{ id: number; name: string }>;
  if (customers.length === 0) {
    throw new Error('No customers available. Please add customers first.');
  }

  const normalizedCustomers: CustomerMatcher[] = customers.map(customer => ({
    ...customer,
    normalizedName: normalizeName(customer.name),
    tokens: tokenizeName(customer.name),
  })).filter(customer => !!customer.normalizedName);
  const customersById = new Map<number, CustomerMatcher>(normalizedCustomers.map(customer => [customer.id, customer]));

  const manualMappings = db.prepare(
    'SELECT match_text, customer_id FROM unifi_customer_mappings'
  ).all() as Array<{ match_text: string; customer_id: number }>;

  const normalizedMappings: ManualHostMapping[] = manualMappings
    .map(mapping => ({
      matchText: normalizeString(mapping.match_text),
      normalizedMatchText: normalizeName(mapping.match_text),
      customerId: mapping.customer_id,
    }))
    .filter(mapping => !!mapping.matchText && !!mapping.normalizedMatchText && customersById.has(mapping.customerId));

  const devicesByController = new Map<string, UnifiDevice[]>();
  const devicesByHostId = new Map<string, UnifiDevice[]>();

  for (const device of devices) {
    if (device.controllerUuid) {
      const list = devicesByController.get(device.controllerUuid) || [];
      list.push(device);
      devicesByController.set(device.controllerUuid, list);
    }

    if (device.hostId) {
      const list = devicesByHostId.get(device.hostId) || [];
      list.push(device);
      devicesByHostId.set(device.hostId, list);
    }
  }

  const upsertProduct = db.prepare('INSERT OR IGNORE INTO products (id, name, type, active, created_at) VALUES (?, ?, ?, 1, ?)');
  const upsertUnifiCustomer = db.prepare(`
    INSERT INTO unifi_customers (customer_id, unifi_customer_id, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(customer_id) DO UPDATE SET updated_at = excluded.updated_at
  `);
  const selectUnifiCustomer = db.prepare('SELECT id FROM unifi_customers WHERE customer_id = ?');
  const deleteAllUnifiDevices = db.prepare('DELETE FROM unifi_devices');
  const deleteUnmatchedHosts = db.prepare('DELETE FROM unifi_unmatched_hosts');
  const insertUnmatchedHost = db.prepare(
    'INSERT INTO unifi_unmatched_hosts (host_id, host_name, reason, synced_at) VALUES (?, ?, ?, ?)'
  );
  const insertDevice = db.prepare(`
    INSERT INTO unifi_devices (unifi_customer_id, product_id, external_device_id, name, current_version, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let unmatchedHosts = 0;
  let ambiguousHosts = 0;
  let insertedDevices = 0;
  const now = new Date().toISOString();
  const insertedNetworkDeviceKeys = new Set<string>();

  const osLatestCandidates: string[] = [];
  const networkLatestCandidates: string[] = [];

  const transaction = db.transaction(() => {
    const unifiCustomerIdMap = new Map<number, number>();
    upsertProduct.run('unifi-os', 'unifi-os', 'scraped', now);
    upsertProduct.run('unifi-network', 'unifi-network', 'scraped', now);
    deleteAllUnifiDevices.run();
    deleteUnmatchedHosts.run();

    for (const host of hosts) {
      const manualMatch = pickManualCustomerForHost(host.name, normalizedMappings, customersById);

      if (manualMatch.ambiguous) {
        ambiguousHosts++;
        insertUnmatchedHost.run(host.id || null, host.name, 'ambiguous-manual', now);
        console.warn(`[UniFi] Ambiguous manual host mapping: "${host.name}"`);
        continue;
      }

      const matchResult = manualMatch.customer
        ? { customer: manualMatch.customer, ambiguous: false }
        : pickCustomerForHost(host.name, normalizedCustomers);

      if (!matchResult.customer && !matchResult.ambiguous) {
        unmatchedHosts++;
        insertUnmatchedHost.run(host.id || null, host.name, 'no-match', now);
        continue;
      }

      if (matchResult.ambiguous || !matchResult.customer) {
        ambiguousHosts++;
        insertUnmatchedHost.run(host.id || null, host.name, 'ambiguous-auto', now);
        console.warn(`[UniFi] Ambiguous host match: "${host.name}"`);
        continue;
      }

      const customer = matchResult.customer;

      if (!unifiCustomerIdMap.has(customer.id)) {
        upsertUnifiCustomer.run(customer.id, `unifi-${customer.id}`, `UniFi ${customer.name}`, now, now);
        const row = selectUnifiCustomer.get(customer.id) as { id: number };
        unifiCustomerIdMap.set(customer.id, row.id);
      }
      const unifiCustId = unifiCustomerIdMap.get(customer.id)!;

      const hostRelatedDevices = [
        ...(host.controllerUuid ? (devicesByController.get(host.controllerUuid) || []) : []),
        ...(host.id ? (devicesByHostId.get(host.id) || []) : []),
      ];

      const uniqueDevices = new Map<string, UnifiDevice>();
      for (const device of hostRelatedDevices) {
        uniqueDevices.set(device.id, device);
      }

      const hostNumericId = Number(host.id);

      if (host.osCurrentVersion) {
        const osTargetVersion = host.osLatestVersion || host.osCurrentVersion;
        insertDevice.run(
          unifiCustId,
          'unifi-os',
          host.id ? `os-${host.id}` : `os-${host.name}`,
          `${host.name} (UniFi OS)`,
          host.osCurrentVersion,
          now,
          now,
        );
        insertedDevices++;
        osLatestCandidates.push(osTargetVersion);
      }

      if (host.networkCurrentVersion) {
        const rawNetworkLatest = host.networkLatestVersion || host.networkCurrentVersion;
        const networkTargetVersion = isCleanVersion(rawNetworkLatest) ? rawNetworkLatest : host.networkCurrentVersion;
        insertDevice.run(
          unifiCustId,
          'unifi-network',
          host.id ? `net-${host.id}` : `net-${host.name}`,
          `${host.name} (Network App)`,
          host.networkCurrentVersion,
          now,
          now,
        );
        insertedDevices++;
        if (isCleanVersion(networkTargetVersion)) networkLatestCandidates.push(networkTargetVersion);
      }

      for (const device of uniqueDevices.values()) {
        const version = device.version || 'unknown';
        const firmwareStatus = device.firmwareStatus.toLowerCase();
        const hasForcedUpdateFlag = firmwareStatus === 'updateavailable' || firmwareStatus === 'update-available' || firmwareStatus === 'update_available';
        const targetVersion = device.latestAvailableVersion || (hasForcedUpdateFlag ? FORCED_UPDATE_MARKER : version);
        const dedupeKey = `${customer.id}:${device.id}`;

        if (insertedNetworkDeviceKeys.has(dedupeKey)) {
          continue;
        }

        insertedNetworkDeviceKeys.add(dedupeKey);

        insertDevice.run(
          unifiCustId,
          'unifi-network',
          `device-${device.id}`,
          `${device.name || `UniFi Device ${device.id}`} (${device.deviceType || 'Device'})`,
          version,
          now,
          now,
        );
        insertedDevices++;
        if (targetVersion !== FORCED_UPDATE_MARKER && isCleanVersion(targetVersion)) {
          networkLatestCandidates.push(targetVersion);
        }
      }
    }
  });

  transaction();

  const highestOsVersion = pickHighestVersion(osLatestCandidates);
  const highestNetworkVersion = pickHighestVersion(networkLatestCandidates);

  if (highestOsVersion) {
    storeProductVersion('unifi-os', highestOsVersion, 'unifi', runtime.hostsApiUrl);
  }

  if (highestNetworkVersion) {
    storeProductVersion('unifi-network', highestNetworkVersion, 'unifi', runtime.hostsApiUrl);
  }

  return {
    customers: normalizedCustomers.length,
    hosts: hosts.length,
    devices: insertedDevices,
    unmatchedHosts,
    ambiguousHosts,
  };
}
