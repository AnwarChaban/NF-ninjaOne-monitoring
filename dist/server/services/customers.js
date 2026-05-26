"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllCustomersWithAccounts = getAllCustomersWithAccounts;
exports.getCustomerWithDevices = getCustomerWithDevices;
exports.getAllDevicesByProduct = getAllDevicesByProduct;
const db_1 = require("../db");
/**
 * Get all customers with their connected accounts (NinjaOne, Unifi, Sophos)
 */
function getAllCustomersWithAccounts() {
    const db = (0, db_1.getDb)();
    const customers = db.prepare('SELECT id, name FROM customers ORDER BY name').all();
    return customers.map(customer => {
        const ninjaOne = db
            .prepare('SELECT id, ninja_org_id as ninjaOrgId, name FROM ninjaone_customers WHERE customer_id = ?')
            .get(customer.id);
        const unifi = db
            .prepare('SELECT id, unifi_customer_id as unifiCustomerId, name FROM unifi_customers WHERE customer_id = ?')
            .get(customer.id);
        const sophos = db
            .prepare('SELECT id, sophos_customer_id as sophosCustomerId, name FROM sophos_customers WHERE customer_id = ?')
            .get(customer.id);
        return {
            ...customer,
            ninjaOne: ninjaOne ? { ...ninjaOne, customerId: customer.id } : null,
            unifi: unifi ? { ...unifi, customerId: customer.id } : null,
            sophos: sophos ? { ...sophos, customerId: customer.id } : null,
        };
    });
}
/**
 * Get customer info with all their devices grouped by source
 */
function getCustomerWithDevices(customerId) {
    const db = (0, db_1.getDb)();
    const customer = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(customerId);
    if (!customer)
        return null;
    const ninjaOneData = db
        .prepare('SELECT id, ninja_org_id as ninjaOrgId, name FROM ninjaone_customers WHERE customer_id = ?')
        .get(customerId);
    const unifiData = db
        .prepare('SELECT id, unifi_customer_id as unifiCustomerId, name FROM unifi_customers WHERE customer_id = ?')
        .get(customerId);
    const sophosData = db
        .prepare('SELECT id, sophos_customer_id as sophosCustomerId, name FROM sophos_customers WHERE customer_id = ?')
        .get(customerId);
    const ninjaOneDevices = ninjaOneData
        ? db
            .prepare(`
          SELECT 
            id, product_id as productId, external_device_id as externalDeviceId,
            name, current_version as currentVersion, created_at as createdAt
          FROM ninjaone_devices 
          WHERE ninjaone_customer_id = ?
        `)
            .all(ninjaOneData.id)
        : [];
    const unifiDevices = unifiData
        ? db
            .prepare(`
          SELECT 
            id, product_id as productId, external_device_id as externalDeviceId,
            name, current_version as currentVersion, created_at as createdAt
          FROM unifi_devices 
          WHERE unifi_customer_id = ?
        `)
            .all(unifiData.id)
        : [];
    const sophosDevices = sophosData
        ? db
            .prepare(`
          SELECT 
            id, product_id as productId, external_device_id as externalDeviceId,
            name, current_version as currentVersion, created_at as createdAt
          FROM sophos_devices 
          WHERE sophos_customer_id = ?
        `)
            .all(sophosData.id)
        : [];
    return {
        ...customer,
        ninjaOne: ninjaOneData ? { ...ninjaOneData, devices: ninjaOneDevices } : null,
        unifi: unifiData ? { ...unifiData, devices: unifiDevices } : null,
        sophos: sophosData ? { ...sophosData, devices: sophosDevices } : null,
    };
}
/**
 * Get all devices across all sources grouped by product
 */
function getAllDevicesByProduct() {
    const db = (0, db_1.getDb)();
    const ninjaOneRows = db
        .prepare(`
      SELECT
        nd.id, nd.name as deviceName, nd.product_id as productId, nd.current_version as currentVersion,
        nc.customer_id as customerId, c.name as customerName,
        'ninjaone' as source
      FROM ninjaone_devices nd
      JOIN ninjaone_customers nc ON nd.ninjaone_customer_id = nc.id
      JOIN customers c ON nc.customer_id = c.id
    `)
        .all();
    const unifiRows = db
        .prepare(`
      SELECT
        ud.id, ud.name as deviceName, ud.product_id as productId, ud.current_version as currentVersion,
        uc.customer_id as customerId, c.name as customerName,
        'unifi' as source
      FROM unifi_devices ud
      JOIN unifi_customers uc ON ud.unifi_customer_id = uc.id
      JOIN customers c ON uc.customer_id = c.id
    `)
        .all();
    const sophosRows = db
        .prepare(`
      SELECT
        sd.id, sd.name as deviceName, sd.hostname, sd.product_id as productId, sd.current_version as currentVersion,
        sc.customer_id as customerId, c.name as customerName,
        'sophos' as source
      FROM sophos_devices sd
      JOIN sophos_customers sc ON sd.sophos_customer_id = sc.id
      JOIN customers c ON sc.customer_id = c.id
    `)
        .all();
    const allDevices = [...ninjaOneRows, ...unifiRows, ...sophosRows];
    // Group by product
    const grouped = new Map();
    for (const device of allDevices) {
        if (!grouped.has(device.productId)) {
            grouped.set(device.productId, []);
        }
        grouped.get(device.productId).push(device);
    }
    return Object.fromEntries(grouped);
}
