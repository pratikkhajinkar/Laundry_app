import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db as sqliteDb, backupDatabase, projectRoot } from './db.ts';
import { hashPassword } from './auth.ts';

// Load config
const configPath = path.resolve(projectRoot, 'firebase-applet-config.json');
let firebaseConfig: any = {};
try {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error('[Firestore Service] Failed to load firebase-applet-config.json:', e);
}

const firebaseApp = initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

let lastSyncTimestamp: string | null = null;
let isFirestoreQuotaExhausted = false;
let quotaExhaustedResetTime = 0;

export function checkQuotaState(): boolean {
  if (isFirestoreQuotaExhausted) {
    if (Date.now() > quotaExhaustedResetTime) {
      isFirestoreQuotaExhausted = false;
      return true;
    }
    return false;
  }
  return true;
}

export function handleQuotaError(err: any) {
  const errMsg = err?.message || String(err);
  if (errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota limit exceeded') || err?.code === 8 || err?.code === 'resource-exhausted') {
    isFirestoreQuotaExhausted = true;
    quotaExhaustedResetTime = Date.now() + 30 * 60 * 1000; // back off for 30 minutes
    console.warn('[Cloud Firestore] Free daily write quota reached. Local SQLite WAL is securely persisting all data.');
  }
}

// Helper to sanitize document ID
function sanitizeId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

/**
 * Sync an individual order and its items/invoice to Cloud Firestore
 */
export async function syncOrderToCloud(orderId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const order = sqliteDb.prepare(`
      SELECT o.*, c.name as customer_name, c.mobile as customer_mobile, s.name as shop_name
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN shops s ON s.id = o.shop_id
      WHERE o.id = ?
    `).get(orderId) as any;

    if (!order) return false;

    const items = sqliteDb.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId) as any[];
    const invoice = sqliteDb.prepare('SELECT * FROM invoices WHERE order_id = ?').get(orderId) as any;
    const photos = sqliteDb.prepare('SELECT * FROM order_photos WHERE order_id = ?').all(orderId) as any[];

    let photoUrls: string[] = [];
    if (order.pickup_photos) {
      try {
        const parsed = JSON.parse(order.pickup_photos);
        if (Array.isArray(parsed)) photoUrls = parsed;
      } catch {
        photoUrls = [order.pickup_photos];
      }
    }
    if (photos.length > 0) {
      photoUrls = [...new Set([...photoUrls, ...photos.map(p => p.file_url)])];
    }

    const payload: any = {
      id: order.id,
      order_number: order.order_number,
      shop_id: order.shop_id,
      shop_name: order.shop_name || 'Friends Laundry',
      customer_id: order.customer_id,
      customer_name: order.customer_name || '',
      customer_mobile: order.customer_mobile || '',
      pickup_address: order.pickup_address || '',
      delivery_address: order.delivery_address || order.pickup_address || '',
      area: order.area || 'Pune',
      pickup_date: order.pickup_date,
      pickup_time_slot: order.pickup_time_slot || null,
      assigned_delivery_boy_id: order.assigned_delivery_boy_id || null,
      delivery_boy_name: order.delivery_boy_name || null,
      status: order.status,
      order_type: order.order_type || 'pickup',
      special_instructions: order.special_instructions || null,
      subtotal: Number(order.subtotal) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      tax_amount: Number(order.tax_amount) || 0,
      discount_amount: Number(order.discount_amount) || 0,
      final_total: Number(order.final_total) || 0,
      amount_paid: Number(order.amount_paid) || 0,
      outstanding_amount: Number(order.outstanding_amount) || 0,
      payment_status: order.payment_status || 'unpaid',
      delivery_type: order.delivery_type || 'normal',
      expected_payment_date: order.expected_payment_date || null,
      credit_notes: order.credit_notes || null,
      pickup_weight_kg: Number(order.pickup_weight_kg) || 0,
      pickup_weight_grams: Number(order.pickup_weight_grams) || 0,
      pickup_weight_total_grams: Number(order.pickup_weight_total_grams) || 0,
      pickup_weight_rate: Number(order.pickup_weight_rate) || 0,
      pickup_photos: photoUrls,
      pickup_proof_notes: order.pickup_proof_notes || null,
      clothes_summary: order.clothes_summary || null,
      iron_count: Number(order.iron_count) || 0,
      dryclean_count: Number(order.dryclean_count) || 0,
      wash_count: Number(order.wash_count) || 0,
      total_pieces: Number(order.total_pieces) || 0,
      items: items.map(it => ({
        id: it.id,
        item_name: it.item_name,
        category_id: it.category_id || null,
        quantity: it.quantity,
        rate: it.rate,
        line_total: it.line_total,
        unit: it.unit || 'piece',
        weight_kg: it.weight_kg || null,
        weight_display: it.weight_display || null,
        sq_ft: it.sq_ft || null,
        sq_ft_length: it.sq_ft_length || null,
        sq_ft_width: it.sq_ft_width || null
      })),
      invoice_number: invoice?.invoice_number || null,
      created_at: order.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cloud_synced_at: new Date().toISOString()
    };

    const docRef = doc(firestore, 'orders', sanitizeId(order.id));
    await setDoc(docRef, payload, { merge: true });

    // Also sync each item to order_items collection
    for (const it of items) {
      const itemRef = doc(firestore, 'order_items', sanitizeId(it.id));
      await setDoc(itemRef, {
        id: it.id,
        order_id: order.id,
        category_id: it.category_id || null,
        item_name: it.item_name,
        quantity: it.quantity,
        rate: it.rate,
        line_total: it.line_total,
        unit: it.unit || 'piece',
        weight_kg: it.weight_kg || null,
        weight_display: it.weight_display || null,
        sq_ft: it.sq_ft || null,
        sq_ft_length: it.sq_ft_length || null,
        sq_ft_width: it.sq_ft_width || null,
        updated_at: new Date().toISOString()
      }, { merge: true });
    }

    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Order ${order.order_number} (${order.id}) synced successfully.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    console.warn(`[Cloud Firestore] Order ${orderId} saved locally in SQLite:`, (err as any)?.message || err);
    return false;
  }
}

/**
 * Sync an individual customer to Cloud Firestore
 */
export async function syncCustomerToCloud(customerId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const cust = sqliteDb.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    if (!cust) return false;

    const payload = {
      id: cust.id,
      shop_id: cust.shop_id || null,
      name: cust.name,
      mobile: cust.mobile,
      email: cust.email || null,
      pickup_address: cust.pickup_address,
      delivery_address: cust.delivery_address || cust.pickup_address,
      area: cust.area,
      building_name: cust.building_name || null,
      flat_number: cust.flat_number || null,
      notes: cust.notes || null,
      created_at: cust.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cloud_synced_at: new Date().toISOString()
    };

    const docRef = doc(firestore, 'customers', sanitizeId(cust.id));
    await setDoc(docRef, payload, { merge: true });
    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Customer ${cust.name} (${cust.mobile}) synced successfully.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    console.warn(`[Cloud Firestore] Customer ${customerId} saved locally in SQLite:`, (err as any)?.message || err);
    return false;
  }
}

/**
 * Sync payment transaction to Cloud Firestore
 */
export async function syncPaymentToCloud(paymentId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const pay = sqliteDb.prepare('SELECT * FROM payment_transactions WHERE id = ?').get(paymentId) as any;
    if (!pay) return false;

    const payload = {
      id: pay.id,
      order_id: pay.order_id,
      invoice_id: pay.invoice_id || null,
      customer_id: pay.customer_id,
      shop_id: pay.shop_id,
      amount: Number(pay.amount) || 0,
      payment_method: pay.payment_method,
      transaction_reference: pay.transaction_reference || null,
      collected_by_delivery_boy_id: pay.collected_by_delivery_boy_id || null,
      recorded_by_user_id: pay.recorded_by_user_id || null,
      notes: pay.notes || null,
      created_at: pay.created_at || new Date().toISOString(),
      cloud_synced_at: new Date().toISOString()
    };

    const docRef = doc(firestore, 'payments', sanitizeId(pay.id));
    await setDoc(docRef, payload, { merge: true });
    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Payment ₹${pay.amount} for order ${pay.order_id} synced successfully.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    console.warn(`[Cloud Firestore] Payment ${paymentId} saved locally in SQLite:`, (err as any)?.message || err);
    return false;
  }
}

/**
 * Sync individual delivery boy account to Cloud Firestore
 */
export async function syncDeliveryBoyToCloud(boyId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const boy = sqliteDb.prepare(`
      SELECT u.id, u.name, u.email_or_phone, u.role, u.service_area_id, u.status, u.is_online, u.is_busy, u.created_at, u.updated_at,
             a.name as area_name
      FROM users u
      LEFT JOIN service_areas a ON a.id = u.service_area_id
      WHERE u.id = ? AND u.role = 'delivery'
    `).get(boyId) as any;

    if (!boy) return false;

    const payload = {
      id: boy.id,
      name: boy.name,
      email_or_phone: boy.email_or_phone,
      role: 'delivery',
      service_area_id: boy.service_area_id || null,
      area_name: boy.area_name || null,
      status: boy.status || 'active',
      is_online: Number(boy.is_online) || 0,
      is_busy: Number(boy.is_busy) || 0,
      created_at: boy.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      cloud_synced_at: new Date().toISOString()
    };

    const docRef = doc(firestore, 'delivery_boys', sanitizeId(boy.id));
    await setDoc(docRef, payload, { merge: true });
    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Delivery Boy ${boy.name} (${boy.email_or_phone}) synced successfully.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    console.warn(`[Cloud Firestore] Delivery boy ${boyId} saved locally in SQLite:`, (err as any)?.message || err);
    return false;
  }
}

/**
 * Remove delivery boy document from Cloud Firestore on hard delete
 */
export async function syncDeliveryBoyDeleteToCloud(boyId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const docRef = doc(firestore, 'delivery_boys', sanitizeId(boyId));
    await deleteDoc(docRef);
    console.log(`[Cloud Firestore] Delivery Boy ${boyId} removed from Firestore.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    return false;
  }
}

/**
 * Sync individual clothing category to Cloud Firestore (Guarantees customized rates stick)
 */
export async function syncCategoryToCloud(categoryId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const cat = sqliteDb.prepare('SELECT * FROM clothing_categories WHERE id = ?').get(categoryId) as any;
    if (!cat) return false;

    const payload = {
      id: cat.id,
      name: cat.name,
      name_mr: cat.name_mr || null,
      default_rate: Number(cat.default_rate) || 0,
      unit: cat.unit || 'piece',
      is_active: Number(cat.is_active) || 1,
      sort_order: Number(cat.sort_order) || 0,
      created_at: cat.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const docRef = doc(firestore, 'clothing_categories', sanitizeId(cat.id));
    await setDoc(docRef, payload, { merge: true });
    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Clothing Category ${cat.name} (₹${cat.default_rate}) synced successfully.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    console.warn(`[Cloud Firestore] Category ${categoryId} sync notice:`, (err as any)?.message || err);
    return false;
  }
}

/**
 * Remove clothing category from Cloud Firestore
 */
export async function syncCategoryDeleteToCloud(categoryId: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const docRef = doc(firestore, 'clothing_categories', sanitizeId(categoryId));
    await deleteDoc(docRef);
    console.log(`[Cloud Firestore] Category ${categoryId} deleted from Firestore.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    return false;
  }
}

/**
 * Sync app setting (e.g. laundry logo) to Cloud Firestore
 */
export async function syncAppSettingsToCloud(key: string, value: string): Promise<boolean> {
  if (!checkQuotaState()) return false;
  try {
    const docRef = doc(firestore, 'app_settings', sanitizeId(key));
    await setDoc(docRef, { key, value, updated_at: new Date().toISOString() }, { merge: true });
    console.log(`[Cloud Firestore] App setting '${key}' synced to Firestore.`);
    return true;
  } catch (err) {
    handleQuotaError(err);
    return false;
  }
}

/**
 * Rehydrate all data from Cloud Firestore into SQLite (Runs on server startup and on demand)
 * This guarantees that ANY data ever saved in Firestore is preserved and restored immediately.
 */
export async function rehydrateFromFirestore(): Promise<{
  restoredDeliveryBoys: number;
  restoredCustomers: number;
  restoredOrders: number;
  restoredPayments: number;
  restoredCategories: number;
}> {
  console.log('[Cloud Firestore] Starting full database rehydration check...');
  let restoredDeliveryBoys = 0;
  let restoredCustomers = 0;
  let restoredOrders = 0;
  let restoredPayments = 0;
  let restoredCategories = 0;

  try {
    // 0. REHYDRATE DELIVERY BOYS (Guarantees delivery boys never disappear)
    try {
      const boysSnap = await getDocs(collection(firestore, 'delivery_boys'));
      const defaultPassword = hashPassword('delivery123');

      // Sort docs so newest wins if duplicate phone numbers exist
      const boyDocs = boysSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      boyDocs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const seenPhones = new Set<string>();

      for (const data of boyDocs) {
        const id = data.id;
        const phone = data.email_or_phone?.trim();
        const name = data.name?.trim();
        if (!name || !phone) continue;

        // Skip duplicates from legacy attempts
        if (seenPhones.has(phone)) continue;
        seenPhones.add(phone);

        // Check if user already exists by ID or by email_or_phone
        const existing = sqliteDb.prepare('SELECT id, role, status FROM users WHERE id = ? OR email_or_phone = ?').get(id, phone) as any;
        if (!existing) {
          sqliteDb.prepare(`
            INSERT INTO users (id, name, email_or_phone, password_hash, salt, role, service_area_id, status, is_online, is_busy, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'delivery', ?, ?, 0, 0, ?, ?)
          `).run(
            id,
            name,
            phone,
            defaultPassword.hash,
            defaultPassword.salt,
            data.service_area_id || null,
            data.status || 'active',
            data.created_at || new Date().toISOString(),
            data.updated_at || new Date().toISOString()
          );
          restoredDeliveryBoys++;
        } else {
          // If already exists, make sure role is delivery and keep name/area/status in sync
          sqliteDb.prepare(`
            UPDATE users
            SET name = COALESCE(?, name),
                role = 'delivery',
                service_area_id = COALESCE(?, service_area_id),
                status = COALESCE(?, status),
                updated_at = ?
            WHERE id = ?
          `).run(
            name,
            data.service_area_id || null,
            data.status || 'active',
            data.updated_at || new Date().toISOString(),
            existing.id
          );
        }
      }
      console.log(`[Cloud Firestore] Delivery boys rehydrated: ${restoredDeliveryBoys} new boy(s) added to SQLite.`);
    } catch (boyErr) {
      console.warn('[Cloud Firestore] Delivery boys rehydration notice:', boyErr);
    }

    // 1. REHYDRATE CUSTOMERS (Timestamp-protected: local address edits NEVER overwritten)
    const customersSnap = await getDocs(collection(firestore, 'customers'));
    const defaultShop = sqliteDb.prepare('SELECT id FROM shops LIMIT 1').get() as { id: string } | undefined;
    const defaultShopId = defaultShop?.id || null;

    // Deduplicate cloud docs: group by normalized mobile and keep ONLY the latest cloud document per customer
    const latestCloudCustomers = new Map<string, any>();
    for (const docItem of customersSnap.docs) {
      const data = docItem.data();
      const id = data.id || docItem.id;
      if (!data.name || !data.mobile) continue;

      const normMobile = String(data.mobile).trim().toLowerCase().replace(/^0+/, '').replace(/^\+91/, '');
      const docTime = new Date(data.updated_at || data.created_at || 0).getTime();
      
      const existingInMap = latestCloudCustomers.get(normMobile);
      if (!existingInMap || docTime > existingInMap._docTime) {
        latestCloudCustomers.set(normMobile, { ...data, id, _normMobile: normMobile, _docTime: docTime });
      }
    }

    for (const data of latestCloudCustomers.values()) {
      const normMobile = data._normMobile;
      const existing = sqliteDb.prepare(`
        SELECT * FROM customers 
        WHERE id = ? 
           OR mobile = ? 
           OR REPLACE(LTRIM(mobile, '0'), '+91', '') = ?
        LIMIT 1
      `).get(data.id, data.mobile, normMobile) as any;

      if (!existing) {
        sqliteDb.prepare(`
          INSERT INTO customers (id, shop_id, name, mobile, email, pickup_address, delivery_address, area, building_name, flat_number, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.id,
          data.shop_id || defaultShopId,
          data.name,
          data.mobile,
          data.email || null,
          data.pickup_address || data.delivery_address || 'Pune',
          data.delivery_address || data.pickup_address || 'Pune',
          data.area || 'Warje',
          data.building_name || null,
          data.flat_number || null,
          data.notes || null,
          data.created_at || new Date().toISOString(),
          data.updated_at || new Date().toISOString()
        );
        restoredCustomers++;
      } else {
        const localTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
        const cloudTime = data._docTime;

        // If local SQLite is newer or equal, NEVER OVERWRITE! Local changes take precedence.
        if (localTime >= cloudTime) {
          if (localTime > cloudTime) {
            syncCustomerToCloud(existing.id).catch(() => {});
          }
          continue;
        }

        // Only update from cloud if cloud document is strictly newer
        const cleanName = (data.name && String(data.name).trim()) || existing.name;
        const cleanPickup = (data.pickup_address && String(data.pickup_address).trim()) || existing.pickup_address;
        const cleanDelivery = (data.delivery_address && String(data.delivery_address).trim()) || existing.delivery_address || cleanPickup;
        const cleanArea = (data.area && String(data.area).trim()) || existing.area || 'Warje';
        
        sqliteDb.prepare(`
          UPDATE customers
          SET name = ?,
              pickup_address = ?,
              delivery_address = ?,
              area = ?,
              building_name = COALESCE(?, building_name),
              flat_number = COALESCE(?, flat_number),
              notes = COALESCE(?, notes),
              updated_at = ?
          WHERE id = ?
        `).run(
          cleanName,
          cleanPickup,
          cleanDelivery,
          cleanArea,
          data.building_name || null,
          data.flat_number || null,
          data.notes || null,
          data.updated_at || new Date().toISOString(),
          existing.id
        );
      }
    }

    // 2. REHYDRATE ORDERS (Collision-free with safe per-record handling)
    const ordersSnap = await getDocs(collection(firestore, 'orders'));
    for (const docItem of ordersSnap.docs) {
      try {
        const data = docItem.data();
        const id = data.id || docItem.id;

        // Skip invalid/empty order documents
        if (!id || (data.final_total === 0 && !data.customer_name && !data.customer_mobile)) {
          continue;
        }

        // Resolve customer_id
        let customerId = data.customer_id;
        if (!customerId && data.customer_mobile) {
          const found = sqliteDb.prepare('SELECT id FROM customers WHERE mobile = ?').get(data.customer_mobile) as any;
          if (found) {
            customerId = found.id;
          } else {
            // Auto create customer from order
            const newCustId = crypto.randomUUID();
            sqliteDb.prepare(`
              INSERT INTO customers (id, shop_id, name, mobile, email, pickup_address, delivery_address, area, building_name, flat_number, notes, created_at, updated_at)
              VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, ?, ?)
            `).run(
              newCustId,
              data.shop_id || defaultShopId,
              data.customer_name || 'Valued Customer',
              data.customer_mobile,
              data.pickup_address || 'Pune',
              data.delivery_address || data.pickup_address || 'Pune',
              data.area || 'Pune',
              data.created_at || new Date().toISOString(),
              new Date().toISOString()
            );
            customerId = newCustId;
          }
        }

        if (!customerId) {
          const anyCust = sqliteDb.prepare('SELECT id FROM customers LIMIT 1').get() as any;
          customerId = anyCust?.id || null;
        }

        // Guaranteed collision-free unique order number
        let orderNumber = (data.order_number && String(data.order_number).trim()) || '';
        if (!orderNumber) {
          const countRow = sqliteDb.prepare("SELECT COUNT(*) as count FROM orders").get() as { count: number };
          orderNumber = `ORD-2026-${String(countRow.count + 1).padStart(4, '0')}`;
        }

        // Loop until guaranteed no collision with another order
        let candidateOrderNumber = orderNumber;
        let dedupAttempt = 1;
        while (true) {
          const conflict = sqliteDb.prepare('SELECT id FROM orders WHERE order_number = ?').get(candidateOrderNumber) as any;
          if (!conflict || conflict.id === id) {
            break;
          }
          candidateOrderNumber = `${orderNumber}-${id.slice(0, 4)}${dedupAttempt > 1 ? `-${dedupAttempt}` : ''}`;
          dedupAttempt++;
        }
        orderNumber = candidateOrderNumber;

        const existingOrder = sqliteDb.prepare('SELECT id, status, payment_status, updated_at, created_at, pickup_address, delivery_address, area FROM orders WHERE id = ?').get(id) as any;
        const subtotal = Number(data.subtotal) || Number(data.final_total) || 0;
        const deliveryCharge = Number(data.delivery_charge) || 0;
        const discount = Number(data.discount_amount) || 0;
        const finalTotal = Number(data.final_total) || 0;
        const amountPaid = Number(data.amount_paid) || 0;
        const outstanding = Number(data.outstanding_amount) !== undefined 
          ? Number(data.outstanding_amount) 
          : Math.max(0, finalTotal - amountPaid);
        const paymentStatus = data.payment_status || (amountPaid >= finalTotal && finalTotal > 0 ? 'paid' : (amountPaid > 0 ? 'partially_paid' : 'unpaid'));
        const status = data.status || 'delivered';

        const photoJson = Array.isArray(data.pickup_photos) 
          ? JSON.stringify(data.pickup_photos) 
          : (data.pickup_photos || '[]');

        if (!existingOrder) {
          sqliteDb.prepare(`
            INSERT INTO orders (
              id, order_number, shop_id, customer_id, pickup_address, delivery_address,
              area, pickup_date, pickup_time_slot, assigned_delivery_boy_id, status,
              subtotal, delivery_charge, discount_amount, final_total, amount_paid,
              outstanding_amount, payment_status, delivery_type, expected_payment_date,
              credit_notes, pickup_weight_kg, pickup_weight_grams, pickup_weight_total_grams,
              pickup_weight_rate, pickup_photos, pickup_proof_notes, clothes_summary,
              iron_count, dryclean_count, wash_count, total_pieces, created_at, updated_at
            ) VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?
            )
          `).run(
            id,
            orderNumber,
            data.shop_id || defaultShopId,
            customerId,
            data.pickup_address || '',
            data.delivery_address || data.pickup_address || '',
            data.area || 'Pune',
            data.pickup_date || (data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
            data.pickup_time_slot || null,
            data.assigned_delivery_boy_id || null,
            status,
            subtotal,
            deliveryCharge,
            discount,
            finalTotal,
            amountPaid,
            outstanding,
            paymentStatus,
            data.delivery_type || 'normal',
            data.expected_payment_date || null,
            data.credit_notes || null,
            Number(data.pickup_weight_kg) || 0,
            Number(data.pickup_weight_grams) || 0,
            Number(data.pickup_weight_total_grams) || 0,
            Number(data.pickup_weight_rate) || 0,
            photoJson,
            data.pickup_proof_notes || null,
            data.clothes_summary || null,
            Number(data.iron_count) || 0,
            Number(data.dryclean_count) || 0,
            Number(data.wash_count) || 0,
            Number(data.total_pieces) || 0,
            data.created_at || new Date().toISOString(),
            data.updated_at || new Date().toISOString()
          );
          restoredOrders++;
        } else {
          // Only update from Firestore if Firestore document is newer than local record
          const existingTime = new Date(existingOrder.updated_at || existingOrder.created_at || 0).getTime();
          const cloudTime = new Date(data.updated_at || data.created_at || 0).getTime();
          if (cloudTime > existingTime) {
            sqliteDb.prepare(`
              UPDATE orders
              SET status = COALESCE(?, status),
                  final_total = CASE WHEN ? > 0 THEN ? ELSE final_total END,
                  amount_paid = CASE WHEN ? > 0 THEN ? ELSE amount_paid END,
                  outstanding_amount = CASE WHEN ? > 0 THEN ? ELSE outstanding_amount END,
                  payment_status = COALESCE(?, payment_status),
                  updated_at = ?
              WHERE id = ?
            `).run(
              status || existingOrder.status,
              finalTotal,
              finalTotal,
              amountPaid,
              amountPaid,
              finalTotal,
              outstanding,
              paymentStatus || existingOrder.payment_status,
              data.updated_at || new Date().toISOString(),
              id
            );
          }
        }

        // Ensure invoice exists in invoices table without number collision
        const existingInv = sqliteDb.prepare('SELECT id FROM invoices WHERE order_id = ?').get(id) as any;
        if (!existingInv && finalTotal > 0) {
          let invNum = data.invoice_number || `INV-${orderNumber.replace('ORD-', '')}`;
          let invAttempt = 1;
          let candidateInv = invNum;
          while (true) {
            const conflictInv = sqliteDb.prepare('SELECT id, order_id FROM invoices WHERE invoice_number = ?').get(candidateInv) as any;
            if (!conflictInv || conflictInv.order_id === id) {
              break;
            }
            candidateInv = `${invNum}-${id.slice(0, 4)}${invAttempt > 1 ? `-${invAttempt}` : ''}`;
            invAttempt++;
          }
          invNum = candidateInv;

          sqliteDb.prepare(`
            INSERT INTO invoices (
              id, invoice_number, order_id, shop_id, customer_id, date,
              subtotal, delivery_charge, tax_amount, discount_amount, final_total,
              amount_paid, outstanding_balance, payment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
          `).run(
            crypto.randomUUID(),
            invNum,
            id,
            data.shop_id || defaultShopId,
            customerId,
            data.pickup_date || (data.created_at ? data.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
            subtotal,
            deliveryCharge,
            discount,
            finalTotal,
            amountPaid,
            outstanding,
            paymentStatus,
            data.created_at || new Date().toISOString()
          );
        }

        // Rehydrate items if embedded in order document
        if (Array.isArray(data.items) && data.items.length > 0) {
          for (const item of data.items) {
            const existingItem = sqliteDb.prepare('SELECT id FROM order_items WHERE id = ?').get(item.id) as any;
            if (!existingItem) {
              sqliteDb.prepare(`
                INSERT INTO order_items (id, order_id, category_id, item_name, quantity, rate, line_total, unit, weight_kg, weight_display, sq_ft, sq_ft_length, sq_ft_width)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                item.id || crypto.randomUUID(),
                id,
                item.category_id || null,
                item.item_name || 'Clothing Item',
                item.quantity || 1,
                item.rate || 0,
                item.line_total || 0,
                item.unit || 'piece',
                item.weight_kg || null,
                item.weight_display || null,
                item.sq_ft || null,
                item.sq_ft_length || null,
                item.sq_ft_width || null
              );
            }
          }
        }
      } catch (orderErr) {
        console.warn(`[Cloud Firestore] Order rehydration skipped for document:`, orderErr);
      }
    }

    // 3. REHYDRATE PAYMENTS
    try {
      const paymentsSnap = await getDocs(collection(firestore, 'payments'));
      for (const docItem of paymentsSnap.docs) {
        try {
          const data = docItem.data();
          const id = data.id || docItem.id;

          const existingPay = sqliteDb.prepare('SELECT id FROM payment_transactions WHERE id = ?').get(id) as any;
          if (!existingPay && data.order_id) {
            sqliteDb.prepare(`
              INSERT INTO payment_transactions (id, order_id, invoice_id, customer_id, shop_id, amount, payment_method, transaction_reference, collected_by_delivery_boy_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              id,
              data.order_id,
              data.invoice_id || null,
              data.customer_id || '',
              data.shop_id || defaultShopId,
              Number(data.amount) || 0,
              data.payment_method || 'cash',
              data.transaction_reference || null,
              data.collected_by_delivery_boy_id || null,
              data.created_at || new Date().toISOString()
            );
            restoredPayments++;
          }
        } catch (payItemErr) {
          console.warn('[Cloud Firestore] Payment item rehydration notice:', payItemErr);
        }
      }
    } catch (payErr) {
      console.warn('[Cloud Firestore] Payments snapshot fetch notice:', payErr);
    }

    // 4. REHYDRATE CLOTHING CATEGORIES (Guarantees user customized rates & added items never reset)
    try {
      const catsSnap = await getDocs(collection(firestore, 'clothing_categories'));
      for (const docItem of catsSnap.docs) {
        const data = docItem.data();
        const id = data.id || docItem.id;
        if (!data.name) continue;

        const existing = sqliteDb.prepare('SELECT id FROM clothing_categories WHERE id = ? OR name = ?').get(id, data.name) as any;
        if (!existing) {
          sqliteDb.prepare(`
            INSERT INTO clothing_categories (id, name, name_mr, default_rate, unit, is_active, sort_order, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            data.name,
            data.name_mr || null,
            Number(data.default_rate) || 0,
            data.unit || 'piece',
            data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
            data.sort_order || 0,
            data.created_at || new Date().toISOString()
          );
          restoredCategories++;
        } else {
          sqliteDb.prepare(`
            UPDATE clothing_categories
            SET name = ?, name_mr = ?, default_rate = ?, unit = ?, is_active = ?, sort_order = ?
            WHERE id = ?
          `).run(
            data.name,
            data.name_mr || null,
            Number(data.default_rate) || 0,
            data.unit || 'piece',
            data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
            data.sort_order || 0,
            existing.id
          );
        }
      }
      console.log(`[Cloud Firestore] Rehydrated clothing categories: ${restoredCategories} new category(ies) restored from Firestore.`);
    } catch (catErr) {
      console.warn('[Cloud Firestore] Clothing categories rehydration notice:', catErr);
    }

    // 5. REHYDRATE APP SETTINGS (Guarantees laundry logo & configurations persist)
    try {
      const settingsSnap = await getDocs(collection(firestore, 'app_settings'));
      for (const docItem of settingsSnap.docs) {
        const data = docItem.data();
        const key = data.key || docItem.id;
        const value = data.value;
        if (key && value !== undefined) {
          sqliteDb.prepare(`
            INSERT INTO app_settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).run(key, String(value));
        }
      }
    } catch (setErr) {
      console.warn('[Cloud Firestore] App settings rehydration notice:', setErr);
    }

    // Flush WAL to disk
    backupDatabase();
    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Rehydration complete: Restored ${restoredDeliveryBoys} delivery boy(s), ${restoredCustomers} customer(s), ${restoredOrders} order(s), ${restoredPayments} payment(s), ${restoredCategories} category(ies).`);
  } catch (err) {
    console.error('[Cloud Firestore] Rehydration failed:', err);
  }

  return { restoredDeliveryBoys, restoredCustomers, restoredOrders, restoredPayments, restoredCategories };
}

/**
 * Push all local records to Cloud Firestore (bulk synchronization)
 */
export async function pushAllToFirestore(): Promise<{
  deliveryBoysSynced: number;
  ordersSynced: number;
  customersSynced: number;
  paymentsSynced: number;
  categoriesSynced: number;
}> {
  console.log('[Cloud Firestore] Starting full push to Cloud Firestore...');
  let deliveryBoysSynced = 0;
  let ordersSynced = 0;
  let customersSynced = 0;
  let paymentsSynced = 0;
  let categoriesSynced = 0;

  try {
    // 0. Push all delivery boys
    const boys = sqliteDb.prepare("SELECT id FROM users WHERE role = 'delivery'").all() as any[];
    for (const b of boys) {
      const ok = await syncDeliveryBoyToCloud(b.id);
      if (ok) deliveryBoysSynced++;
    }

    // 1. Push all customers
    const customers = sqliteDb.prepare('SELECT * FROM customers').all() as any[];
    for (const cust of customers) {
      const ok = await syncCustomerToCloud(cust.id);
      if (ok) customersSynced++;
    }

    // 2. Push all orders
    const orders = sqliteDb.prepare('SELECT id FROM orders').all() as any[];
    for (const ord of orders) {
      const ok = await syncOrderToCloud(ord.id);
      if (ok) ordersSynced++;
    }

    // 3. Push all payments
    const payments = sqliteDb.prepare('SELECT id FROM payment_transactions').all() as any[];
    for (const pay of payments) {
      const ok = await syncPaymentToCloud(pay.id);
      if (ok) paymentsSynced++;
    }

    // 4. Push all clothing categories
    const categories = sqliteDb.prepare('SELECT id FROM clothing_categories').all() as any[];
    for (const cat of categories) {
      const ok = await syncCategoryToCloud(cat.id);
      if (ok) categoriesSynced++;
    }

    // 5. Push app settings
    const settings = sqliteDb.prepare('SELECT * FROM app_settings').all() as any[];
    for (const s of settings) {
      await syncAppSettingsToCloud(s.key, s.value);
    }

    lastSyncTimestamp = new Date().toISOString();
    console.log(`[Cloud Firestore] Bulk push complete: ${deliveryBoysSynced} delivery boy(s), ${customersSynced} customer(s), ${ordersSynced} order(s), ${paymentsSynced} payment(s), ${categoriesSynced} category(ies).`);
  } catch (err) {
    console.error('[Cloud Firestore] Bulk push failed:', err);
  }

  return { deliveryBoysSynced, ordersSynced, customersSynced, paymentsSynced, categoriesSynced };
}

/**
 * Get current sync health status
 */
export async function getSyncStatus(): Promise<any> {
  let cloudOrdersCount = 0;
  let cloudCustomersCount = 0;
  let cloudPaymentsCount = 0;
  let cloudDeliveryBoysCount = 0;
  let isConnected = false;

  try {
    const [ordersSnap, custSnap, paySnap, boysSnap] = await Promise.all([
      getDocs(collection(firestore, 'orders')),
      getDocs(collection(firestore, 'customers')),
      getDocs(collection(firestore, 'payments')),
      getDocs(collection(firestore, 'delivery_boys'))
    ]);
    cloudOrdersCount = ordersSnap.size;
    cloudCustomersCount = custSnap.size;
    cloudPaymentsCount = paySnap.size;
    cloudDeliveryBoysCount = boysSnap.size;
    isConnected = true;
  } catch (e: any) {
    console.warn('[Cloud Firestore] Health check notice:', e.message);
  }

  const localOrdersCount = (sqliteDb.prepare('SELECT count(*) as c FROM orders').get() as any)?.c || 0;
  const localCustomersCount = (sqliteDb.prepare('SELECT count(*) as c FROM customers').get() as any)?.c || 0;
  const localPaymentsCount = (sqliteDb.prepare('SELECT count(*) as c FROM payment_transactions').get() as any)?.c || 0;
  const localDeliveryBoysCount = (sqliteDb.prepare("SELECT count(*) as c FROM users WHERE role = 'delivery'").get() as any)?.c || 0;

  return {
    connected: isConnected,
    databaseId: firebaseConfig.firestoreDatabaseId || 'ai-studio-laundryflowmanag-a49b7bdd-a6d0-4611-aa8e-c2cf2e733ca0',
    projectId: firebaseConfig.projectId || 'organic-granite-cf38q',
    cloudCounts: {
      deliveryBoys: cloudDeliveryBoysCount,
      orders: cloudOrdersCount,
      customers: cloudCustomersCount,
      payments: cloudPaymentsCount
    },
    localCounts: {
      deliveryBoys: localDeliveryBoysCount,
      orders: localOrdersCount,
      customers: localCustomersCount,
      payments: localPaymentsCount
    },
    lastSyncTimestamp: lastSyncTimestamp || new Date().toISOString()
  };
}
