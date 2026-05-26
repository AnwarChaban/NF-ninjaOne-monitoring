import { getDb } from '../db';

export interface Product {
  id: string;
  name: string;
  type: 'scraped' | 'custom';
  active: number;
  createdAt: string;
}

export interface ProductVersion {
  id: number;
  productId: string;
  version: string;
  source: 'scraped' | 'ninjaone' | 'unifi' | 'sophos';
  releaseUrl: string | null;
  checkedAt: string;
}

/**
 * Get all active products
 */
export function getAllProducts(): Product[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT id, name, type, active, created_at as createdAt
      FROM products
      WHERE active = 1
      ORDER BY name
    `)
    .all() as Product[];
}

/**
 * Get a single product by ID
 */
export function getProduct(productId: string): Product | undefined {
  const db = getDb();
  return db
    .prepare(`
      SELECT id, name, type, active, created_at as createdAt
      FROM products
      WHERE id = ?
    `)
    .get(productId) as Product | undefined;
}

/**
 * Get latest version of a product (most recent across all sources)
 */
export function getLatestVersion(productId: string): ProductVersion | undefined {
  const db = getDb();
  return db
    .prepare(`
      SELECT id, product_id as productId, version, source, release_url as releaseUrl, checked_at as checkedAt
      FROM product_versions
      WHERE product_id = ?
      ORDER BY checked_at DESC
      LIMIT 1
    `)
    .get(productId) as ProductVersion | undefined;
}

/**
 * Get version history for a product
 */
export function getVersionHistory(productId: string, limit = 20): ProductVersion[] {
  const db = getDb();
  return db
    .prepare(`
      SELECT id, product_id as productId, version, source, release_url as releaseUrl, checked_at as checkedAt
      FROM product_versions
      WHERE product_id = ?
      ORDER BY checked_at DESC
      LIMIT ?
    `)
    .all(productId, limit) as ProductVersion[];
}

/**
 * Store a new product version
 */
export function storeProductVersion(
  productId: string,
  version: string,
  source: 'scraped' | 'ninjaone' | 'unifi' | 'sophos',
  releaseUrl?: string,
): void {
  const db = getDb();
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
export function getAllVersionsForProduct(productId: string): Array<{ version: string; sources: string[]; checked_at: string }> {
  const db = getDb();

  const rows = db
    .prepare(`
      SELECT version, source, checked_at
      FROM product_versions
      WHERE product_id = ?
      ORDER BY checked_at DESC
    `)
    .all(productId) as Array<{ version: string; source: string; checked_at: string }>;

  // Group by version
  const grouped = new Map<string, { sources: Set<string>; checked_at: string }>();
  for (const row of rows) {
    if (!grouped.has(row.version)) {
      grouped.set(row.version, { sources: new Set(), checked_at: row.checked_at });
    }
    const entry = grouped.get(row.version)!;
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
export function updateProduct(productId: string, data: Partial<Pick<Product, 'name' | 'active'>>): void {
  const db = getDb();
  const updates: string[] = [];
  const values: any[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    values.push(data.name);
  }
  if (data.active !== undefined) {
    updates.push('active = ?');
    values.push(data.active);
  }

  if (updates.length === 0) return;

  values.push(productId);
  db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);
}

/**
 * Create a new product
 */
export function createProduct(id: string, name: string, type: 'scraped' | 'custom' = 'custom'): void {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO products (id, name, type, active, created_at)
    VALUES (?, ?, ?, 1, ?)
  `).run(id, name, type, now);
}
