import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

let pool: pg.Pool | null = null;
let isNeonConnected = false;

export function getNeonPool(): pg.Pool | null {
  const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  if (!pool) {
    try {
      pool = new Pool({
        connectionString,
        ssl: {
          rejectUnauthorized: false
        },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
      });

      pool.on('error', (err) => {
        console.error('[Neon Postgres] Unexpected client error:', err.message);
      });
    } catch (err: any) {
      console.warn('[Neon Postgres] Initialization warning:', err.message);
      return null;
    }
  }

  return pool;
}

export async function initNeonDatabase(): Promise<boolean> {
  const p = getNeonPool();
  if (!p) {
    console.log('[Neon Postgres] DATABASE_URL not set yet. Running on local SQLite WAL + Firebase Firestore.');
    return false;
  }

  try {
    const client = await p.connect();
    console.log('[Neon Postgres] Connected to Neon PostgreSQL successfully!');
    isNeonConnected = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email_or_phone TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        role TEXT NOT NULL,
        shop_id TEXT,
        service_area_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
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
        special_instructions TEXT,
        subtotal REAL DEFAULT 0,
        delivery_charge REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        discount_amount REAL DEFAULT 0,
        final_total REAL DEFAULT 0,
        amount_paid REAL DEFAULT 0,
        outstanding_amount REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'unpaid',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
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
        payment_method TEXT NOT NULL,
        transaction_reference TEXT,
        collected_by_delivery_boy_id TEXT,
        is_settled_with_shop INTEGER DEFAULT 0,
        settlement_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
      );
    `);

    client.release();
    return true;
  } catch (err: any) {
    console.error('[Neon Postgres] Setup error:', err.message);
    isNeonConnected = false;
    return false;
  }
}

/**
 * Execute a query on Neon PostgreSQL asynchronously (non-blocking)
 */
export async function queryNeon(text: string, params: any[] = []): Promise<any> {
  const p = getNeonPool();
  if (!p) return null;
  try {
    return await p.query(text, params);
  } catch (err: any) {
    console.warn('[Neon Postgres] Query warning:', err.message);
    return null;
  }
}

export function isNeonActive(): boolean {
  return isNeonConnected;
}
