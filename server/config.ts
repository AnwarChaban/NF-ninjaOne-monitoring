import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  checkCron: process.env.CHECK_CRON || '0 */4 * * *',
  ninjaSyncCron: process.env.NINJA_SYNC_CRON || '0 2 * * *',

  ninjaone: {
    apiUrl: process.env.NINJAONE_API_URL || '',
    clientId: process.env.NINJAONE_CLIENT_ID || '',
    clientSecret: process.env.NINJAONE_CLIENT_SECRET || '',
    apiKey: process.env.NINJAONE_API_KEY || '',
  },

  unifi: {
    hostsApiUrl: 'https://api.ui.com/v1/hosts',
    devicesApiUrl: 'https://api.ui.com/v1/devices',
    apiKey: process.env.UNIFI_API_KEY || '',
    clientId: process.env.UNIFI_CLIENT_ID || '',
    clientSecret: process.env.UNIFI_CLIENT_SECRET || '',
  },

  sophos: {
    tokenUrl: process.env.SOPHOS_TOKEN_URL || '',
    clientId: process.env.SOPHOS_CLIENT_ID || '',
    clientSecret: process.env.SOPHOS_CLIENT_SECRET || '',
    partnerId: process.env.SOPHOS_PARTNER_ID || '',
    scope: process.env.SOPHOS_SCOPE || 'token',
  },

  sophosSyncCron: process.env.SOPHOS_SYNC_CRON || '0 3 * * *',

  graph: {
    tenantId: process.env.GRAPH_TENANT_ID || '',
    clientId: process.env.GRAPH_CLIENT_ID || '',
    clientSecret: process.env.GRAPH_CLIENT_SECRET || '',
  },

  backupMailbox: process.env.BACKUP_MAILBOX || '',
  backupSyncCron: process.env.BACKUP_SYNC_CRON || '*/15 * * * *',

  webhookUrl: process.env.WEBHOOK_URL || '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',

  get useNinjaOne(): boolean {
    return !!this.ninjaone.apiKey || (!!this.ninjaone.clientId && !!this.ninjaone.clientSecret);
  },
};
