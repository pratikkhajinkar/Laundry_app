import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Robust root directory resolution
function resolveProjectRoot(): string {
  const candidate1 = path.resolve(__dirname, '..');
  if (fs.existsSync(path.join(candidate1, 'data', 'laundry.db')) || fs.existsSync(path.join(candidate1, 'package.json'))) {
    return candidate1;
  }
  const candidate2 = process.cwd();
  if (fs.existsSync(path.join(candidate2, 'data', 'laundry.db')) || fs.existsSync(path.join(candidate2, 'package.json'))) {
    return candidate2;
  }
  return candidate1;
}

export const projectRoot = resolveProjectRoot();

// Ensure data directory exists
export const dataDir = path.resolve(projectRoot, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Ensure uploads directory exists
export const uploadsDir = path.resolve(projectRoot, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export const dbPath = path.join(dataDir, 'laundry.db');
export const db = new DatabaseSync(dbPath);

// Enable foreign keys, WAL mode, and safe checkpoints for zero data loss
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA wal_autocheckpoint = 100;');

export function backupDatabase() {
  try {
    const backupPath = path.join(dataDir, 'laundry_backup.db');
    const safeBackupPath = path.join(dataDir, 'laundry_backup_safe.db');
    // Force a WAL checkpoint to flush all data to the main database file before copying
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    fs.copyFileSync(dbPath, backupPath);
    fs.copyFileSync(dbPath, safeBackupPath);
  } catch (err) {
    console.error('Backup error:', err);
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email_or_phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      role TEXT NOT NULL, -- 'admin', 'shop', 'delivery'
      shop_id TEXT,
      service_area_id TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'inactive'
      is_online INTEGER DEFAULT 0,
      is_busy INTEGER DEFAULT 0,
      last_heartbeat TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_areas (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      pincode TEXT,
      city TEXT DEFAULT 'Pune',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      service_area_id TEXT,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      gst_number TEXT,
      upi_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clothing_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_mr TEXT,
      default_rate REAL NOT NULL,
      unit TEXT DEFAULT 'piece',
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_category_tombstones (
      id TEXT PRIMARY KEY,
      name TEXT,
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_customer_tombstones (
      id TEXT PRIMARY KEY,
      mobile TEXT,
      deleted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      shop_id TEXT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT,
      pickup_address TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      area TEXT NOT NULL,
      building_name TEXT,
      flat_number TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      shop_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      pickup_address TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      area TEXT NOT NULL,
      pickup_date TEXT NOT NULL,
      pickup_time_slot TEXT,
      assigned_delivery_boy_id TEXT,
      assigned_at TEXT,
      assigned_by_user_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending', 
      -- 'pending', 'assigned', 'arriving', 'picked_up', 'in_processing', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'failed', 'cancelled'
      special_instructions TEXT,
      subtotal REAL DEFAULT 0,
      delivery_charge REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      final_total REAL DEFAULT 0,
      amount_paid REAL DEFAULT 0,
      outstanding_amount REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'unpaid', -- 'unpaid', 'partially_paid', 'paid'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_photos (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      photo_type TEXT NOT NULL, -- 'bag', 'clothes'
      file_path TEXT NOT NULL,
      file_url TEXT NOT NULL,
      uploaded_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      category_id TEXT,
      item_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      rate REAL NOT NULL,
      line_total REAL NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      order_id TEXT UNIQUE NOT NULL,
      shop_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      date TEXT NOT NULL,
      subtotal REAL NOT NULL,
      delivery_charge REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      final_total REAL NOT NULL,
      amount_paid REAL DEFAULT 0,
      outstanding_balance REAL NOT NULL,
      payment_status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      invoice_id TEXT,
      customer_id TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL, -- 'cash', 'upi', 'card', 'bank_transfer'
      transaction_reference TEXT,
      collected_by_delivery_boy_id TEXT,
      is_settled_with_shop INTEGER DEFAULT 0,
      settlement_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shop_settlements (
      id TEXT PRIMARY KEY,
      settlement_number TEXT UNIQUE NOT NULL,
      shop_id TEXT NOT NULL,
      delivery_boy_id TEXT NOT NULL,
      amount_collected REAL NOT NULL,
      amount_settled REAL NOT NULL,
      remaining_unsettled REAL NOT NULL,
      confirmed_by_user_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      delivery_boy_id TEXT NOT NULL,
      assigned_by_user_id TEXT NOT NULL,
      stage TEXT NOT NULL, -- 'pickup', 'delivery'
      assigned_at TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      status TEXT NOT NULL,
      changed_by_user_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whatsapp_logs (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      invoice_id TEXT,
      customer_id TEXT,
      phone TEXT NOT NULL,
      message_text TEXT NOT NULL,
      status TEXT NOT NULL, -- 'prepared', 'sent'
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  runMigrations();
  ensureDefaultShopsAndAreas();
}

export function runMigrations() {
  const safeAddColumn = (table: string, column: string, typeDef: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef};`);
    } catch {
      // Column already exists, safe to ignore
    }
  };

  // Orders table migrations for credit delivery and weight
  safeAddColumn('orders', 'expected_payment_date', 'TEXT');
  safeAddColumn('orders', 'credit_notes', 'TEXT');
  safeAddColumn('orders', 'delivery_type', "TEXT DEFAULT 'normal'");
  safeAddColumn('orders', 'pickup_weight_kg', 'INTEGER DEFAULT 0');
  safeAddColumn('orders', 'pickup_weight_grams', 'INTEGER DEFAULT 0');
  safeAddColumn('orders', 'pickup_weight_total_grams', 'INTEGER DEFAULT 0');
  safeAddColumn('orders', 'pickup_weight_rate', 'REAL DEFAULT 0');
  safeAddColumn('orders', 'pickup_photos', "TEXT DEFAULT '[]'");
  safeAddColumn('orders', 'pickup_proof_notes', 'TEXT');
  safeAddColumn('orders', 'clothes_summary', 'TEXT');
  safeAddColumn('orders', 'iron_count', 'INTEGER DEFAULT 0');
  safeAddColumn('orders', 'dryclean_count', 'INTEGER DEFAULT 0');
  safeAddColumn('orders', 'wash_count', 'INTEGER DEFAULT 0');
  safeAddColumn('orders', 'total_pieces', 'INTEGER DEFAULT 0');

  // Order items table migrations for kg and gram calculations and square feet
  safeAddColumn('order_items', 'unit', "TEXT DEFAULT 'piece'");
  safeAddColumn('order_items', 'weight_kg', 'REAL DEFAULT 0');
  safeAddColumn('order_items', 'weight_display', 'TEXT');
  safeAddColumn('order_items', 'weight_grams_total', 'INTEGER DEFAULT 0');
  safeAddColumn('order_items', 'sq_ft', 'REAL DEFAULT 0');
  safeAddColumn('order_items', 'sq_ft_length', 'REAL DEFAULT 0');
  safeAddColumn('order_items', 'sq_ft_width', 'REAL DEFAULT 0');

  // Order photos table migrations
  safeAddColumn('order_photos', 'caption', 'TEXT');

  // Invoices table migrations
  safeAddColumn('invoices', 'expected_payment_date', 'TEXT');
  safeAddColumn('invoices', 'credit_notes', 'TEXT');
  safeAddColumn('invoices', 'pickup_weight_display', 'TEXT');

  // Payment transactions table migrations for attribution
  safeAddColumn('payment_transactions', 'recorded_by_user_id', 'TEXT');
  safeAddColumn('payment_transactions', 'recorded_by_name', 'TEXT');
  safeAddColumn('payment_transactions', 'is_credit_settlement', 'INTEGER DEFAULT 0');
}

export function ensureDefaultShopsAndAreas() {
  const now = new Date().toISOString();

  // 1. Ensure the 4 service areas exist
  const defaultAreas = [
    { name: 'Warje', pincode: '411058', city: 'Pune' },
    { name: 'Kothrud', pincode: '411038', city: 'Pune' },
    { name: 'Karve Nagar', pincode: '411052', city: 'Pune' },
    { name: 'Bavdhan', pincode: '411021', city: 'Pune' }
  ];

  for (const a of defaultAreas) {
    const existing = db.prepare('SELECT id FROM service_areas WHERE name = ?').get(a.name) as { id: string } | undefined;
    if (!existing) {
      db.prepare(`
        INSERT INTO service_areas (id, name, pincode, city, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), a.name, a.pincode, a.city, now);
    }
  }

  // Helper to get area ID
  const getAreaId = (name: string) => {
    const row = db.prepare('SELECT id FROM service_areas WHERE name = ?').get(name) as { id: string } | undefined;
    return row?.id || null;
  };

  // 2. Ensure all 4 Shops of Friends Laundry & Dry Cleaners exist
  const defaultShops = [
    {
      code: 'FLD-WARJE',
      name: 'Friends Laundry & Dry Cleaners - Warje (Main Branch)',
      areaName: 'Warje',
      address: 'Shop No. 7, Prestige Point Building, Atul Nagar Phase 1, Near RMD College, Warje, Pune, Maharashtra 411058',
      phone: '8484890123 / 9822012345',
      upi_id: 'friendslaundry@upi'
    },
    {
      code: 'FLD-KOTHRUD',
      name: 'Friends Laundry & Dry Cleaners - Kothrud Branch',
      areaName: 'Kothrud',
      address: 'Shop No. 3, Swapnamandir Society, Near Karishma Society, Paud Road, Kothrud, Pune, Maharashtra 411038',
      phone: '8484890123',
      upi_id: 'friendslaundry@upi'
    },
    {
      code: 'FLD-KARVENAGAR',
      name: 'Friends Laundry & Dry Cleaners - Karve Nagar Branch',
      areaName: 'Karve Nagar',
      address: 'Shop No. 12, Rahul Complex, Near Cummins College, Karve Nagar, Pune, Maharashtra 411052',
      phone: '8484890123',
      upi_id: 'friendslaundry@upi'
    },
    {
      code: 'FLD-BAVDHAN',
      name: 'Friends Laundry & Dry Cleaners - Bavdhan Branch',
      areaName: 'Bavdhan',
      address: 'Shop No. 5, Crystal Empire, Near Chandani Chowk, NDA Road, Bavdhan, Pune, Maharashtra 411021',
      phone: '8484890123',
      upi_id: 'friendslaundry@upi'
    }
  ];

  for (const s of defaultShops) {
    const areaId = getAreaId(s.areaName);
    const existing = db.prepare('SELECT id, name FROM shops WHERE code = ?').get(s.code) as { id: string, name: string } | undefined;
    if (!existing) {
      db.prepare(`
        INSERT INTO shops (id, name, code, service_area_id, address, phone, upi_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), s.name, s.code, areaId, s.address, s.phone, s.upi_id, now, now);
    } else if (existing.name !== s.name) {
      db.prepare(`UPDATE shops SET name = ?, address = ?, phone = ?, updated_at = ? WHERE id = ?`)
        .run(s.name, s.address, s.phone, now, existing.id);
    }
  }

  // 3. Ensure clothing categories with standard rate card exist (ONLY if table is empty)
  const categoryCount = db.prepare('SELECT COUNT(*) as count FROM clothing_categories').get() as { count: number };
  if (categoryCount.count === 0) {
    const defaultCategories = [
      { name: 'Ironing (Press)', default_rate: 12, unit: 'piece', sort: 1 },
      { name: 'Dress', default_rate: 90, unit: 'piece', sort: 2 },
      { name: 'Dry Cleaning', default_rate: 70, unit: 'piece', sort: 3 },
      { name: 'Saree', default_rate: 80, unit: 'piece', sort: 4 },
      { name: 'Saree (Dry Cleaning)', default_rate: 250, unit: 'piece', sort: 5 },
      { name: 'Kurta (Dry Cleaning)', default_rate: 100, unit: 'piece', sort: 6 },
      { name: 'Jacket', default_rate: 150, unit: 'piece', sort: 7 },
      { name: 'Bedsheet (Ironing)', default_rate: 68, unit: 'piece', sort: 8 },
      { name: 'Wash & Fold (By Weight)', default_rate: 70, unit: 'kg', sort: 9 },
      { name: 'Wash & Iron (By Weight)', default_rate: 90, unit: 'kg', sort: 10 },
      { name: 'Curtains (By Sq Ft)', default_rate: 8, unit: 'sq_ft', sort: 11 },
      { name: 'Carpet / Rug (By Sq Ft)', default_rate: 25, unit: 'sq_ft', sort: 12 },
      { name: 'Shoes Cleaning', default_rate: 250, unit: 'piece', sort: 13 },
      { name: 'Helmet Cleaning', default_rate: 250, unit: 'piece', sort: 14 },
      { name: 'Shirt', default_rate: 25, unit: 'piece', sort: 15 },
      { name: 'T-Shirt', default_rate: 20, unit: 'piece', sort: 16 },
      { name: 'Pant / Trouser', default_rate: 30, unit: 'piece', sort: 17 },
      { name: 'Jeans', default_rate: 35, unit: 'piece', sort: 18 },
      { name: 'Kurta', default_rate: 40, unit: 'piece', sort: 19 },
      { name: 'Bed Sheet', default_rate: 70, unit: 'piece', sort: 20 },
      { name: 'Other Items', default_rate: 50, unit: 'piece', sort: 21 }
    ];

    for (const cat of defaultCategories) {
      db.prepare(`
        INSERT INTO clothing_categories (id, name, name_mr, default_rate, unit, is_active, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(crypto.randomUUID(), cat.name, cat.name, cat.default_rate, cat.unit || 'piece', cat.sort, now);
    }
  }

  // Trigger initial backup snapshot for guaranteed durability
  backupDatabase();
}

export function getAppSetting(key: string, defaultValue: string = ''): string {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setAppSetting(key: string, value: string): void {
  try {
    db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
    backupDatabase();
  } catch (e) {
    console.error('Failed to set app setting:', e);
  }
}

