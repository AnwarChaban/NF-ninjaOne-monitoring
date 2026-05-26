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
exports.fetchProxmoxVEVersion = fetchProxmoxVEVersion;
const cheerio = __importStar(require("cheerio"));
async function fetchProxmoxVEVersion() {
    const url = 'https://www.proxmox.com/en/downloads';
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);
        const text = $('body').text();
        // Look for "Proxmox VE X.Y" or "Proxmox Virtual Environment X.Y"
        const match = text.match(/Proxmox\s+(?:VE|Virtual Environment)\s+([\d.]+)/i);
        if (match) {
            return { version: match[1], url };
        }
        // Fallback: check apt repo
        const aptUrl = 'http://download.proxmox.com/debian/pve/dists/bookworm/pve-no-subscription/binary-amd64/Packages';
        try {
            const aptRes = await fetch(aptUrl);
            const aptText = await aptRes.text();
            const versions = [];
            const regex = /Package:\s*proxmox-ve[\s\S]*?Version:\s*([\d.]+(?:-\d+)?)/g;
            let m;
            while ((m = regex.exec(aptText)) !== null) {
                versions.push(m[1]);
            }
            if (versions.length > 0) {
                versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                return { version: versions[0], url: 'https://www.proxmox.com/en/downloads' };
            }
        }
        catch {
            // apt fallback failed, continue
        }
        throw new Error('Could not parse Proxmox VE version');
    }
    catch (error) {
        console.error('[Scraper] Proxmox VE fetch failed:', error);
        throw error;
    }
}
