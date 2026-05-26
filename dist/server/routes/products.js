"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const products_1 = require("../services/products");
const comparator_1 = require("../services/comparator");
const customers_1 = require("../services/customers");
const router = (0, express_1.Router)();
router.get('/products', async (_req, res) => {
    try {
        const products = (0, products_1.getAllProducts)();
        const devicesByProduct = (0, customers_1.getAllDevicesByProduct)();
        const result = products.map(product => {
            const latest = (0, products_1.getLatestVersion)(product.id);
            const latestVersion = latest?.version || '';
            // Group devices by customer
            const productDevices = devicesByProduct[product.id] || [];
            const customerMap = new Map();
            for (const device of productDevices) {
                if (!customerMap.has(device.customerId)) {
                    customerMap.set(device.customerId, {
                        id: device.customerId,
                        name: device.customerName,
                        devices: [],
                    });
                }
                const comparison = latestVersion
                    ? (0, comparator_1.compareVersions)(device.currentVersion, latestVersion, product.id)
                    : { status: 'unknown' };
                customerMap.get(device.customerId).devices.push({
                    id: device.id,
                    name: device.deviceName || device.customerName,
                    hostname: device.hostname || undefined,
                    currentVersion: device.currentVersion,
                    latestVersion: latestVersion || undefined,
                    status: comparison.status,
                });
            }
            return {
                product: product.id,
                productName: product.name,
                latestVersion,
                releaseUrl: latest?.releaseUrl || '',
                checkedAt: latest?.checkedAt || '',
                customers: Array.from(customerMap.values()),
            };
        });
        res.json(result);
    }
    catch (error) {
        console.error('[API] Error fetching products:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});
exports.default = router;
