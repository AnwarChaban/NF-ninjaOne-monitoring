"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const version_fetcher_1 = require("../services/version-fetcher");
const comparator_1 = require("../services/comparator");
const notifier_1 = require("../services/notifier");
const customers_1 = require("../services/customers");
const router = (0, express_1.Router)();
router.post('/check', async (req, res) => {
    try {
        const { product } = req.body;
        console.log(`[Check] Manual check triggered${product ? ` for ${product}` : ' for all products'}`);
        // Fetch versions
        const versions = product
            ? [await (0, version_fetcher_1.fetchLatestVersion)(product)]
            : await (0, version_fetcher_1.fetchAllLatestVersions)();
        // Get all devices grouped by product
        const devicesByProduct = (0, customers_1.getAllDevicesByProduct)();
        const updates = [];
        for (const versionInfo of versions) {
            if (!versionInfo.latestVersion)
                continue;
            const devices = devicesByProduct[versionInfo.product] || [];
            for (const device of devices) {
                const comparison = (0, comparator_1.compareVersions)(device.currentVersion, versionInfo.latestVersion, versionInfo.product);
                updates.push({
                    ...comparison,
                    customer: device.customerName,
                    device: `${device.source}-device-${device.id}`,
                });
            }
        }
        await (0, notifier_1.sendNotifications)(updates);
        res.json({ versions, updates });
    }
    catch (error) {
        console.error('[Check] Error:', error);
        res.status(500).json({ error: 'Check failed' });
    }
});
exports.default = router;
