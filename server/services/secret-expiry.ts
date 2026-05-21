import { getDb } from '../db';

export interface SecretInfo {
  key: string;
  label: string;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  isExpired: boolean;
}

const SECRET_LABELS: Record<string, string> = {
  ninjaoneClientSecret: 'NinjaOne Client Secret',
  unifiApiKey: 'UniFi API Key',
  sophosClientSecret: 'Sophos Client Secret',
  graphClientSecret: 'Microsoft Graph Client Secret',
};

export function getExpiryStatus(): SecretInfo[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT key, expires_at FROM settings WHERE expires_at IS NOT NULL'
  ).all() as Array<{ key: string; expires_at: string }>;

  return rows
    .filter(r => SECRET_LABELS[r.key])
    .map(r => {
      const diffMs = new Date(r.expires_at).getTime() - Date.now();
      const daysUntilExpiry = Math.ceil(diffMs / 86_400_000);
      return {
        key: r.key,
        label: SECRET_LABELS[r.key],
        expiresAt: r.expires_at,
        daysUntilExpiry,
        isExpired: daysUntilExpiry <= 0,
      };
    })
    .sort((a, b) => (a.daysUntilExpiry ?? 9999) - (b.daysUntilExpiry ?? 9999));
}

export function isSecretExpired(key: string): boolean {
  const db = getDb();
  const row = db.prepare('SELECT expires_at FROM settings WHERE key = ?').get(key) as { expires_at: string | null } | undefined;
  if (!row?.expires_at) return false;
  return new Date(row.expires_at).getTime() < Date.now();
}

export function checkExpiringSecrets(): void {
  const db = getDb();
  const secrets = getExpiryStatus();
  const toNotify = secrets.filter(s => {
    if (!s.isExpired && (s.daysUntilExpiry === null || s.daysUntilExpiry > 14)) return false;
    const row = db.prepare('SELECT expiry_warning_sent FROM settings WHERE key = ?').get(s.key) as { expiry_warning_sent: number } | undefined;
    return !row?.expiry_warning_sent;
  });

  if (toNotify.length === 0) return;

  const messages = toNotify.map(s =>
    s.isExpired
      ? `❌ ${s.label}: ABGELAUFEN`
      : `⚠️ ${s.label}: läuft in ${s.daysUntilExpiry} Tag(en) ab`
  );
  console.log('[SecretExpiry]', messages.join(' | '));

  const stmt = db.prepare('UPDATE settings SET expiry_warning_sent = 1 WHERE key = ?');
  for (const s of toNotify) stmt.run(s.key);
}
