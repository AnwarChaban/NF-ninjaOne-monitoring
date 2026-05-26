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
exports.fetchSophosVersion = fetchSophosVersion;
const cheerio = __importStar(require("cheerio"));
const RELEASE_NOTES_URLS = [
    'https://docs.sophos.com/releasenotes/output/en-us/nsg/sf_220_rn.html',
    'https://docs.sophos.com/releasenotes/output/en-us/nsg/sf_210_rn.html',
    'https://docs.sophos.com/releasenotes/output/en-us/nsg/sf_200_rn.html',
];
async function fetchSophosVersion() {
    // Try release notes pages from newest to oldest
    for (const url of RELEASE_NOTES_URLS) {
        try {
            const res = await fetch(url);
            if (!res.ok)
                continue;
            const html = await res.text();
            const $ = cheerio.load(html);
            const text = $('body').text();
            // Match "Version 22.0 GA" or "Version 21.0 MR2" patterns
            const match = text.match(/Version\s+([\d.]+)\s*(GA|MR\s*\d+)/i);
            if (match) {
                const base = match[1];
                const suffix = match[2].trim();
                const version = suffix.toUpperCase() === 'GA' ? base : `${base} ${suffix}`;
                return { version, url };
            }
        }
        catch {
            continue;
        }
    }
    throw new Error('Could not parse Sophos version from any release notes page');
}
