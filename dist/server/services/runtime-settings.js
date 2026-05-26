"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_TASK_TYPES = void 0;
exports.getNinjaOneRuntimeConfig = getNinjaOneRuntimeConfig;
exports.isNinjaOneConfigured = isNinjaOneConfigured;
exports.getUnifiRuntimeConfig = getUnifiRuntimeConfig;
exports.isUnifiConfigured = isUnifiConfigured;
exports.getWebhookUrl = getWebhookUrl;
exports.getSlackWebhookUrl = getSlackWebhookUrl;
exports.getGraphRuntimeConfig = getGraphRuntimeConfig;
exports.isGraphConfigured = isGraphConfigured;
exports.getBackupMailbox = getBackupMailbox;
exports.getSophosRuntimeConfig = getSophosRuntimeConfig;
exports.isSophosConfigured = isSophosConfigured;
exports.getCronSchedule = getCronSchedule;
exports.updateCronSchedule = updateCronSchedule;
exports.seedCronSettings = seedCronSettings;
const config_1 = require("../config");
const db_1 = require("../db");
function getSetting(key) {
    const db = (0, db_1.getDb)();
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value?.trim() ?? '';
}
function getSettingOrFallback(key, fallback = '') {
    const value = getSetting(key);
    return value || fallback;
}
function getNinjaOneRuntimeConfig() {
    return {
        apiUrl: getSettingOrFallback('ninjaoneApiUrl', config_1.config.ninjaone.apiUrl),
        apiKey: getSettingOrFallback('ninjaoneApiKey', config_1.config.ninjaone.apiKey),
        clientId: getSettingOrFallback('ninjaoneClientId', config_1.config.ninjaone.clientId),
        clientSecret: getSettingOrFallback('ninjaoneClientSecret', config_1.config.ninjaone.clientSecret),
    };
}
function isNinjaOneConfigured() {
    const runtime = getNinjaOneRuntimeConfig();
    const hasApiUrl = !!runtime.apiUrl;
    const hasApiKey = !!runtime.apiKey;
    const hasOauth = !!runtime.clientId && !!runtime.clientSecret;
    return hasApiUrl && (hasApiKey || hasOauth);
}
function getUnifiRuntimeConfig() {
    return {
        hostsApiUrl: config_1.config.unifi.hostsApiUrl,
        devicesApiUrl: config_1.config.unifi.devicesApiUrl,
        apiKey: getSettingOrFallback('unifiApiKey', config_1.config.unifi.apiKey),
        clientId: getSettingOrFallback('unifiClientId', config_1.config.unifi.clientId),
        clientSecret: getSettingOrFallback('unifiClientSecret', config_1.config.unifi.clientSecret),
    };
}
function isUnifiConfigured() {
    const runtime = getUnifiRuntimeConfig();
    return !!runtime.apiKey;
}
function getWebhookUrl() {
    return getSettingOrFallback('webhookUrl', config_1.config.webhookUrl);
}
function getSlackWebhookUrl() {
    return getSettingOrFallback('slackWebhookUrl', config_1.config.slackWebhookUrl);
}
function getGraphRuntimeConfig() {
    return {
        tenantId: getSettingOrFallback('graphTenantId', config_1.config.graph.tenantId),
        clientId: getSettingOrFallback('graphClientId', config_1.config.graph.clientId),
        clientSecret: getSettingOrFallback('graphClientSecret', config_1.config.graph.clientSecret),
    };
}
function isGraphConfigured() {
    const cfg = getGraphRuntimeConfig();
    return !!(cfg.tenantId && cfg.clientId && cfg.clientSecret);
}
function getBackupMailbox() {
    return getSettingOrFallback('backupMailbox', config_1.config.backupMailbox);
}
function getSophosRuntimeConfig() {
    return {
        tokenUrl: getSettingOrFallback('sophosTokenUrl', config_1.config.sophos.tokenUrl),
        clientId: getSettingOrFallback('sophosClientId', config_1.config.sophos.clientId),
        clientSecret: getSettingOrFallback('sophosClientSecret', config_1.config.sophos.clientSecret),
        partnerId: getSettingOrFallback('sophosPartnerId', config_1.config.sophos.partnerId),
        scope: getSettingOrFallback('sophosScope', config_1.config.sophos.scope),
    };
}
function isSophosConfigured() {
    const cfg = getSophosRuntimeConfig();
    return !!(cfg.tokenUrl && cfg.clientId && cfg.clientSecret && cfg.partnerId);
}
// --- Cron Schedule Management ---
// Per-task cron keys and defaults
const TASK_CRON_KEYS = {
    ninjaone_customers: 'cron_ninjaone_customers',
    ninjaone_devices: 'cron_ninjaone_devices',
    unifi_customers: 'cron_unifi_customers',
    unifi_devices: 'cron_unifi_devices',
    sophos_customers: 'cron_sophos_customers',
    sophos_devices: 'cron_sophos_devices',
    sophos_alerts: 'cron_sophos_alerts',
    backup_emails: 'cron_backup_emails',
};
const TASK_CRON_DEFAULTS = {
    ninjaone_customers: () => config_1.config.ninjaSyncCron || '0 2 * * *',
    ninjaone_devices: () => config_1.config.ninjaSyncCron || '0 2 * * *',
    unifi_customers: () => '0 2 * * *',
    unifi_devices: () => '0 2 * * *',
    sophos_customers: () => config_1.config.sophosSyncCron || '0 3 * * *',
    sophos_devices: () => config_1.config.sophosSyncCron || '0 3 * * *',
    sophos_alerts: () => config_1.config.sophosSyncCron || '0 3 * * *',
    backup_emails: () => config_1.config.backupSyncCron || '*/15 * * * *',
};
function getCronSchedule(taskType) {
    const key = TASK_CRON_KEYS[taskType];
    if (!key)
        return '0 2 * * *';
    return getSettingOrFallback(key, TASK_CRON_DEFAULTS[taskType]?.() ?? '0 2 * * *');
}
function updateCronSchedule(taskType, cronExpression) {
    const key = TASK_CRON_KEYS[taskType];
    if (!key)
        throw new Error(`Unknown task type: ${taskType}`);
    (0, db_1.getDb)().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, cronExpression);
}
function seedCronSettings() {
    const db = (0, db_1.getDb)();
    for (const [taskType, key] of Object.entries(TASK_CRON_KEYS)) {
        const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        if (!existing) {
            db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, TASK_CRON_DEFAULTS[taskType]?.() ?? '0 2 * * *');
        }
    }
}
exports.ALL_TASK_TYPES = Object.keys(TASK_CRON_KEYS);
