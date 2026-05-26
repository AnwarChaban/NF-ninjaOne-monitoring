"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSynologyVersion = fetchSynologyVersion;
const cheerio = __importStar(require("cheerio"));
async function fetchSynologyVersion() {
    const url = 'https://www.synology.com/en-global/releaseNote/DSMmanager';
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        // Look for version pattern in the page content
        const text = $('body').text();
        const match = text.match(/Version:\s*([\d.]+(?:-\d+)?)/i)
            || text.match(/DSM\s+([\d.]+(?:-\d+)?)/i)
            || text.match(/(7\.\d+(?:\.\d+)*(?:-\d+)?)/);
        if (match) {
            return { version: match[1], url };
        }
        // Fallback: try the archive page
        const archiveUrl = 'https://archive.synology.com/download/Os/DSM';
        const archiveRes = await fetch(archiveUrl);
        const archiveHtml = await archiveRes.text();
        const $a = cheerio.load(archiveHtml);
        const versions = [];
        $a('a').each((_, el) => {
            const href = $a(el).attr('href') || '';
            const m = href.match(/\/DSM\/([\d.]+)/);
            if (m)
                versions.push(m[1]);
        });
        if (versions.length > 0) {
            versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            return { version: versions[0], url: archiveUrl };
        }
        throw new Error('Could not parse Synology DSM version');
    }
    catch (error) {
        console.error('[Scraper] Synology DSM fetch failed:', error);
        throw error;
    }
}
