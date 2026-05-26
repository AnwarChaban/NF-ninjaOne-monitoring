"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllProducts = getAllProducts;
exports.getProduct = getProduct;
exports.getLatestVersion = getLatestVersion;
exports.getVersionHistory = getVersionHistory;
exports.storeProductVersion = storeProductVersion;
exports.getAllVersionsForProduct = getAllVersionsForProduct;
exports.updateProduct = updateProduct;
exports.createProduct = createProduct;
const db_1 = require("../db");
/**
 * Get all active products
 */
function getAllProducts() {
    const db = (0, db_1.getDb)();
    return db
        .prepare(`
      SELECT id, name, type, active, created_at as createdAt
      FROM products
      WHERE active = 1
      ORDER BY name
    `)
        .all();
}
/**
 * Get a single product by ID
 */
function getProduct(productId) {
    const db = (0, db_1.getDb)();
    return db
        .prepare(`
      SELECT id, name, type, active, created_at as createdAt
      FROM products
      WHERE id = ?
    `)
        .get(productId);
}
/**
 * Get latest version of a product (most recent across all sources)
 */
function getLatestVersion(productId) {
    const db = (0, db_1.getDb)();
    return db
        .prepare(`
      SELECT id, product_id as productId, version, source, release_url as releaseUrl, checked_at as checkedAt
      FROM product_versions
      WHERE product_id = ?
      ORDER BY checked_at DESC
      LIMIT 1
    `)
        .get(productId);
}
/**
 * Get version history for a product
 */
function getVersionHistory(productId, limit = 20) {
    const db = (0, db_1.getDb)();
    return db
        .prepare(`
      SELECT id, product_id as productId, version, source, release_url as releaseUrl, checked_at as checkedAt
      FROM product_versions
      WHERE product_id = ?
      ORDER BY checked_at DESC
      LIMIT ?
    `)
        .all(productId, limit);
}
/**
 * Store a new product version
 */
function storeProductVersion(productId, version, source, releaseUrl) {
    const db = (0, db_1.getDb)();
    const now = new Date().toISOString();
    db.prepare(`
    INSERT INTO product_versions (product_id, version, source, release_url, checked_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(product_id, version, source) DO UPDATE SET checked_at = ?
  `).run(productId, version, source, releaseUrl || null, now, now);
}
/**
 * Get all unique versions for a product from all sources
 */
function getAllVersionsForProduct(productId) {
    const db = (0, db_1.getDb)();
    const rows = db
        .prepare(`
      SELECT version, source, checked_at
      FROM product_versions
      WHERE product_id = ?
      ORDER BY checked_at DESC
    `)
        .all(productId);
    // Group by version
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.version)) {
            grouped.set(row.version, { sources: new Set(), checked_at: row.checked_at });
        }
        const entry = grouped.get(row.version);
        entry.sources.add(row.source);
        if (row.checked_at > entry.checked_at) {
            entry.checked_at = row.checked_at;
        }
    }
    return Array.from(grouped).map(([version, { sources, checked_at }]) => ({
        version,
        sources: Array.from(sources),
        checked_at,
    }));
}
/**
 * Update product metadata
 */
function updateProduct(productId, data) {
    const db = (0, db_1.getDb)();
    const updates = [];
    const values = [];
    if (data.name !== undefined) {
        updates.push('name = ?');
        values.push(data.name);
    }
    if (data.active !== undefined) {
        updates.push('active = ?');
        values.push(data.active);
    }
    if (updates.length === 0)
        return;
    values.push(productId);
    db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}
/**
 * Create a new product
 */
function createProduct(id, name, type = 'custom') {
    const db = (0, db_1.getDb)();
    const now = new Date().toISOString();
    db.prepare(`
    INSERT OR IGNORE INTO products (id, name, type, active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(id, name, type, now);
}
