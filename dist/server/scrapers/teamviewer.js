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
exports.fetchTeamViewerVersion = fetchTeamViewerVersion;
const cheerio = __importStar(require("cheerio"));
async function fetchTeamViewerVersion() {
    const url = 'https://community.teamviewer.com/English/categories/change-logs-en';
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        // Look for version patterns like "[Windows] v15.74.6" in the changelog list
        const links = $('ul.linkList a, .Title a, a').toArray();
        for (const el of links) {
            const text = $(el).text();
            const match = text.match(/\[Windows\]\s*v?([\d.]+)/i)
                || text.match(/v(15\.[\d.]+)/i);
            if (match) {
                const href = $(el).attr('href') || url;
                const fullUrl = href.startsWith('http') ? href : `https://community.teamviewer.com${href}`;
                return { version: match[1], url: fullUrl };
            }
        }
        // Fallback: search entire page text for version pattern
        const bodyText = $('body').text();
        const fallbackMatch = bodyText.match(/\[Windows\]\s*v?([\d.]+)/i)
            || bodyText.match(/Version\s*-?\s*(15\.[\d.]+)/i);
        if (fallbackMatch) {
            return { version: fallbackMatch[1], url };
        }
        throw new Error('Could not parse TeamViewer version');
    }
    catch (error) {
        console.error('[Scraper] TeamViewer fetch failed:', error);
        throw error;
    }
}
