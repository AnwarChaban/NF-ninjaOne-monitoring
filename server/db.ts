import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'versions.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initDb();
    seedMockData();
  }
  return db;
}

function initDb() {
  // Check if old schema exists (e.g., mock_customers) BEFORE creating new tables
  const tablesList = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
  const hasOldSchema = tablesList.some(t => t.name === 'mock_customers');

  // Create new simplified schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'scraped',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS product_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      version TEXT NOT NULL,
      source TEXT NOT NULL,
      release_url TEXT,
      checked_at TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, version, source)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ninjaone_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      ninja_org_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ninjaone_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ninjaone_customer_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      external_device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (ninjaone_customer_id) REFERENCES ninjaone_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS unifi_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      unifi_customer_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS unifi_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      unifi_customer_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      external_device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (unifi_customer_id) REFERENCES unifi_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sophos_customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      sophos_customer_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sophos_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sophos_customer_id INTEGER NOT NULL,
      product_id TEXT NOT NULL,
      external_device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      hostname TEXT NOT NULL DEFAULT '',
      current_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (sophos_customer_id) REFERENCES sophos_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sophos_unmatched_tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id TEXT NOT NULL UNIQUE,
      tenant_name TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sophos_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sophos_customer_id INTEGER NOT NULL,
      alert_id TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      severity TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '',
      product TEXT NOT NULL DEFAULT '',
      raised_at TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL,
      FOREIGN KEY (sophos_customer_id) REFERENCES sophos_customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS unifi_customer_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_text TEXT NOT NULL UNIQUE,
      customer_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS unifi_unmatched_hosts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host_id TEXT,
      host_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      synced_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      from_email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backup_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      backup_account_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      interval_hours REAL NOT NULL DEFAULT 24,
      grace_hours REAL NOT NULL DEFAULT 1,
      subject_filter TEXT,
      subject_match_type TEXT NOT NULL DEFAULT 'contains',
      body_filter TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (backup_account_id) REFERENCES backup_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS backup_check_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      check_id INTEGER NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      received_at TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (check_id) REFERENCES backup_checks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      entity_name TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sync_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      integration TEXT NOT NULL CHECK(integration IN ('ninjaone', 'unifi', 'sophos', 'backup')),
      started_at DATETIME NOT NULL,
      completed_at DATETIME,
      status TEXT NOT NULL CHECK(status IN ('running', 'success', 'error')),
      devices_synced INTEGER DEFAULT 0,
      customers_synced INTEGER DEFAULT 0,
      error_message TEXT,
      triggered_by TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('administrator', 'techniker')),
      password_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      session_token TEXT UNIQUE NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  createIndexes();
  migrateBackupSchema();

  // NOW run migration if old schema existed
  if (hasOldSchema) {
    console.log('Old schema detected, migration available but skipped for this version');
    // migrateFromOldSchema();
  }
}

function migrateBackupSchema() {
  // If backup_checks was created with old customer_id column, drop and recreate
  const cols = db.prepare("PRAGMA table_info(backup_checks)").all() as Array<{ name: string }>;
  if (cols.length > 0 && cols.some(c => c.name === 'customer_id')) {
    console.log('[DB] Migrating backup_checks to new schema (backup_account_id)...');
    db.exec(`
      DROP TABLE IF EXISTS backup_check_results;
      DROP TABLE IF EXISTS backup_checks;
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS backup_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL UNIQUE,
        from_email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS backup_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_account_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        interval_hours REAL NOT NULL DEFAULT 24,
        grace_hours REAL NOT NULL DEFAULT 1,
        subject_filter TEXT,
        subject_match_type TEXT NOT NULL DEFAULT 'contains',
        body_filter TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (backup_account_id) REFERENCES backup_accounts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS backup_check_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        check_id INTEGER NOT NULL,
        message_id TEXT NOT NULL UNIQUE,
        received_at TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (check_id) REFERENCES backup_checks(id) ON DELETE CASCADE
      );
    `);
    console.log('[DB] Backup schema migration complete.');
  }
}

function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_product_versions_product ON product_versions(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_versions_checked ON product_versions(checked_at);
    CREATE INDEX IF NOT EXISTS idx_ninjaone_devices_customer ON ninjaone_devices(ninjaone_customer_id);
    CREATE INDEX IF NOT EXISTS idx_ninjaone_devices_product ON ninjaone_devices(product_id);
    CREATE INDEX IF NOT EXISTS idx_unifi_devices_customer ON unifi_devices(unifi_customer_id);
    CREATE INDEX IF NOT EXISTS idx_unifi_devices_product ON unifi_devices(product_id);
    CREATE INDEX IF NOT EXISTS idx_sophos_devices_customer ON sophos_devices(sophos_customer_id);
    CREATE INDEX IF NOT EXISTS idx_sophos_devices_product ON sophos_devices(product_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_sync_history_integration ON sync_history(integration, completed_at DESC);
  `);

  // Add task_type to sync_history if not exists (must run BEFORE creating index on it)
  const syncHistoryCols = db.prepare('PRAGMA table_info(sync_history)').all() as Array<{ name: string }>;
  if (syncHistoryCols.length > 0 && !syncHistoryCols.some(c => c.name === 'task_type')) {
    db.exec(`ALTER TABLE sync_history ADD COLUMN task_type TEXT`);
    db.exec(`
      UPDATE sync_history SET task_type = CASE integration
        WHEN 'ninjaone' THEN 'ninjaone_devices'
        WHEN 'unifi'    THEN 'unifi_devices'
        WHEN 'sophos'   THEN 'sophos_devices'
        WHEN 'backup'   THEN 'backup_emails'
        ELSE integration
      END
      WHERE task_type IS NULL
    `);
    console.log('[DB] Migrated sync_history: added task_type column');
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_history_task ON sync_history(task_type, completed_at DESC)`);

  // Add expires_at / expiry_warning_sent to settings if not exists
  const settingsCols = db.prepare('PRAGMA table_info(settings)').all() as Array<{ name: string }>;
  if (settingsCols.length > 0) {
    if (!settingsCols.some(c => c.name === 'expires_at')) {
      db.exec(`ALTER TABLE settings ADD COLUMN expires_at DATETIME`);
    }
    if (!settingsCols.some(c => c.name === 'expiry_warning_sent')) {
      db.exec(`ALTER TABLE settings ADD COLUMN expiry_warning_sent INTEGER DEFAULT 0`);
    }
  }

  // Add password_hash column to users if not exists
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (userCols.length > 0 && !userCols.some(c => c.name === 'password_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
    console.log('[DB] Migrated users: added password_hash column');
  }

  // Add hostname column to sophos_devices if it doesn't exist yet
  const sophosDeviceCols = db.prepare('PRAGMA table_info(sophos_devices)').all() as Array<{ name: string }>;
  if (sophosDeviceCols.length > 0 && !sophosDeviceCols.some(c => c.name === 'hostname')) {
    db.exec(`ALTER TABLE sophos_devices ADD COLUMN hostname TEXT NOT NULL DEFAULT ''`);
    console.log('[DB] Migrated sophos_devices: added hostname column');
  }
}

function migrateFromOldSchema() {
  console.log('Migrating from old schema...');

  try {
    // Migration transaction
    const transaction = db.transaction(() => {
      // Migrate customers
      const oldCustomers = db.prepare('SELECT id, name FROM mock_customers').all() as Array<{ id: number; name: string }>;
      const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)');
      const now = new Date().toISOString();

      for (const oldCust of oldCustomers) {
        insertCustomer.run(oldCust.id, oldCust.name, now, now);
      }

      // Migrate products
      const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id, name, type, active, created_at) VALUES (?, ?, ?, ?, ?)');
      const oldScraperProducts = db.prepare('SELECT product, active FROM scraper_products').all() as Array<{ product: string; active: number }>;

      for (const prod of oldScraperProducts) {
        insertProduct.run(prod.product, prod.product, 'scraped', prod.active, now);
      }

      // Migrate version cache to product_versions
      const insertVersion = db.prepare('INSERT OR IGNORE INTO product_versions (product_id, version, source, release_url, checked_at) VALUES (?, ?, ?, ?, ?)');
      const versionCache = db.prepare('SELECT product, latest_version, release_url, checked_at FROM version_cache').all() as Array<{
        product: string;
        latest_version: string;
        release_url: string;
        checked_at: string;
      }>;

      for (const vc of versionCache) {
        insertVersion.run(vc.product, vc.latest_version, 'scraper', vc.release_url || null, vc.checked_at);
      }

      // Migrate devices to appropriate tables
      const oldDevices = db.prepare(
        'SELECT id, customer_id, name, product, current_version, org_id, ninja_device_id, source FROM mock_devices'
      ).all() as Array<{
        id: number;
        customer_id: number;
        name: string;
        product: string;
        current_version: string;
        org_id: number | null;
        ninja_device_id: number | null;
        source: string;
      }>;

      const insertNinjaOneCustomer = db.prepare(
        'INSERT OR IGNORE INTO ninjaone_customers (customer_id, ninja_org_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      );
      const insertNinjaOneDevice = db.prepare(
        'INSERT INTO ninjaone_devices (ninjaone_customer_id, product_id, external_device_id, name, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      // Group devices by customer and source
      for (const device of oldDevices) {
        if (device.source === 'manual' || device.org_id) {
          // NinjaOne device
          const existingNinjaOneCustomer = db
            .prepare('SELECT id FROM ninjaone_customers WHERE customer_id = ?')
            .get(device.customer_id) as { id: number } | undefined;

          let ninjaOneCustomerId: number;
          if (!existingNinjaOneCustomer) {
            const result = insertNinjaOneCustomer.run(device.customer_id, `ORG-${device.customer_id}`, `NinjaOne-${device.customer_id}`, now, now);
            ninjaOneCustomerId = result.lastInsertRowid as number;
          } else {
            ninjaOneCustomerId = existingNinjaOneCustomer.id;
          }

          insertNinjaOneDevice.run(ninjaOneCustomerId, device.product, `ninja-${device.id}`, device.name, device.current_version, now, now);
        }
      }
    });

    transaction();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

function seedMockData() {
  const customerCount = (db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as { cnt: number }).cnt;

  if (customerCount === 0) {
    const now = new Date().toISOString();

    const mockCustomers = [
      { name: 'Mustermann GmbH' },
      { name: 'TechStart AG' },
      { name: 'Kanzlei Weber' },
      { name: 'Praxis Dr. Schmidt' },
    ];

    const mockNinjaOneDevices: Array<{ customerIdx: number; name: string; product: string; currentVersion: string }> = [
      { customerIdx: 0, name: 'NAS-01', product: 'synology-dsm', currentVersion: '7.1.1' },
      { customerIdx: 0, name: 'FW-01', product: 'sophos-firewall', currentVersion: '19.5.3' },
      { customerIdx: 0, name: 'TV-01', product: 'teamviewer', currentVersion: '15.51.6' },
      { customerIdx: 1, name: 'PVE-01', product: 'proxmox-ve', currentVersion: '8.0.4' },
      { customerIdx: 1, name: 'PBS-01', product: 'proxmox-backup', currentVersion: '3.0.2' },
      { customerIdx: 1, name: 'NAS-02', product: 'synology-dsm', currentVersion: '7.2.0' },
      { customerIdx: 2, name: 'FW-02', product: 'sophos-firewall', currentVersion: '19.0.1' },
      { customerIdx: 2, name: 'TV-02', product: 'teamviewer', currentVersion: '15.70.3' },
      { customerIdx: 3, name: 'NAS-03', product: 'synology-dsm', currentVersion: '7.0.1' },
      { customerIdx: 3, name: 'PVE-02', product: 'proxmox-ve', currentVersion: '7.4.3' },
      { customerIdx: 3, name: 'TV-03', product: 'teamviewer', currentVersion: '15.74.6' },
    ];

    const mockUnifiDevices: Array<{ customerIdx: number; name: string; product: string; currentVersion: string }> = [
      { customerIdx: 0, name: 'UNIFI-01', product: 'unifi-network', currentVersion: '7.5.187' },
      { customerIdx: 2, name: 'UNIFI-02', product: 'unifi-network', currentVersion: '7.4.162' },
    ];

    const transaction = db.transaction(() => {
      // Insert products
      const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id, name, type, active, created_at) VALUES (?, ?, ?, ?, ?)');
      const products = [
        'synology-dsm',
        'sophos-firewall',
        'teamviewer',
        'proxmox-ve',
        'proxmox-backup',
        'unifi-network',
      ];

      for (const prodId of products) {
        insertProduct.run(prodId, prodId, 'scraped', 1, now);
      }

      // Insert customers
      const insertCustomer = db.prepare('INSERT INTO customers (name, created_at, updated_at) VALUES (?, ?, ?)');
      const customerIds: number[] = [];

      for (const cust of mockCustomers) {
        const result = insertCustomer.run(cust.name, now, now);
        customerIds.push(result.lastInsertRowid as number);
      }

      // Insert NinjaOne customers and devices
      const insertNinjaOneCustomer = db.prepare('INSERT INTO ninjaone_customers (customer_id, ninja_org_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
      const insertNinjaOneDevice = db.prepare(
        'INSERT INTO ninjaone_devices (ninjaone_customer_id, product_id, external_device_id, name, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      const ninjaOneCustomerIds: { [key: number]: number } = {};

      for (let i = 0; i < customerIds.length; i++) {
        const result = insertNinjaOneCustomer.run(customerIds[i], `ORG-${i + 1}`, `NinjaOne ${mockCustomers[i].name}`, now, now);
        ninjaOneCustomerIds[i] = result.lastInsertRowid as number;
      }

      for (const device of mockNinjaOneDevices) {
        insertNinjaOneDevice.run(
          ninjaOneCustomerIds[device.customerIdx],
          device.product,
          `ninja-dev-${Math.random().toString(36).substr(2, 9)}`,
          device.name,
          device.currentVersion,
          now,
          now
        );
      }

      // Insert Unifi customers and devices
      const insertUnifiCustomer = db.prepare('INSERT INTO unifi_customers (customer_id, unifi_customer_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
      const insertUnifiDevice = db.prepare(
        'INSERT INTO unifi_devices (unifi_customer_id, product_id, external_device_id, name, current_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      );

      const unifiCustomerIds: { [key: number]: number } = {};

      for (let i = 0; i < customerIds.length; i++) {
        const result = insertUnifiCustomer.run(customerIds[i], `UNI-${i + 1}`, `Unifi ${mockCustomers[i].name}`, now, now);
        unifiCustomerIds[i] = result.lastInsertRowid as number;
      }

      for (const device of mockUnifiDevices) {
        insertUnifiDevice.run(
          unifiCustomerIds[device.customerIdx],
          device.product,
          `unifi-dev-${Math.random().toString(36).substr(2, 9)}`,
          device.name,
          device.currentVersion,
          now,
          now
        );
      }
    });

    transaction();
  }
}
