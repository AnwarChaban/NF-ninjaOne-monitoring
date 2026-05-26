"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchEmailsFromSender = fetchEmailsFromSender;
const runtime_settings_1 = require("./runtime-settings");
let cachedToken = null;
let tokenExpiry = 0;
let tokenCacheKey = null;
async function getAccessToken(tenantId, clientId, clientSecret) {
    const cacheKey = `${tenantId}::${clientId}`;
    if (tokenCacheKey !== cacheKey) {
        cachedToken = null;
        tokenExpiry = 0;
        tokenCacheKey = cacheKey;
    }
    if (cachedToken && Date.now() < tokenExpiry) {
        return cachedToken;
    }
    const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
        }),
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Graph API token error: ${response.status} - ${text}`);
    }
    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return cachedToken;
}
async function fetchEmailsFromSender(fromEmail, sinceDays = 7) {
    const cfg = (0, runtime_settings_1.getGraphRuntimeConfig)();
    const mailbox = (0, runtime_settings_1.getBackupMailbox)();
    if (!mailbox)
        throw new Error('Backup mailbox is not configured');
    const token = await getAccessToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();
    const filter = [
        `receivedDateTime ge ${since}`,
        `from/emailAddress/address eq '${fromEmail.replace(/'/g, "''")}'`,
    ].join(' and ');
    const messages = [];
    const pageSize = 100;
    let nextLink = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/messages` +
        `?$filter=${encodeURIComponent(filter)}` +
        `&$select=id,subject,receivedDateTime,bodyPreview` +
        `&$top=${pageSize}` +
        `&$orderby=receivedDateTime desc`;
    while (nextLink && messages.length < 1000) {
        const response = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Graph API messages error (${fromEmail}): ${response.status} - ${text}`);
        }
        const payload = await response.json();
        for (const item of payload.value) {
            messages.push({
                id: String(item.id || ''),
                subject: String(item.subject || ''),
                receivedAt: String(item.receivedDateTime || ''),
                bodyPreview: String(item.bodyPreview || ''),
            });
        }
        nextLink = payload['@odata.nextLink'] ?? null;
    }
    return messages;
}
