import { getDb } from '../db';
import { getAllProducts, getLatestVersion, storeProductVersion, type Product } from './products';
import { fetchSynologyVersion } from '../scrapers/synology';
import { fetchSophosVersion } from '../scrapers/sophos';
import { fetchProxmoxVEVersion } from '../scrapers/proxmox-ve';
import { fetchProxmoxBackupVersion } from '../scrapers/proxmox-backup';
import { fetchTeamViewerVersion } from '../scrapers/teamviewer';

export interface VersionInfo {
  product: string;
  latestVersion: string;
  releaseUrl: string;
  checkedAt: string;
  error?: string;
}

const scrapers: Record<string, () => Promise<{ version: string; url: string }>> = {
  'synology-dsm': fetchSynologyVersion,
  'sophos-firewall': fetchSophosVersion,
  'proxmox-ve': fetchProxmoxVEVersion,
  'proxmox-backup': fetchProxmoxBackupVersion,
  'teamviewer': fetchTeamViewerVersion,
};

export const productNames: Record<string, string> = {
  'synology-dsm': 'Synology DSM',
  'sophos-firewall': 'Sophos Firewall',
  'unifi-os': 'UniFi OS',
  'unifi-network': 'UniFi Network App',
  'proxmox-ve': 'Proxmox VE',
  'proxmox-backup': 'Proxmox Backup Server',
  'teamviewer': 'TeamViewer',
};

export function getProductName(id: string): string {
  if (productNames[id]) return productNames[id];
  return id;
}

export async function fetchLatestVersion(product: string): Promise<VersionInfo> {
  // Special handling for Unifi (comes from API, not scraper)
  if (product === 'unifi-network' || product === 'unifi-os') {
    const db = getDb();
    const cached = db
      .prepare(`
        SELECT version, release_url, checked_at
        FROM product_versions
        WHERE product_id = ? AND source = 'unifi'
        ORDER BY checked_at DESC
        LIMIT 1
      `)
      .get(product) as any;

    if (cached) {
      return {
        product,
        latestVersion: cached.version,
        releaseUrl: cached.release_url || '',
        checkedAt: cached.checked_at,
      };
    }

    return {
      product,
      latestVersion: '',
      releaseUrl: '',
      checkedAt: new Date().toISOString(),
      error: 'UniFi-Version wird über UniFi-Sync ermittelt',
    };
  }

  const scraper = scrapers[product];
  if (!scraper) {
    return {
      product,
      latestVersion: '',
      releaseUrl: '',
      checkedAt: new Date().toISOString(),
      error: `Unknown product: ${product}`,
    };
  }

  try {
    const { version, url } = await scraper();
    const checkedAt = new Date().toISOString();

    // Store in new schema
    storeProductVersion(product, version, 'scraped', url);

    return { product, latestVersion: version, releaseUrl: url, checkedAt };
  } catch (error) {
    // Try returning cached version
    const latest = getLatestVersion(product);
    if (latest) {
      return {
        product,
        latestVersion: latest.version,
        releaseUrl: latest.releaseUrl || '',
        checkedAt: latest.checkedAt,
        error: `Fetch failed, using cached data: ${(error as Error).message}`,
      };
    }
    return {
      product,
      latestVersion: '',
      releaseUrl: '',
      checkedAt: new Date().toISOString(),
      error: (error as Error).message,
    };
  }
}

export async function fetchAllLatestVersions(): Promise<VersionInfo[]> {
  const allProducts = getAllProducts();
  const results = await Promise.allSettled(
    allProducts.map(product => fetchLatestVersion(product.id))
  );

  return results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    const product = allProducts[i];
    return {
      product: product.id,
      latestVersion: '',
      releaseUrl: '',
      checkedAt: new Date().toISOString(),
      error: (result.reason as Error).message,
    };
  });
}

export function getCachedVersions(): VersionInfo[] {
  const allProducts = getAllProducts();

  return allProducts.map(product => {
    const latest = getLatestVersion(product.id);

    if (latest) {
      return {
        product: product.id,
        latestVersion: latest.version,
        releaseUrl: latest.releaseUrl || '',
        checkedAt: latest.checkedAt,
      };
    }

    return {
      product: product.id,
      latestVersion: '',
      releaseUrl: '',
      checkedAt: new Date().toISOString(),
    };
  });
}
