"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUniFiVersion = fetchUniFiVersion;
async function fetchUniFiVersion() {
    const url = 'https://fw-update.ubnt.com/api/firmware-latest?filter=eq~~product~~unifi-controller&filter=eq~~channel~~release';
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data?._embedded?.firmware?.length > 0) {
            const fw = data._embedded.firmware[0];
            const version = fw.version?.replace(/^v/, '') || fw.name;
            return { version, url: 'https://www.ui.com/download/releases/network-server' };
        }
        // Fallback: try the UI releases page
        const releasesUrl = 'https://community.ui.com/releases';
        const htmlRes = await fetch(releasesUrl);
        const html = await htmlRes.text();
        const match = html.match(/Network (?:Server|Application)\s+([\d.]+)/i)
            || html.match(/UniFi\s+(?:Network\s+)?(?:Controller|Application)\s+([\d.]+)/i);
        if (match) {
            return { version: match[1], url: releasesUrl };
        }
        throw new Error('Could not parse UniFi version');
    }
    catch (error) {
        console.error('[Scraper] UniFi fetch failed:', error);
        throw error;
    }
}
