"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareVersions = compareVersions;
const semver_1 = __importDefault(require("semver"));
const FORCED_UPDATE_MARKER = '__update_available__';
function normalizeVersion(version) {
    // Remove leading 'v', trailing build metadata, handle formats like "7.2.1-69057"
    let v = version.replace(/^v/i, '').trim();
    // Handle Synology-style "7.2.1-69057" → "7.2.1"
    v = v.replace(/-\d+$/, '');
    // Handle "MR" suffix (Sophos) like "20.0 MR1" → "20.0.1"
    const mrMatch = v.match(/^([\d.]+)\s*MR\s*(\d+)/i);
    if (mrMatch) {
        v = `${mrMatch[1]}.${mrMatch[2]}`;
    }
    // Ensure we have at least X.Y.Z
    const parts = v.split('.');
    while (parts.length < 3)
        parts.push('0');
    v = parts.slice(0, 3).join('.');
    return semver_1.default.valid(semver_1.default.coerce(v)) || v;
}
function compareVersions(currentVersion, latestVersion, product) {
    if (latestVersion === FORCED_UPDATE_MARKER) {
        return { product, currentVersion, latestVersion, status: 'update-available' };
    }
    const current = normalizeVersion(currentVersion);
    const latest = normalizeVersion(latestVersion);
    const currentSemver = semver_1.default.valid(current);
    const latestSemver = semver_1.default.valid(latest);
    if (!currentSemver || !latestSemver) {
        return { product, currentVersion, latestVersion, status: 'unknown' };
    }
    if (semver_1.default.gte(currentSemver, latestSemver)) {
        return { product, currentVersion, latestVersion, status: 'up-to-date' };
    }
    if (semver_1.default.major(latestSemver) > semver_1.default.major(currentSemver)) {
        return { product, currentVersion, latestVersion, status: 'major-update' };
    }
    return { product, currentVersion, latestVersion, status: 'update-available' };
}
