import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  getDocs, 
  query,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.ts';
import type { Order, Customer, User, ClothingCategory, Shop } from '../types/index.ts';

// Sanitize document IDs to prevent Firestore invalid characters
function sanitizeDocId(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_\-]/g, '_');
}

let isClientQuotaExhausted = false;
let clientQuotaResetTime = 0;

function canSync(): boolean {
  if (isClientQuotaExhausted) {
    if (Date.now() > clientQuotaResetTime) {
      isClientQuotaExhausted = false;
      return true;
    }
    return false;
  }
  return true;
}

function handleClientQuotaError(err: any) {
  const msg = err?.message || String(err);
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Quota limit exceeded') || err?.code === 'resource-exhausted' || err?.code === 8) {
    isClientQuotaExhausted = true;
    clientQuotaResetTime = Date.now() + 30 * 60 * 1000;
    console.warn('[Firestore] Daily free write quota reached. System is running securely on local database backend.');
  }
}

/**
 * Persist an Order record directly to Firebase Firestore
 */
export async function syncOrderToFirestore(order: Partial<Order> & { id: string }) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'orders', sanitizeDocId(order.id));
    const payload: any = {
      id: order.id,
      updated_at: new Date().toISOString()
    };
    if (order.order_number !== undefined) payload.order_number = order.order_number;
    if (order.customer_id !== undefined) payload.customer_id = order.customer_id;
    if (order.customer_name !== undefined) payload.customer_name = order.customer_name;
    if (order.customer_mobile !== undefined) payload.customer_mobile = order.customer_mobile;
    if (order.shop_id !== undefined) payload.shop_id = order.shop_id;
    if (order.shop_name !== undefined) payload.shop_name = order.shop_name;
    if (order.status !== undefined) payload.status = order.status;
    if (order.order_type !== undefined) payload.order_type = order.order_type;
    if (order.pickup_address !== undefined) payload.pickup_address = order.pickup_address;
    if (order.delivery_address !== undefined) payload.delivery_address = order.delivery_address;
    if (order.area !== undefined) payload.area = order.area;
    if (order.pickup_weight_kg !== undefined) payload.pickup_weight_kg = Number(order.pickup_weight_kg) || 0;
    if (order.pickup_weight_grams !== undefined) payload.pickup_weight_grams = Number(order.pickup_weight_grams) || 0;
    if (order.pickup_weight_total_grams !== undefined) payload.pickup_weight_total_grams = Number(order.pickup_weight_total_grams) || 0;
    if (order.pickup_weight_rate !== undefined) payload.pickup_weight_rate = Number(order.pickup_weight_rate) || 0;
    if (order.pickup_photos !== undefined) payload.pickup_photos = order.pickup_photos;
    if (order.final_total !== undefined) payload.final_total = Number(order.final_total) || 0;
    if (order.subtotal !== undefined) payload.subtotal = Number(order.subtotal) || 0;
    if (order.delivery_charge !== undefined) payload.delivery_charge = Number(order.delivery_charge) || 0;
    if (order.discount_amount !== undefined) payload.discount_amount = Number(order.discount_amount) || 0;
    if (order.amount_paid !== undefined) payload.amount_paid = Number(order.amount_paid) || 0;
    if (order.outstanding_amount !== undefined) payload.outstanding_amount = Number(order.outstanding_amount) || 0;
    if (order.payment_status !== undefined) payload.payment_status = order.payment_status;
    if (order.assigned_delivery_boy_id !== undefined) payload.assigned_delivery_boy_id = order.assigned_delivery_boy_id;
    if (order.delivery_boy_name !== undefined) payload.delivery_boy_name = order.delivery_boy_name;
    if (order.created_at !== undefined) payload.created_at = order.created_at;

    await setDoc(docRef, payload, { merge: true });
    console.log(`[Firestore] Order ${order.id} synced successfully`);
  } catch (error) {
    handleClientQuotaError(error);
    console.warn(`[Firestore] Order ${order.id} saved to primary backend:`, (error as any)?.message || error);
  }
}

/**
 * Persist a Customer record to Firestore
 */
export async function syncCustomerToFirestore(customer: Partial<Customer> & { id: string }) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'customers', sanitizeDocId(customer.id));
    const payload: any = {
      id: customer.id,
      updated_at: new Date().toISOString()
    };
    if (customer.name !== undefined) payload.name = customer.name;
    if (customer.mobile !== undefined) payload.mobile = customer.mobile;
    if (customer.email !== undefined) payload.email = customer.email;
    if (customer.area !== undefined) payload.area = customer.area;
    if (customer.pickup_address !== undefined) payload.pickup_address = customer.pickup_address;
    if (customer.delivery_address !== undefined) payload.delivery_address = customer.delivery_address;
    if (customer.building_name !== undefined) payload.building_name = customer.building_name;
    if (customer.flat_number !== undefined) payload.flat_number = customer.flat_number;
    if (customer.notes !== undefined) payload.notes = customer.notes;
    if (customer.created_at !== undefined) payload.created_at = customer.created_at;

    await setDoc(docRef, payload, { merge: true });
    console.log(`[Firestore] Customer ${customer.id} synced successfully`);
  } catch (error) {
    handleClientQuotaError(error);
    console.warn(`[Firestore] Customer ${customer.id} saved to primary backend:`, (error as any)?.message || error);
  }
}

/**
 * Persist a Delivery Boy account to Firestore
 */
export async function syncDeliveryBoyToFirestore(boy: Partial<User> & { id: string }) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'delivery_boys', sanitizeDocId(boy.id));
    const payload: any = {
      id: boy.id,
      role: 'delivery',
      updated_at: new Date().toISOString()
    };
    if (boy.name !== undefined) payload.name = boy.name;
    if (boy.email_or_phone !== undefined) payload.email_or_phone = boy.email_or_phone;
    if (boy.service_area_id !== undefined) payload.service_area_id = boy.service_area_id;
    if (boy.area_name !== undefined) payload.area_name = boy.area_name;
    if (boy.status !== undefined) payload.status = boy.status;
    if (boy.is_online !== undefined) payload.is_online = Number(boy.is_online) || 0;
    if (boy.is_busy !== undefined) payload.is_busy = Number(boy.is_busy) || 0;
    if (boy.created_at !== undefined) payload.created_at = boy.created_at;

    await setDoc(docRef, payload, { merge: true });
    console.log(`[Firestore] Delivery boy ${boy.id} synced successfully`);
  } catch (error) {
    handleClientQuotaError(error);
    console.warn(`[Firestore] Delivery boy ${boy.id} saved to primary backend:`, (error as any)?.message || error);
  }
}

/**
 * Persist a Payment transaction to Firestore
 */
export async function syncPaymentToFirestore(payment: {
  id: string;
  order_id: string;
  customer_id?: string;
  amount: number;
  payment_method: string;
  transaction_reference?: string | null;
  collected_by_delivery_boy_id?: string | null;
  created_at?: string;
}) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'payments', sanitizeDocId(payment.id));
    const payload: any = {
      id: payment.id,
      order_id: payment.order_id,
      customer_id: payment.customer_id || '',
      amount: Number(payment.amount) || 0,
      payment_method: payment.payment_method,
      transaction_reference: payment.transaction_reference || null,
      collected_by_delivery_boy_id: payment.collected_by_delivery_boy_id || null,
      created_at: payment.created_at || new Date().toISOString()
    };
    await setDoc(docRef, payload, { merge: true });
    console.log(`[Firestore] Payment ${payment.id} synced successfully`);
  } catch (error) {
    handleClientQuotaError(error);
    console.warn(`[Firestore] Payment ${payment.id} saved to primary backend:`, (error as any)?.message || error);
  }
}

/**
 * Persist Clothing Category to Firestore
 */
export async function syncCategoryToFirestore(category: Partial<ClothingCategory> & { id: string }) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'clothing_categories', sanitizeDocId(category.id));
    const payload: any = {
      id: category.id,
      name: category.name || '',
      name_mr: category.name_mr || '',
      default_rate: Number(category.default_rate) || 0,
      unit: category.unit || 'piece',
      is_active: category.is_active ? 1 : 0,
      sort_order: category.sort_order || 0
    };
    await setDoc(docRef, payload, { merge: true });
    console.log(`[Firestore] Category ${category.id} synced successfully`);
  } catch (error) {
    handleClientQuotaError(error);
    console.warn(`[Firestore] Category ${category.id} saved to primary backend:`, (error as any)?.message || error);
  }
}

export async function deleteCategoryFromFirestore(categoryId: string) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'clothing_categories', sanitizeDocId(categoryId));
    await deleteDoc(docRef);
    console.log(`[Firestore] Category ${categoryId} removed`);
  } catch (error) {
    handleClientQuotaError(error);
  }
}

export async function syncSettingsToFirestore(key: string, value: string) {
  if (!canSync()) return;
  try {
    const docRef = doc(db, 'app_settings', sanitizeDocId(key));
    await setDoc(docRef, { key, value, updated_at: new Date().toISOString() }, { merge: true });
  } catch (error) {
    handleClientQuotaError(error);
  }
}

/**
 * Fetch backup records from Firestore if needed
 */
export async function fetchFirestoreOrders(): Promise<any[]> {
  try {
    const snapshot = await getDocs(query(collection(db, 'orders'), limit(100)));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.warn('[Firestore] fetch orders error:', e);
    return [];
  }
}

export async function fetchFirestoreCustomers(): Promise<any[]> {
  try {
    const snapshot = await getDocs(query(collection(db, 'customers'), limit(100)));
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  } catch (e) {
    console.warn('[Firestore] fetch customers error:', e);
    return [];
  }
}
