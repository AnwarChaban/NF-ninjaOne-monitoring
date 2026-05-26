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
  }
  return db;
}

function initDb() {
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
      product_id TEXT,
      external_device_id TEXT NOT NULL,
      name TEXT NOT NULL,
      current_version TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (ninjaone_customer_id) REFERENCES ninjaone_customers(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
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

  // Add password_hash / email columns to users if not exists
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  if (userCols.length > 0 && !userCols.some(c => c.name === 'password_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_hash TEXT`);
    console.log('[DB] Migrated users: added password_hash column');
  }
  if (userCols.length > 0 && !userCols.some(c => c.name === 'email')) {
    db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    console.log('[DB] Migrated users: added email column');
  }
  if (userCols.length > 0 && !userCols.some(c => c.name === 'ninja_uid')) {
    db.exec(`ALTER TABLE users ADD COLUMN ninja_uid TEXT`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ninja_uid ON users(ninja_uid) WHERE ninja_uid IS NOT NULL`);
    console.log('[DB] Migrated users: added ninja_uid column');
  }

  // Make ninjaone_devices.product_id nullable for existing DBs
  const ninjaDeviceCols = db.prepare('PRAGMA table_info(ninjaone_devices)').all() as Array<{ name: string; notnull: number }>;
  const productIdCol = ninjaDeviceCols.find(c => c.name === 'product_id');
  if (productIdCol && productIdCol.notnull === 1) {
    console.log('[DB] Migrating ninjaone_devices: making product_id nullable...');
    db.pragma('foreign_keys = OFF');
    const rebuildTable = db.transaction(() => {
      db.exec(`
        CREATE TABLE ninjaone_devices_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ninjaone_customer_id INTEGER NOT NULL,
          product_id TEXT,
          external_device_id TEXT NOT NULL,
          name TEXT NOT NULL,
          current_version TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (ninjaone_customer_id) REFERENCES ninjaone_customers(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
        );
        INSERT INTO ninjaone_devices_new SELECT * FROM ninjaone_devices;
        DROP TABLE ninjaone_devices;
        ALTER TABLE ninjaone_devices_new RENAME TO ninjaone_devices;
      `);
    });
    rebuildTable();
    db.pragma('foreign_keys = ON');
    console.log('[DB] Migrated ninjaone_devices: product_id is now nullable');
  }

  // Add hostname column to sophos_devices if it doesn't exist yet
  const sophosDeviceCols = db.prepare('PRAGMA table_info(sophos_devices)').all() as Array<{ name: string }>;
  if (sophosDeviceCols.length > 0 && !sophosDeviceCols.some(c => c.name === 'hostname')) {
    db.exec(`ALTER TABLE sophos_devices ADD COLUMN hostname TEXT NOT NULL DEFAULT ''`);
    console.log('[DB] Migrated sophos_devices: added hostname column');
  }

  // Add paused/manual_status columns to backup_checks
  const backupCheckCols = db.prepare('PRAGMA table_info(backup_checks)').all() as Array<{ name: string }>;
  if (backupCheckCols.length > 0) {
    let migrated = false;
    const addCol = (col: string, def: string) => {
      if (!backupCheckCols.some(c => c.name === col)) {
        db.exec(`ALTER TABLE backup_checks ADD COLUMN ${col} ${def}`);
        migrated = true;
      }
    };
    addCol('paused', 'INTEGER NOT NULL DEFAULT 0');
    addCol('paused_at', 'TEXT');
    addCol('paused_by', 'INTEGER');
    addCol('paused_reason', 'TEXT');
    addCol('paused_until', 'TEXT');
    addCol('manual_status', 'TEXT');
    addCol('manual_status_set_at', 'TEXT');
    addCol('manual_status_set_by', 'INTEGER');
    addCol('manual_status_comment', 'TEXT');
    if (migrated) console.log('[DB] Migrated backup_checks: added paused/manual_status columns');
  }
}
