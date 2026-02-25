import semver from 'semver';

export type UpdateStatus = 'up-to-date' | 'update-available' | 'major-update' | 'unknown';

export interface ComparisonResult {
  product: string;
  currentVersion: string;
  latestVersion: string;
  status: UpdateStatus;
}

const FORCED_UPDATE_MARKER = '__update_available__';

function normalizeVersion(version: string): string {
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
  while (parts.length < 3) parts.push('0');
  v = parts.slice(0, 3).join('.');

  return semver.valid(semver.coerce(v)) || v;
}

export function compareVersions(currentVersion: string, latestVersion: string, product: string): ComparisonResult {
  if (latestVersion === FORCED_UPDATE_MARKER) {
    return { product, currentVersion, latestVersion, status: 'update-available' };
  }

  const current = normalizeVersion(currentVersion);
  const latest = normalizeVersion(latestVersion);

  const currentSemver = semver.valid(current);
  const latestSemver = semver.valid(latest);

  if (!currentSemver || !latestSemver) {
    return { product, currentVersion, latestVersion, status: 'unknown' };
  }

  if (semver.gte(currentSemver, latestSemver)) {
    return { product, currentVersion, latestVersion, status: 'up-to-date' };
  }

  if (semver.major(latestSemver) > semver.major(currentSemver)) {
    return { product, currentVersion, latestVersion, status: 'major-update' };
  }

  return { product, currentVersion, latestVersion, status: 'update-available' };
}
