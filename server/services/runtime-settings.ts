import { config } from '../config';
import { getDb } from '../db';

function getSetting(key: string): string {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value?.trim() ?? '';
}

function getSettingOrFallback(key: string, fallback = ''): string {
  const value = getSetting(key);
  return value || fallback;
}

export interface NinjaOneRuntimeConfig {
  apiUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export interface UnifiRuntimeConfig {
  hostsApiUrl: string;
  devicesApiUrl: string;
  apiKey: string;
  clientId: string;
  clientSecret: string;
}

export function getNinjaOneRuntimeConfig(): NinjaOneRuntimeConfig {
  return {
    apiUrl: getSettingOrFallback('ninjaoneApiUrl', config.ninjaone.apiUrl),
    apiKey: getSettingOrFallback('ninjaoneApiKey', config.ninjaone.apiKey),
    clientId: getSettingOrFallback('ninjaoneClientId', config.ninjaone.clientId),
    clientSecret: getSettingOrFallback('ninjaoneClientSecret', config.ninjaone.clientSecret),
  };
}

export function isNinjaOneConfigured(): boolean {
  const runtime = getNinjaOneRuntimeConfig();
  const hasApiUrl = !!runtime.apiUrl;
  const hasApiKey = !!runtime.apiKey;
  const hasOauth = !!runtime.clientId && !!runtime.clientSecret;
  return hasApiUrl && (hasApiKey || hasOauth);
}

export function getUnifiRuntimeConfig(): UnifiRuntimeConfig {
  return {
    hostsApiUrl: config.unifi.hostsApiUrl,
    devicesApiUrl: config.unifi.devicesApiUrl,
    apiKey: getSettingOrFallback('unifiApiKey', config.unifi.apiKey),
    clientId: getSettingOrFallback('unifiClientId', config.unifi.clientId),
    clientSecret: getSettingOrFallback('unifiClientSecret', config.unifi.clientSecret),
  };
}

export function isUnifiConfigured(): boolean {
  const runtime = getUnifiRuntimeConfig();
  return !!runtime.apiKey;
}

export function getWebhookUrl(): string {
  return getSettingOrFallback('webhookUrl', config.webhookUrl);
}

export function getSlackWebhookUrl(): string {
  return getSettingOrFallback('slackWebhookUrl', config.slackWebhookUrl);
}

export interface GraphRuntimeConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function getGraphRuntimeConfig(): GraphRuntimeConfig {
  return {
    tenantId: getSettingOrFallback('graphTenantId', config.graph.tenantId),
    clientId: getSettingOrFallback('graphClientId', config.graph.clientId),
    clientSecret: getSettingOrFallback('graphClientSecret', config.graph.clientSecret),
  };
}

export function isGraphConfigured(): boolean {
  const cfg = getGraphRuntimeConfig();
  return !!(cfg.tenantId && cfg.clientId && cfg.clientSecret);
}

export function getBackupMailbox(): string {
  return getSettingOrFallback('backupMailbox', config.backupMailbox);
}

export interface SophosRuntimeConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  partnerId: string;
  scope: string;
}

export function getSophosRuntimeConfig(): SophosRuntimeConfig {
  return {
    tokenUrl: getSettingOrFallback('sophosTokenUrl', config.sophos.tokenUrl),
    clientId: getSettingOrFallback('sophosClientId', config.sophos.clientId),
    clientSecret: getSettingOrFallback('sophosClientSecret', config.sophos.clientSecret),
    partnerId: getSettingOrFallback('sophosPartnerId', config.sophos.partnerId),
    scope: getSettingOrFallback('sophosScope', config.sophos.scope),
  };
}

export function isSophosConfigured(): boolean {
  const cfg = getSophosRuntimeConfig();
  return !!(cfg.tokenUrl && cfg.clientId && cfg.clientSecret && cfg.partnerId);
}

// --- Cron Schedule Management ---

// Per-task cron keys and defaults
const TASK_CRON_KEYS: Record<string, string> = {
  ninjaone_customers: 'cron_ninjaone_customers',
  ninjaone_devices:   'cron_ninjaone_devices',
  unifi_customers:    'cron_unifi_customers',
  unifi_devices:      'cron_unifi_devices',
  sophos_customers:   'cron_sophos_customers',
  sophos_devices:     'cron_sophos_devices',
  sophos_alerts:      'cron_sophos_alerts',
  backup_emails:      'cron_backup_emails',
};

const TASK_CRON_DEFAULTS: Record<string, () => string> = {
  ninjaone_customers: () => config.ninjaSyncCron  || '0 2 * * *',
  ninjaone_devices:   () => config.ninjaSyncCron  || '0 2 * * *',
  unifi_customers:    () => '0 2 * * *',
  unifi_devices:      () => '0 2 * * *',
  sophos_customers:   () => config.sophosSyncCron || '0 3 * * *',
  sophos_devices:     () => config.sophosSyncCron || '0 3 * * *',
  sophos_alerts:      () => config.sophosSyncCron || '0 3 * * *',
  backup_emails:      () => config.backupSyncCron || '*/15 * * * *',
};

export function getCronSchedule(taskType: string): string {
  const key = TASK_CRON_KEYS[taskType];
  if (!key) return '0 2 * * *';
  return getSettingOrFallback(key, TASK_CRON_DEFAULTS[taskType]?.() ?? '0 2 * * *');
}

export function updateCronSchedule(taskType: string, cronExpression: string): void {
  const key = TASK_CRON_KEYS[taskType];
  if (!key) throw new Error(`Unknown task type: ${taskType}`);
  getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, cronExpression);
}

export function seedCronSettings(): void {
  const db = getDb();
  for (const [taskType, key] of Object.entries(TASK_CRON_KEYS)) {
    const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!existing) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, TASK_CRON_DEFAULTS[taskType]?.() ?? '0 2 * * *');
    }
  }
}

export const ALL_TASK_TYPES = Object.keys(TASK_CRON_KEYS);
