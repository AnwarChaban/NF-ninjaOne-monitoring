"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.productNames = void 0;
exports.getProductName = getProductName;
exports.fetchLatestVersion = fetchLatestVersion;
exports.fetchAllLatestVersions = fetchAllLatestVersions;
exports.getCachedVersions = getCachedVersions;
const db_1 = require("../db");
const products_1 = require("./products");
const synology_1 = require("../scrapers/synology");
const sophos_1 = require("../scrapers/sophos");
const proxmox_ve_1 = require("../scrapers/proxmox-ve");
const proxmox_backup_1 = require("../scrapers/proxmox-backup");
const teamviewer_1 = require("../scrapers/teamviewer");
const scrapers = {
    'synology-dsm': synology_1.fetchSynologyVersion,
    'sophos-firewall': sophos_1.fetchSophosVersion,
    'proxmox-ve': proxmox_ve_1.fetchProxmoxVEVersion,
    'proxmox-backup': proxmox_backup_1.fetchProxmoxBackupVersion,
    'teamviewer': teamviewer_1.fetchTeamViewerVersion,
};
exports.productNames = {
    'synology-dsm': 'Synology DSM',
    'sophos-firewall': 'Sophos Firewall',
    'unifi-os': 'UniFi OS',
    'unifi-network': 'UniFi Network App',
    'proxmox-ve': 'Proxmox VE',
    'proxmox-backup': 'Proxmox Backup Server',
    'teamviewer': 'TeamViewer',
};
function getProductName(id) {
    if (exports.productNames[id])
        return exports.productNames[id];
    return id;
}
async function fetchLatestVersion(product) {
    // Special handling for Unifi (comes from API, not scraper)
    if (product === 'unifi-network' || product === 'unifi-os') {
        const db = (0, db_1.getDb)();
        const cached = db
            .prepare(`
        SELECT version, release_url, checked_at
        FROM product_versions
        WHERE product_id = ? AND source = 'unifi'
        ORDER BY checked_at DESC
        LIMIT 1
      `)
            .get(product);
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
        (0, products_1.storeProductVersion)(product, version, 'scraped', url);
        return { product, latestVersion: version, releaseUrl: url, checkedAt };
    }
    catch (error) {
        // Try returning cached version
        const latest = (0, products_1.getLatestVersion)(product);
        if (latest) {
            return {
                product,
                latestVersion: latest.version,
                releaseUrl: latest.releaseUrl || '',
                checkedAt: latest.checkedAt,
                error: `Fetch failed, using cached data: ${error.message}`,
            };
        }
        return {
            product,
            latestVersion: '',
            releaseUrl: '',
            checkedAt: new Date().toISOString(),
            error: error.message,
        };
    }
}
async function fetchAllLatestVersions() {
    const allProducts = (0, products_1.getAllProducts)();
    const results = await Promise.allSettled(allProducts.map(product => fetchLatestVersion(product.id)));
    return results.map((result, i) => {
        if (result.status === 'fulfilled')
            return result.value;
        const product = allProducts[i];
        return {
            product: product.id,
            latestVersion: '',
            releaseUrl: '',
            checkedAt: new Date().toISOString(),
            error: result.reason.message,
        };
    });
}
function getCachedVersions() {
    const allProducts = (0, products_1.getAllProducts)();
    return allProducts.map(product => {
        const latest = (0, products_1.getLatestVersion)(product.id);
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
