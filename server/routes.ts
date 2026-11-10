import express, { type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, backupDatabase, getAppSetting, setAppSetting, uploadsDir, dataDir, projectRoot } from './db.ts';
import { 
  syncOrderToCloud, 
  syncOrderDeleteToCloud,
  syncCustomerToCloud, 
  syncCustomerDeleteToCloud,
  syncPaymentToCloud, 
  syncDeliveryBoyToCloud,
  syncDeliveryBoyDeleteToCloud,
  syncCategoryToCloud,
  syncCategoryDeleteToCloud,
  syncAppSettingsToCloud,
  rehydrateFromFirestore, 
  pushAllToFirestore, 
  getSyncStatus 
} from './firestoreService.ts';
import { 
  hashPassword, 
  verifyPassword, 
  createSession, 
  deleteSession, 
  authenticate, 
  requireRole, 
  type AuthenticatedRequest,
  updatePresenceStatus
} from './auth.ts';

export const apiRouter = express.Router();

// Helper to log audit event
function logAudit(userId: string | null, action: string, entityType: string, entityId: string, details?: any) {
  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const detailsStr = details ? JSON.stringify(details) : null;
    db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, action, entityType, entityId, detailsStr, now);
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

// -------------------------------------------------------------
// SETUP & AUTHENTICATION
// -------------------------------------------------------------

apiRouter.get('/setup/status', (req, res) => {
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
  const shopCount = db.prepare("SELECT COUNT(*) as count FROM shops").get() as { count: number };
  const areaCount = db.prepare("SELECT COUNT(*) as count FROM service_areas").get() as { count: number };
  const categoryCount = db.prepare("SELECT COUNT(*) as count FROM clothing_categories").get() as { count: number };

  res.json({
    isSetupComplete: adminCount.count > 0,
    hasAdmin: adminCount.count > 0,
    shopCount: shopCount.count,
    areaCount: areaCount.count,
    categoryCount: categoryCount.count
  });
});

apiRouter.post('/setup/initialize', (req, res) => {
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
  if (adminCount.count > 0) {
    res.status(400).json({ error: 'System has already been initialized. Please log in.' });
    return;
  }

  const { adminName, emailOrPhone, password, includeDefaultConfig } = req.body;
  if (!adminName || !emailOrPhone || !password) {
    res.status(400).json({ error: 'Admin Name, Email/Phone, and Password are required.' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    return;
  }

  const adminId = crypto.randomUUID();
  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();

  // Create Super Admin
  db.prepare(`
    INSERT INTO users (id, name, email_or_phone, password_hash, salt, role, status, is_online, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'admin', 'active', 1, ?, ?)
  `).run(adminId, adminName.trim(), emailOrPhone.trim(), hash, salt, now, now);

  logAudit(adminId, 'INITIALIZE_SUPER_ADMIN', 'user', adminId, { name: adminName, emailOrPhone });

  // If includeDefaultConfig is true, provision Pune initial areas, Friends Laundry shop config, and standard clothing rate list
  if (includeDefaultConfig) {
    // 1. Service areas
    const areas = [
      { id: crypto.randomUUID(), name: 'Warje', pincode: '411058', city: 'Pune' },
      { id: crypto.randomUUID(), name: 'Kothrud', pincode: '411038', city: 'Pune' },
      { id: crypto.randomUUID(), name: 'Karve Nagar', pincode: '411052', city: 'Pune' }
    ];

    for (const a of areas) {
      db.prepare(`
        INSERT OR IGNORE INTO service_areas (id, name, pincode, city, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(a.id, a.name, a.pincode, a.city, now);
    }

    // 2. Initial Shop config: Friends Laundry & Dry Cleaners (Warje)
    const warjeArea = areas[0];
    const shopId = crypto.randomUUID();
    db.prepare(`
      INSERT OR IGNORE INTO shops (id, name, code, service_area_id, address, phone, upi_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      shopId,
      'Friends Laundry & Dry Cleaners',
      'FLD-WARJE',
      warjeArea.id,
      'Shop No. 7, Prestige Point Building, Atul Nagar Phase 1, Near RMD College, Warje, Pune, Maharashtra 411058',
      '9822012345',
      'friendslaundry@upi',
      now,
      now
    );

    // 3. Initial clothing categories with standard Pune laundry market rates
    const categories = [
      { name: 'Ironing (Press)', rate: 12, unit: 'piece', sort: 1 },
      { name: 'Dress', rate: 90, unit: 'piece', sort: 2 },
      { name: 'Dry Cleaning', rate: 70, unit: 'piece', sort: 3 },
      { name: 'Saree', rate: 80, unit: 'piece', sort: 4 },
      { name: 'Saree (Dry Cleaning)', rate: 250, unit: 'piece', sort: 5 },
      { name: 'Kurta (Dry Cleaning)', rate: 100, unit: 'piece', sort: 6 },
      { name: 'Jacket', rate: 150, unit: 'piece', sort: 7 },
      { name: 'Bedsheet (Ironing)', rate: 68, unit: 'piece', sort: 8 },
      { name: 'Wash & Fold (By Weight)', rate: 70, unit: 'kg', sort: 9 },
      { name: 'Wash & Iron (By Weight)', rate: 90, unit: 'kg', sort: 10 },
      { name: 'Curtains (By Sq Ft)', rate: 8, unit: 'sq_ft', sort: 11 },
      { name: 'Carpet / Rug (By Sq Ft)', rate: 25, unit: 'sq_ft', sort: 12 },
      { name: 'Shoes Cleaning', rate: 250, unit: 'piece', sort: 13 },
      { name: 'Helmet Cleaning', rate: 250, unit: 'piece', sort: 14 },
      { name: 'Shirt', rate: 25, unit: 'piece', sort: 15 },
      { name: 'T-Shirt', rate: 20, unit: 'piece', sort: 16 },
      { name: 'Pant / Trouser', rate: 30, unit: 'piece', sort: 17 },
      { name: 'Jeans', rate: 35, unit: 'piece', sort: 18 },
      { name: 'Kurta', rate: 40, unit: 'piece', sort: 19 },
      { name: 'Bed Sheet', rate: 70, unit: 'piece', sort: 20 },
      { name: 'Other Items', rate: 50, unit: 'piece', sort: 21 }
    ];

    for (const cat of categories) {
      db.prepare(`
        INSERT OR IGNORE INTO clothing_categories (id, name, name_mr, default_rate, unit, is_active, sort_order, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).run(crypto.randomUUID(), cat.name, cat.name, cat.rate, cat.unit || 'piece', cat.sort, now);
    }
  }

  const token = createSession(adminId);
  const user = db.prepare(`SELECT id, name, email_or_phone, role, status FROM users WHERE id = ?`).get(adminId);

  res.json({
    message: 'Super Admin successfully initialized',
    token,
    user
  });
});

apiRouter.post('/auth/login', (req, res) => {
  updatePresenceStatus();
  const { emailOrPhone, password, role } = req.body;

  if (!emailOrPhone || !password) {
    res.status(400).json({ error: 'Username/Email/Phone and Password are required.' });
    return;
  }

  const user = db.prepare(`
    SELECT u.*, s.name as shop_name, a.name as area_name
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id
    LEFT JOIN service_areas a ON a.id = u.service_area_id
    WHERE LOWER(u.email_or_phone) = LOWER(?)
  `).get(emailOrPhone.trim()) as any;

  if (!user) {
    res.status(401).json({ error: 'Invalid credentials. User not found.' });
    return;
  }

  if (user.status !== 'active') {
    res.status(403).json({ error: 'Account is deactivated. Contact administrator.' });
    return;
  }

  // Allow seamless authentication into user's registered role

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid password.' });
    return;
  }

  const token = createSession(user.id);
  logAudit(user.id, 'LOGIN', 'user', user.id);

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email_or_phone: user.email_or_phone,
      role: user.role,
      shop_id: user.shop_id,
      service_area_id: user.service_area_id,
      shop_name: user.shop_name,
      area_name: user.area_name,
      is_online: 1,
      is_busy: user.is_busy
    }
  });
});

apiRouter.get('/auth/me', authenticate, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

apiRouter.post('/auth/logout', authenticate, (req: AuthenticatedRequest, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  if (token && req.user) {
    deleteSession(token, req.user.id);
    logAudit(req.user.id, 'LOGOUT', 'user', req.user.id);
  }
  res.json({ success: true });
});

apiRouter.post('/auth/heartbeat', authenticate, (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET is_online = 1, last_heartbeat = ?, updated_at = ? WHERE id = ?
  `).run(now, now, req.user.id);
  res.json({ ok: true, timestamp: now });
});

apiRouter.post('/auth/toggle-availability', authenticate, requireRole(['delivery']), (req: AuthenticatedRequest, res) => {
  const { is_busy } = req.body;
  const busyVal = is_busy ? 1 : 0;
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users SET is_busy = ?, last_heartbeat = ?, updated_at = ? WHERE id = ?
  `).run(busyVal, now, now, req.user!.id);
  res.json({ success: true, is_busy: busyVal });
});

// -------------------------------------------------------------
// SERVICE AREAS
// -------------------------------------------------------------

apiRouter.get('/areas', authenticate, (req, res) => {
  const areas = db.prepare('SELECT * FROM service_areas ORDER BY name ASC').all();
  res.json({ areas });
});

apiRouter.post('/areas', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const { name, pincode, city } = req.body;
  if (!name) return res.status(400).json({ error: 'Area name is required.' });

  try {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO service_areas (id, name, pincode, city, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name.trim(), pincode || '', city || 'Pune', now);

    logAudit(req.user!.id, 'CREATE_AREA', 'service_area', id, { name, pincode });
    res.json({ success: true, id, name, pincode, city });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Area name already exists' });
  }
});

// -------------------------------------------------------------
// SHOPS
// -------------------------------------------------------------

apiRouter.get('/shops', authenticate, (req: AuthenticatedRequest, res) => {
  // Super Admin can see all shops; Shop user can see only their shop
  if (req.user?.role === 'shop') {
    const shop = db.prepare(`
      SELECT s.*, a.name as area_name 
      FROM shops s 
      LEFT JOIN service_areas a ON a.id = s.service_area_id 
      WHERE s.id = ?
    `).get(req.user.shop_id);
    return res.json({ shops: shop ? [shop] : [] });
  }

  const shops = db.prepare(`
    SELECT s.*, a.name as area_name,
      (SELECT COUNT(*) FROM orders o WHERE o.shop_id = s.id) as total_orders,
      (SELECT COUNT(*) FROM users u WHERE u.shop_id = s.id) as staff_count
    FROM shops s
    LEFT JOIN service_areas a ON a.id = s.service_area_id
    ORDER BY s.name ASC
  `).all();

  res.json({ shops });
});

apiRouter.post('/shops', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const { name, code, service_area_id, address, phone, gst_number, upi_id, staffName, staffEmailOrPhone, staffPassword } = req.body;
  if (!name || !address || !phone) {
    return res.status(400).json({ error: 'Shop name, address, and phone are required.' });
  }

  try {
    const shopId = crypto.randomUUID();
    const shopCode = (code || name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase()) + '-' + Math.floor(1000 + Math.random() * 9000);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO shops (id, name, code, service_area_id, address, phone, gst_number, upi_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(shopId, name.trim(), shopCode, service_area_id || null, address.trim(), phone.trim(), gst_number || null, upi_id || null, now, now);

    let staffUser = null;
    if (staffEmailOrPhone && staffPassword) {
      const staffId = crypto.randomUUID();
      const { hash, salt } = hashPassword(staffPassword);
      db.prepare(`
        INSERT INTO users (id, name, email_or_phone, password_hash, salt, role, shop_id, status, is_online, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'shop', ?, 'active', 0, ?, ?)
      `).run(staffId, staffName || `${name} Staff`, staffEmailOrPhone.trim(), hash, salt, shopId, now, now);
      staffUser = { id: staffId, email: staffEmailOrPhone };
    }

    logAudit(req.user!.id, 'CREATE_SHOP', 'shop', shopId, { name, code: shopCode });
    res.json({ success: true, shopId, code: shopCode, staffUser });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create shop' });
  }
});

apiRouter.put('/shops/:id', authenticate, requireRole(['admin', 'shop']), (req: AuthenticatedRequest, res) => {
  const shopId = req.params.id;
  if (req.user?.role === 'shop' && req.user.shop_id !== shopId) {
    return res.status(403).json({ error: 'Unauthorized to modify this shop' });
  }

  const { name, service_area_id, address, phone, gst_number, upi_id } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE shops 
    SET name = ?, service_area_id = ?, address = ?, phone = ?, gst_number = ?, upi_id = ?, updated_at = ?
    WHERE id = ?
  `).run(name, service_area_id || null, address, phone, gst_number || null, upi_id || null, now, shopId);

  backupDatabase();
  logAudit(req.user!.id, 'UPDATE_SHOP', 'shop', shopId, { name, phone });
  res.json({ success: true });
});

// -------------------------------------------------------------
// DELIVERY BOYS (ACCOUNTS & LIVE AVAILABILITY)
// -------------------------------------------------------------

apiRouter.get('/delivery-boys', authenticate, (req: AuthenticatedRequest, res) => {
  updatePresenceStatus();

  // Query delivery boys with real-time status and active jobs count (excluding tombstoned/deleted)
  const boys = db.prepare(`
    SELECT 
      u.id, u.name, u.email_or_phone, u.role, u.service_area_id, u.status, 
      u.is_online, u.is_busy, u.last_heartbeat, u.created_at,
      a.name as area_name,
      (
        SELECT COUNT(*) 
        FROM orders o 
        WHERE o.assigned_delivery_boy_id = u.id 
        AND o.status IN ('assigned', 'arriving', 'out_for_delivery')
      ) as active_jobs_count
    FROM users u
    LEFT JOIN service_areas a ON a.id = u.service_area_id
    WHERE u.role = 'delivery'
      AND u.status != 'inactive'
      AND u.id NOT IN (SELECT id FROM deleted_delivery_boy_tombstones)
      AND (u.email_or_phone IS NULL OR u.email_or_phone NOT IN (SELECT phone FROM deleted_delivery_boy_tombstones WHERE phone IS NOT NULL AND phone != ''))
    ORDER BY u.is_online DESC, active_jobs_count ASC, u.name ASC
  `).all();

  res.json({ deliveryBoys: boys });
});

apiRouter.post('/delivery-boys', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const { name, phoneOrEmail, password, service_area_id } = req.body;
  if (!name || !phoneOrEmail || !password) {
    return res.status(400).json({ error: 'Name, Phone/Email, and Password are required.' });
  }

  try {
    const trimmedName = name.trim();
    const trimmedPhone = phoneOrEmail.trim();
    const { hash, salt } = hashPassword(password);
    const now = new Date().toISOString();

    // Check if user already exists with this phone or email
    const existing = db.prepare('SELECT id, role, status FROM users WHERE email_or_phone = ?').get(trimmedPhone) as any;
    let targetId = existing?.id;

    if (existing) {
      // Reactivate / update existing delivery boy account seamlessly
      db.prepare(`
        UPDATE users 
        SET name = ?, password_hash = ?, salt = ?, role = 'delivery', service_area_id = ?, status = 'active', updated_at = ?
        WHERE id = ?
      `).run(trimmedName, hash, salt, service_area_id || null, now, existing.id);
      targetId = existing.id;
    } else {
      targetId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO users (id, name, email_or_phone, password_hash, salt, role, service_area_id, status, is_online, is_busy, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'delivery', ?, 'active', 0, 0, ?, ?)
      `).run(targetId, trimmedName, trimmedPhone, hash, salt, service_area_id || null, now, now);
    }

    // Clear any previous deletion tombstone so re-created staff account functions properly
    db.prepare(`
      DELETE FROM deleted_delivery_boy_tombstones 
      WHERE id = ? OR (phone IS NOT NULL AND phone != '' AND phone = ?)
    `).run(targetId, trimmedPhone);

    logAudit(req.user!.id, 'CREATE_OR_UPDATE_DELIVERY_BOY', 'user', targetId, { name: trimmedName, phoneOrEmail: trimmedPhone, area: service_area_id });
    
    // Critical: Flush SQLite to backup file immediately
    backupDatabase();

    // Critical: Persist immediately to Cloud Firestore
    syncDeliveryBoyToCloud(targetId).catch(err => {
      console.warn('[Cloud Firestore] Background syncDeliveryBoyToCloud error:', err);
    });

    res.json({ success: true, id: targetId, name: trimmedName, phoneOrEmail: trimmedPhone });
  } catch (err: any) {
    console.error('Error in POST /delivery-boys:', err);
    res.status(400).json({ error: err.message || 'Failed to save delivery boy account' });
  }
});

apiRouter.put('/delivery-boys/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const id = req.params.id;
  const { name, service_area_id, status, password } = req.body;
  const now = new Date().toISOString();

  if (password && password.length >= 6) {
    const { hash, salt } = hashPassword(password);
    db.prepare(`
      UPDATE users 
      SET name = ?, service_area_id = ?, status = ?, password_hash = ?, salt = ?, updated_at = ?
      WHERE id = ? AND role = 'delivery'
    `).run(name, service_area_id || null, status || 'active', hash, salt, now, id);
  } else {
    db.prepare(`
      UPDATE users 
      SET name = ?, service_area_id = ?, status = ?, updated_at = ?
      WHERE id = ? AND role = 'delivery'
    `).run(name, service_area_id || null, status || 'active', now, id);
  }

  logAudit(req.user!.id, 'UPDATE_DELIVERY_BOY', 'user', id, { name, status });
  backupDatabase();
  syncDeliveryBoyToCloud(id).catch(err => console.warn('[Cloud Firestore] Sync delivery boy update failed:', err));
  res.json({ success: true });
});

apiRouter.delete('/delivery-boys/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const id = req.params.id;
  const boy = db.prepare("SELECT id, name, email_or_phone FROM users WHERE id = ? AND role = 'delivery'").get(id) as any;
  if (!boy) {
    return res.status(404).json({ error: 'Delivery personnel not found' });
  }

  const now = new Date().toISOString();

  // 1. Unassign any active orders so they are safely returned to pending / unassigned
  db.prepare(`
    UPDATE orders 
    SET assigned_delivery_boy_id = NULL,
        status = CASE WHEN status = 'assigned' THEN 'pending' ELSE status END,
        updated_at = ?
    WHERE assigned_delivery_boy_id = ? AND status NOT IN ('delivered', 'failed', 'cancelled')
  `).run(now, id);

  // 2. Unassign from completed or historical orders
  db.prepare(`
    UPDATE orders 
    SET assigned_delivery_boy_id = NULL,
        updated_at = ?
    WHERE assigned_delivery_boy_id = ?
  `).run(now, id);

  // 3. Clear user sessions
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);

  // 4. Delete user record completely from users table
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'delivery'").run(id);

  // 5. Insert permanent tombstone so it can NEVER be re-imported or resurrected
  db.prepare(`
    INSERT OR REPLACE INTO deleted_delivery_boy_tombstones (id, phone, deleted_at)
    VALUES (?, ?, ?)
  `).run(boy.id, boy.email_or_phone?.trim() || null, now);

  logAudit(req.user!.id, 'DELETE_DELIVERY_BOY_PERMANENT', 'user', id, { name: boy.name, phone: boy.email_or_phone });

  // 6. Persist changes to disk immediately
  backupDatabase();

  // 7. Delete permanently from Cloud Firestore
  syncDeliveryBoyDeleteToCloud(boy.id, boy.email_or_phone?.trim()).catch(err => {
    console.warn('[Cloud Firestore] Sync delivery boy delete failed:', err);
  });

  res.json({ success: true, message: `Delivery personnel "${boy.name}" permanently deleted.` });
});

// -------------------------------------------------------------
// CLOTHING CATEGORIES & PRICE LIST
// -------------------------------------------------------------

apiRouter.get('/clothing-categories', authenticate, (req, res) => {
  const categories = db.prepare(`
    SELECT * FROM clothing_categories 
    WHERE is_active = 1
    ORDER BY sort_order ASC, name ASC
  `).all();
  res.json({ categories });
});

apiRouter.get('/admin/clothing-categories', authenticate, requireRole(['admin']), (req, res) => {
  const categories = db.prepare(`
    SELECT * FROM clothing_categories 
    ORDER BY sort_order ASC, name ASC
  `).all();
  res.json({ categories });
});

apiRouter.post('/clothing-categories', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const { name, name_mr, default_rate, unit, sort_order } = req.body;
  if (!name || default_rate === undefined) {
    return res.status(400).json({ error: 'Item name and rate are required.' });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO clothing_categories (id, name, name_mr, default_rate, unit, is_active, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, name.trim(), name_mr ? name_mr.trim() : null, parseFloat(default_rate), unit || 'piece', sort_order || 0, now);

  backupDatabase();
  logAudit(req.user!.id, 'CREATE_CATEGORY', 'clothing_category', id, { name, rate: default_rate });
  syncCategoryToCloud(id).catch(err => console.warn('[Cloud Sync] Category create sync notice:', err));
  res.json({ success: true, id });
});

apiRouter.put('/clothing-categories/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const id = req.params.id;
  const { name, name_mr, default_rate, unit, is_active, sort_order } = req.body;

  db.prepare(`
    UPDATE clothing_categories 
    SET name = ?, name_mr = ?, default_rate = ?, unit = ?, is_active = ?, sort_order = ?
    WHERE id = ?
  `).run(name, name_mr || null, parseFloat(default_rate), unit || 'piece', is_active !== undefined ? (is_active ? 1 : 0) : 1, sort_order || 0, id);

  backupDatabase();
  logAudit(req.user!.id, 'UPDATE_CATEGORY', 'clothing_category', id, { name, rate: default_rate, is_active });
  syncCategoryToCloud(id).catch(err => console.warn('[Cloud Sync] Category update sync notice:', err));
  res.json({ success: true });
});

apiRouter.delete('/clothing-categories/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const id = req.params.id;
  const existing = db.prepare('SELECT id, name FROM clothing_categories WHERE id = ?').get(id) as { id: string, name: string } | undefined;
  if (existing) {
    db.prepare('INSERT OR REPLACE INTO deleted_category_tombstones (id, name, deleted_at) VALUES (?, ?, ?)')
      .run(existing.id, existing.name, new Date().toISOString());
  }
  db.prepare('DELETE FROM clothing_categories WHERE id = ?').run(id);
  backupDatabase();
  logAudit(req.user!.id, 'DELETE_CATEGORY', 'clothing_category', id);
  syncCategoryDeleteToCloud(id).catch(err => console.warn('[Cloud Sync] Category delete sync notice:', err));
  res.json({ success: true });
});

// -------------------------------------------------------------
// APP SETTINGS & BRANDING (LOGO & LAUNDRY NAME)
// -------------------------------------------------------------

apiRouter.get('/settings', (req, res) => {
  const logo = getAppSetting('laundry_logo', '');
  const name = getAppSetting('laundry_name', 'Friends Laundry & Dry Cleaners');
  const nameMr = getAppSetting('laundry_name_mr', 'Friends Laundry & Dry Cleaners');
  res.json({ logo, name, nameMr });
});

apiRouter.post('/settings/logo', authenticate, requireRole(['admin', 'shop']), (req: AuthenticatedRequest, res) => {
  const { logo, name, nameMr } = req.body;
  if (logo !== undefined) {
    setAppSetting('laundry_logo', String(logo));
    syncAppSettingsToCloud('laundry_logo', String(logo)).catch(err => console.warn('[Cloud Sync] Logo sync notice:', err));
  }
  if (name) {
    setAppSetting('laundry_name', String(name));
    syncAppSettingsToCloud('laundry_name', String(name)).catch(err => console.warn('[Cloud Sync] Name sync notice:', err));
  }
  if (nameMr) {
    setAppSetting('laundry_name_mr', String(nameMr));
    syncAppSettingsToCloud('laundry_name_mr', String(nameMr)).catch(err => console.warn('[Cloud Sync] NameMr sync notice:', err));
  }
  logAudit(req.user!.id, 'UPDATE_SETTINGS', 'app_settings', 'laundry_logo', { hasLogo: Boolean(logo) });
  res.json({ success: true, logo: getAppSetting('laundry_logo', ''), name: getAppSetting('laundry_name', 'Friends Laundry & Dry Cleaners') });
});

// -------------------------------------------------------------
// CUSTOMERS & SAVED ADDRESSES
// -------------------------------------------------------------

apiRouter.get('/customers', authenticate, (req: AuthenticatedRequest, res) => {
  const query = (req.query.q as string || '').trim().toLowerCase();
  let sql = `
    SELECT c.*, s.name as shop_name,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as total_orders,
      (SELECT COALESCE(SUM(o.outstanding_amount), 0) FROM orders o WHERE o.customer_id = c.id) as total_due
    FROM customers c
    LEFT JOIN shops s ON s.id = c.shop_id
  `;
  const params: any[] = [];
  const whereClauses: string[] = [];

  // Data isolation: Shop staff only sees their shop's customers; Admin can filter by shop
  const requestedShopId = (req.query.shop_id as string) || '';
  if (req.user?.role === 'shop') {
    whereClauses.push('c.shop_id = ?');
    params.push(req.user.shop_id);
  } else if (req.user?.role === 'admin' && requestedShopId && requestedShopId !== 'all') {
    whereClauses.push('c.shop_id = ?');
    params.push(requestedShopId);
  }

  if (query) {
    whereClauses.push('(LOWER(c.name) LIKE ? OR c.mobile LIKE ? OR LOWER(c.pickup_address) LIKE ? OR LOWER(c.flat_number) LIKE ? OR LOWER(c.building_name) LIKE ?)');
    const term = `%${query}%`;
    params.push(term, term, term, term, term);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  sql += ' ORDER BY c.updated_at DESC LIMIT 50';

  const customers = db.prepare(sql).all(...params);
  res.json({ customers });
});

apiRouter.post('/customers', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { name, mobile, email, pickup_address, delivery_address, area, building_name, flat_number, notes, shop_id } = req.body;
    if (!name || !mobile) {
      return res.status(400).json({ error: 'Customer Name and Mobile number are required.' });
    }

    const cleanMobile = String(mobile).trim();
    const cleanName = String(name).trim();

    // Determine shop_id
    let targetShopId = req.user?.role === 'shop' ? req.user.shop_id : shop_id;
    if (!targetShopId) {
      const firstShop = db.prepare('SELECT id FROM shops LIMIT 1').get() as { id: string } | undefined;
      targetShopId = firstShop ? firstShop.id : null;
    }

    // Default pickup address and area if not supplied
    let defaultArea = 'Warje';
    if (targetShopId) {
      const shopRow = db.prepare('SELECT s.name, a.name as area_name FROM shops s LEFT JOIN service_areas a ON a.id = s.service_area_id WHERE s.id = ?').get(targetShopId) as any;
      if (shopRow?.area_name) defaultArea = shopRow.area_name;
    }

    const cleanPickup = String(pickup_address || '').trim() || 'Store Counter / Shop Pickup';
    const cleanDelivery = String(delivery_address || pickup_address || '').trim() || cleanPickup;
    const cleanArea = String(area || '').trim() || defaultArea;
    const now = new Date().toISOString();

    // Check if customer with this mobile number already exists
    const existingCust = db.prepare('SELECT id, name, pickup_address, area FROM customers WHERE mobile = ? LIMIT 1').get(cleanMobile) as any;
    if (existingCust) {
      // Update existing customer record with latest address details
      db.prepare(`
        UPDATE customers 
        SET name = ?, pickup_address = ?, delivery_address = ?, area = ?, 
            building_name = COALESCE(?, building_name), flat_number = COALESCE(?, flat_number), 
            notes = COALESCE(?, notes), updated_at = ?
        WHERE id = ?
      `).run(
        cleanName,
        cleanPickup,
        cleanDelivery,
        cleanArea,
        building_name ? String(building_name).trim() : null,
        flat_number ? String(flat_number).trim() : null,
        notes ? String(notes).trim() : null,
        now,
        existingCust.id
      );

      backupDatabase();
      syncCustomerToCloud(existingCust.id).catch(err => console.warn('[Cloud Sync] Customer update notice:', err));
      return res.json({ success: true, id: existingCust.id, isExisting: true });
    }

    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO customers (id, shop_id, name, mobile, email, pickup_address, delivery_address, area, building_name, flat_number, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      targetShopId,
      cleanName,
      cleanMobile,
      email || null,
      cleanPickup,
      cleanDelivery,
      cleanArea,
      building_name || null,
      flat_number || null,
      notes || null,
      now,
      now
    );

    logAudit(req.user!.id, 'CREATE_CUSTOMER', 'customer', id, { name: cleanName, mobile: cleanMobile });
    syncCustomerToCloud(id).catch(err => console.warn('[Cloud Sync] Customer create notice:', err));
    res.json({ success: true, id });
  } catch (err: any) {
    console.error('[POST /customers Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to save customer' });
  }
});

apiRouter.put('/customers/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const id = req.params.id;
  const { name, mobile, email, pickup_address, delivery_address, area, building_name, flat_number, notes } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE customers 
    SET name = ?, mobile = ?, email = ?, pickup_address = ?, delivery_address = ?, area = ?, building_name = ?, flat_number = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `).run(name, mobile, email || null, pickup_address, delivery_address || pickup_address, area, building_name || null, flat_number || null, notes || null, now, id);

  logAudit(req.user!.id, 'UPDATE_CUSTOMER', 'customer', id, { name, mobile });
  backupDatabase();
  syncCustomerToCloud(id).catch(err => console.warn('[Cloud Sync] Customer update notice:', err));
  res.json({ success: true });
});

apiRouter.delete('/customers/:id', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const custId = req.params.id;
    const force = req.query.force === 'true';
    const customer = db.prepare('SELECT id, name, mobile FROM customers WHERE id = ?').get(custId) as any;
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orderCount = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE customer_id = ?').get(custId) as any).c;
    if (orderCount > 0 && !force) {
      return res.status(400).json({ 
        error: `Customer has ${orderCount} existing order(s).`,
        orderCount,
        requiresForce: true 
      });
    }

    if (orderCount > 0 && force) {
      // Force cascade delete: order_photos, order_items, invoices, payments, and orders for this customer
      const custOrders = db.prepare('SELECT id FROM orders WHERE customer_id = ?').all(custId) as { id: string }[];
      for (const o of custOrders) {
        db.prepare('DELETE FROM order_photos WHERE order_id = ?').run(o.id);
        db.prepare('DELETE FROM order_items WHERE order_id = ?').run(o.id);
        db.prepare('DELETE FROM invoices WHERE order_id = ?').run(o.id);
        db.prepare('DELETE FROM payment_transactions WHERE order_id = ?').run(o.id);
      }
      db.prepare('DELETE FROM payment_transactions WHERE customer_id = ?').run(custId);
      db.prepare('DELETE FROM invoices WHERE customer_id = ?').run(custId);
      db.prepare('DELETE FROM orders WHERE customer_id = ?').run(custId);
    }

    // Insert tombstone so deleted customer never resurfaces from Firestore
    db.prepare('INSERT OR REPLACE INTO deleted_customer_tombstones (id, mobile, deleted_at) VALUES (?, ?, ?)')
      .run(customer.id, customer.mobile, new Date().toISOString());

    db.prepare('DELETE FROM customers WHERE id = ?').run(custId);
    backupDatabase();
    logAudit(req.user!.id, 'DELETE_CUSTOMER', 'customer', custId, { name: customer.name, mobile: customer.mobile, force, orderCount });
    syncCustomerDeleteToCloud(custId).catch(err => console.warn('[Cloud Sync] Customer delete notice:', err));

    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (err: any) {
    console.error('[DELETE /customers/:id Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to delete customer' });
  }
});

apiRouter.get('/customers/:id/due-orders', authenticate, (req: AuthenticatedRequest, res) => {
  const customerId = req.params.id;
  const orders = db.prepare(`
    SELECT o.*, 
      COALESCE(s.name, 'Friends Laundry') as shop_name, 
      COALESCE(c.name, 'Customer') as customer_name, 
      COALESCE(c.mobile, '') as customer_mobile
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN shops s ON s.id = o.shop_id
    WHERE o.customer_id = ? AND o.outstanding_amount > 0
    ORDER BY o.created_at ASC
  `).all(customerId) as any[];

  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
  const totalDue = orders.reduce((sum: number, o: any) => sum + (Number(o.outstanding_amount) || 0), 0);

  res.json({ customer, orders, totalDue });
});

// Comprehensive Customer Ledger Endpoint
apiRouter.get('/customers/:id/ledger', authenticate, (req: AuthenticatedRequest, res) => {
  const customerId = req.params.id;
  const customer = db.prepare(`
    SELECT c.*, s.name as shop_name 
    FROM customers c 
    LEFT JOIN shops s ON s.id = c.shop_id 
    WHERE c.id = ?
  `).get(customerId) as any;
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  // Fetch all orders for this customer
  const orders = db.prepare(`
    SELECT o.*, s.name as shop_name,
      (SELECT invoice_number FROM invoices WHERE order_id = o.id LIMIT 1) as invoice_number
    FROM orders o
    LEFT JOIN shops s ON s.id = o.shop_id
    WHERE o.customer_id = ?
    ORDER BY o.created_at ASC
  `).all(customerId) as any[];

  // Fetch all payments for this customer
  const payments = db.prepare(`
    SELECT pt.*, o.order_number, u.name as collected_by_name
    FROM payment_transactions pt
    LEFT JOIN orders o ON o.id = pt.order_id
    LEFT JOIN users u ON u.id = pt.collected_by_delivery_boy_id
    WHERE pt.customer_id = ?
    ORDER BY pt.created_at ASC
  `).all(customerId) as any[];

  // Combine into unified chronological ledger entries
  const rawEntries: Array<{
    id: string;
    date: string;
    timestamp: number;
    type: 'order' | 'payment';
    reference_no: string;
    order_id?: string;
    description: string;
    debit: number;
    credit: number;
    status?: string;
    payment_status?: string;
    expected_payment_date?: string | null;
    delivery_type?: string | null;
    collected_by?: string | null;
  }> = [];

  for (const o of orders) {
    rawEntries.push({
      id: o.id,
      date: o.created_at,
      timestamp: new Date(o.created_at).getTime(),
      type: 'order',
      reference_no: o.order_number || o.id.slice(0, 8),
      order_id: o.id,
      description: `New Bill / Order ${o.order_number} (${o.status})`,
      debit: Number(o.final_total) || 0,
      credit: 0,
      status: o.status,
      payment_status: o.payment_status,
      expected_payment_date: o.expected_payment_date,
      delivery_type: o.delivery_type
    });
  }

  for (const p of payments) {
    rawEntries.push({
      id: p.id,
      date: p.created_at,
      timestamp: new Date(p.created_at).getTime(),
      type: 'payment',
      reference_no: p.transaction_reference || `TXN-${p.id.slice(0, 8).toUpperCase()}`,
      order_id: p.order_id,
      description: `Payment Received (${p.payment_method.toUpperCase()})${p.order_number ? ' - Order ' + p.order_number : ''}`,
      debit: 0,
      credit: Number(p.amount) || 0,
      collected_by: p.collected_by_name || p.recorded_by_name || null
    });
  }

  // Sort chronologically ascending
  rawEntries.sort((a, b) => a.timestamp - b.timestamp);

  // Calculate running ledger balance
  let runningBalance = 0;
  const entries: any[] = [];
  for (const item of rawEntries) {
    runningBalance += (item.debit - item.credit);
    entries.push({
      ...item,
      balance_after: Math.max(0, Math.round(runningBalance * 100) / 100)
    });
  }

  const totalBilled = orders.reduce((sum, o) => sum + (Number(o.final_total) || 0), 0);
  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const totalOutstanding = orders.reduce((sum, o) => sum + (Number(o.outstanding_amount) || 0), 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const overdueOrders = orders.filter(o => (Number(o.outstanding_amount) || 0) > 0 && o.expected_payment_date && o.expected_payment_date < todayStr);
  const overdueAmount = overdueOrders.reduce((sum, o) => sum + (Number(o.outstanding_amount) || 0), 0);
  const unpaidOrders = orders.filter(o => (Number(o.outstanding_amount) || 0) > 0);

  res.json({
    customer,
    total_orders_count: orders.length,
    total_billed_amount: Math.round(totalBilled * 100) / 100,
    total_paid_amount: Math.round(totalPaid * 100) / 100,
    total_outstanding_due: Math.round(totalOutstanding * 100) / 100,
    overdue_bills_count: overdueOrders.length,
    overdue_bills_amount: Math.round(overdueAmount * 100) / 100,
    unpaid_orders: unpaidOrders,
    entries: entries.reverse() // Newest first for UI rendering
  });
});

apiRouter.post('/customers/:id/collect-due', authenticate, (req: AuthenticatedRequest, res) => {
  const customerId = req.params.id;
  const { amount, payment_method, transaction_reference, notes, target_order_id } = req.body;
  const numericAmount = parseFloat(amount);
  if (!numericAmount || numericAmount <= 0) {
    return res.status(400).json({ error: 'Valid payment amount is required.' });
  }

  let unpaidOrders: any[] = [];
  if (target_order_id) {
    unpaidOrders = db.prepare(`
      SELECT * FROM orders 
      WHERE id = ? AND customer_id = ? AND outstanding_amount > 0
    `).all(target_order_id, customerId) as any[];
  } else {
    // FIFO allocation: apply to oldest unpaid bills first
    unpaidOrders = db.prepare(`
      SELECT * FROM orders 
      WHERE customer_id = ? AND outstanding_amount > 0 
      ORDER BY created_at ASC
    `).all(customerId) as any[];
  }

  if (unpaidOrders.length === 0) {
    return res.status(400).json({ error: 'Customer has no outstanding unpaid orders.' });
  }

  let remainingToApply = numericAmount;
  const appliedPayments: any[] = [];
  const now = new Date().toISOString();
  const userName = req.user?.name || 'Staff';

  for (const order of unpaidOrders) {
    if (remainingToApply <= 0) break;

    const orderDue = Number(order.outstanding_amount) || 0;
    const paymentForOrder = Math.min(remainingToApply, orderDue);

    const newAmountPaid = (Number(order.amount_paid) || 0) + paymentForOrder;
    const newOutstanding = Math.max(0, orderDue - paymentForOrder);
    const newPaymentStatus = newOutstanding <= 0.01 ? 'paid' : 'partially_paid';

    // Insert payment transaction with audit fields
    const txId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO payment_transactions (
        id, order_id, invoice_id, customer_id, shop_id, amount, payment_method, 
        transaction_reference, collected_by_delivery_boy_id, recorded_by_user_id, recorded_by_name, 
        is_credit_settlement, is_settled_with_shop, notes, created_at
      )
      VALUES (
        ?, ?, (SELECT id FROM invoices WHERE order_id = ?), ?, ?, ?, ?, 
        ?, ?, ?, ?, 
        1, ?, ?, ?
      )
    `).run(
      txId, 
      order.id, 
      order.id, 
      customerId, 
      order.shop_id, 
      paymentForOrder, 
      payment_method || 'cash', 
      transaction_reference || null,
      req.user?.role === 'delivery' ? req.user.id : (order.assigned_delivery_boy_id || null),
      req.user!.id,
      userName,
      payment_method === 'cash' ? 0 : 1,
      notes || 'Customer account due payment collected', 
      now
    );

    // Update order
    db.prepare(`
      UPDATE orders 
      SET amount_paid = ?, outstanding_amount = ?, payment_status = ?, updated_at = ?
      WHERE id = ?
    `).run(newAmountPaid, newOutstanding, newPaymentStatus, now, order.id);

    // Update invoice if exists
    db.prepare(`
      UPDATE invoices 
      SET amount_paid = ?, outstanding_balance = ?, payment_status = ?
      WHERE order_id = ?
    `).run(newAmountPaid, newOutstanding, newPaymentStatus, order.id);

    remainingToApply -= paymentForOrder;
    appliedPayments.push({ orderId: order.id, orderNumber: order.order_number, amount: paymentForOrder, newOutstanding });
  }

  backupDatabase();
  logAudit(req.user!.id, 'COLLECT_CUSTOMER_DUE', 'customer', customerId, { amount: numericAmount, appliedPayments });

  // Sync all affected orders and customer to Cloud Firestore
  for (const p of appliedPayments) {
    syncOrderToCloud(p.orderId).catch(() => {});
  }
  syncCustomerToCloud(customerId).catch(() => {});

  res.json({
    success: true,
    totalCollected: numericAmount,
    appliedPayments,
    remainingUnapplied: remainingToApply
  });
});

// -------------------------------------------------------------
// ORDERS & DELIVERY MANAGEMENT
// -------------------------------------------------------------

apiRouter.get('/orders', authenticate, (req: AuthenticatedRequest, res) => {
  const role = req.user!.role;
  const statusFilter = req.query.status as string;
  const dateFilter = req.query.date as string;
  const requestedShopId = (req.query.shop_id as string) || '';

  let sql = `
    SELECT 
      o.*, 
      c.name as customer_name, c.mobile as customer_mobile, c.flat_number, c.building_name,
      s.name as shop_name, s.phone as shop_phone,
      d.name as delivery_boy_name, d.email_or_phone as delivery_boy_phone,
      (SELECT COUNT(*) FROM order_photos op WHERE op.order_id = o.id AND op.photo_type = 'bag') as has_bag_photo,
      (SELECT COUNT(*) FROM order_photos op WHERE op.order_id = o.id AND op.photo_type = 'clothes') as has_clothes_photo,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as items_count,
      (SELECT inv.invoice_number FROM invoices inv WHERE inv.order_id = o.id) as invoice_number
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN shops s ON s.id = o.shop_id
    LEFT JOIN users d ON d.id = o.assigned_delivery_boy_id
  `;

  const whereClauses: string[] = [];
  const params: any[] = [];

  // Access control
  if (role === 'shop') {
    whereClauses.push('o.shop_id = ?');
    params.push(req.user!.shop_id);
  } else if (role === 'delivery') {
    whereClauses.push('o.assigned_delivery_boy_id = ?');
    params.push(req.user!.id);
  } else if (role === 'admin' && requestedShopId && requestedShopId !== 'all') {
    whereClauses.push('o.shop_id = ?');
    params.push(requestedShopId);
  }

  if (statusFilter && statusFilter !== 'all') {
    whereClauses.push('o.status = ?');
    params.push(statusFilter);
  }

  const hasDueOnly = req.query.due_only === 'true' || req.query.has_due === 'true';
  if (hasDueOnly) {
    whereClauses.push('o.outstanding_amount > 0');
  }

  if (dateFilter) {
    whereClauses.push('DATE(o.pickup_date) = DATE(?)');
    params.push(dateFilter);
  }

  if (whereClauses.length > 0) {
    sql += ' WHERE ' + whereClauses.join(' AND ');
  }

  sql += ' ORDER BY o.created_at DESC';

  const orders = db.prepare(sql).all(...params);
  res.json({ orders });
});

apiRouter.get('/orders/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const order = db.prepare(`
    SELECT 
      o.*, 
      c.name as customer_name, c.mobile as customer_mobile, c.email as customer_email,
      c.flat_number, c.building_name,
      s.name as shop_name, s.code as shop_code, s.phone as shop_phone, s.address as shop_address, s.gst_number as shop_gst, s.upi_id as shop_upi,
      d.name as delivery_boy_name, d.email_or_phone as delivery_boy_phone
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN shops s ON s.id = o.shop_id
    LEFT JOIN users d ON d.id = o.assigned_delivery_boy_id
    WHERE o.id = ?
  `).get(orderId) as any;

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Shop isolation verification
  if (req.user?.role === 'shop' && req.user.shop_id !== order.shop_id) {
    return res.status(403).json({ error: 'Access denied to this order' });
  }

  // Delivery boy isolation
  if (req.user?.role === 'delivery' && req.user.id !== order.assigned_delivery_boy_id) {
    return res.status(403).json({ error: 'Access denied: order is not assigned to you' });
  }

  // Get items
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

  // Get photos
  const photos = db.prepare('SELECT * FROM order_photos WHERE order_id = ?').all(orderId);

  // Get invoice
  const invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(orderId);

  // Get payments
  const payments = db.prepare(`
    SELECT pt.*, u.name as collected_by_name 
    FROM payment_transactions pt
    LEFT JOIN users u ON u.id = pt.collected_by_delivery_boy_id
    WHERE pt.order_id = ?
    ORDER BY pt.created_at DESC
  `).all(orderId);

  // Get history
  const statusHistory = db.prepare(`
    SELECT sh.*, u.name as changed_by_name
    FROM order_status_history sh
    LEFT JOIN users u ON u.id = sh.changed_by_user_id
    WHERE sh.order_id = ?
    ORDER BY sh.created_at ASC
  `).all(orderId);

  const assignmentHistory = db.prepare(`
    SELECT ah.*, d.name as delivery_boy_name, u.name as assigned_by_name
    FROM assignment_history ah
    LEFT JOIN users d ON d.id = ah.delivery_boy_id
    LEFT JOIN users u ON u.id = ah.assigned_by_user_id
    WHERE ah.order_id = ?
    ORDER BY ah.assigned_at DESC
  `).all(orderId);

  res.json({
    order,
    items,
    photos,
    invoice,
    payments,
    statusHistory,
    assignmentHistory
  });
});

// -------------------------------------------------------------
// UNIQUE IDENTIFIER GENERATORS (ZERO-COLLISION GUARANTEED)
// -------------------------------------------------------------

export function generateUniqueOrderNumber(): string {
  const year = new Date().getFullYear();
  const rows = db.prepare("SELECT order_number FROM orders WHERE order_number LIKE ?").all(`ORD-${year}-%`) as { order_number: string }[];
  const existingSet = new Set(rows.map(r => r.order_number));

  let maxSeq = 0;
  for (const r of rows) {
    const match = r.order_number.match(/^ORD-\d{4}-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  let seq = Math.max(maxSeq + 1, rows.length + 1);
  let candidate = `ORD-${year}-${String(seq).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    seq++;
    candidate = `ORD-${year}-${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

export function generateUniqueInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const rows = db.prepare("SELECT invoice_number FROM invoices WHERE invoice_number LIKE ?").all(`INV-${year}-%`) as { invoice_number: string }[];
  const existingSet = new Set(rows.map(r => r.invoice_number));

  let maxSeq = 0;
  for (const r of rows) {
    const match = r.invoice_number.match(/^INV-\d{4}-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  let seq = Math.max(maxSeq + 1, rows.length + 1);
  let candidate = `INV-${year}-${String(seq).padStart(4, '0')}`;
  while (existingSet.has(candidate)) {
    seq++;
    candidate = `INV-${year}-${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

apiRouter.post('/orders', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { 
      customer_id, 
      shop_id, 
      order_type = 'pickup', // 'pickup' | 'delivery'
      pickup_address, 
      delivery_address, 
      area, 
      pickup_date, 
      pickup_time_slot, 
      assigned_delivery_boy_id, 
      special_instructions,
      items, // optional items for direct delivery order
      delivery_charge = 0,
      discount_amount = 0,
      delivery_type = 'standard',
      expected_payment_date,
      credit_notes
    } = req.body;

    let targetShopId = req.user?.role === 'shop' ? req.user.shop_id : shop_id;
    if (!targetShopId) {
      const firstShop = db.prepare('SELECT id, address, name FROM shops LIMIT 1').get() as { id: string; address: string; name: string } | undefined;
      if (!firstShop) return res.status(400).json({ error: 'Please create at least one shop first.' });
      targetShopId = firstShop.id;
    }

    const shopRow = db.prepare('SELECT id, address, name FROM shops WHERE id = ?').get(targetShopId) as { id: string; address: string; name: string } | undefined;
    const isDeliveryOrder = order_type === 'delivery';
    const effectivePickupAddress = (pickup_address || shopRow?.address || 'Shop Counter').trim();
    const effectiveDeliveryAddress = (delivery_address || effectivePickupAddress).trim();

    if (!customer_id || !area) {
      return res.status(400).json({ error: 'Customer and Area are required.' });
    }

    const effectiveDate = pickup_date || new Date().toISOString().split('T')[0];

    // Generate collision-free sequential order number
    const orderNumber = generateUniqueOrderNumber();
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    let initialStatus: string;
    if (isDeliveryOrder) {
      initialStatus = assigned_delivery_boy_id ? 'out_for_delivery' : 'ready_for_delivery';
    } else {
      initialStatus = assigned_delivery_boy_id ? 'assigned' : 'pending';
    }

    // Parse items if provided, supporting weight-based (kg + grams) arithmetic
    let calculatedSubtotal = 0;
    const parsedItems: Array<{ 
      id: string; 
      category_id: string | null; 
      name: string; 
      quantity: number; 
      rate: number; 
      line_total: number;
      unit: string;
      weight_kg: number | null;
      weight_display: string | null;
    }> = [];

    if (Array.isArray(items) && items.length > 0) {
      for (const it of items) {
        let q = Math.max(0, parseInt(it.quantity, 10) || 0);
        const r = Math.max(0, parseFloat(it.rate) || 0);
        const unit = it.unit || 'piece';
        let weightKg: number | null = null;
        let weightDisplay: string | null = null;
        let lineTotal = 0;

        if (unit === 'kg') {
          let kg = parseInt(it.kg, 10) || 0;
          let grams = parseInt(it.grams, 10) || 0;
          if (!kg && !grams && it.weight_kg) {
            const totalGrams = Math.round(parseFloat(it.weight_kg) * 1000);
            kg = Math.floor(totalGrams / 1000);
            grams = totalGrams % 1000;
          }
          const totalGrams = (kg * 1000) + grams;
          if (totalGrams > 0) {
            weightKg = Math.round(totalGrams) / 1000;
            weightDisplay = `${kg} kg ${grams} g`;
            // Precise gram formula: (kg * 1000 + grams) * rate / 1000
            lineTotal = Math.round(((totalGrams * r) / 1000) * 100) / 100;
            q = 1;
          }
        } else {
          lineTotal = Math.round(q * r * 100) / 100;
        }

        if (lineTotal > 0 || q > 0) {
          calculatedSubtotal += lineTotal;
          parsedItems.push({
            id: crypto.randomUUID(),
            category_id: it.category_id || null,
            name: it.item_name || it.name || 'Clothing Item',
            quantity: q,
            rate: r,
            line_total: lineTotal,
            unit,
            weight_kg: weightKg,
            weight_display: weightDisplay
          });
        }
      }
    }

    const parsedDeliveryCharge = Math.max(0, parseFloat(delivery_charge) || 0);
    const parsedDiscount = Math.max(0, parseFloat(discount_amount) || 0);
    const finalTotal = Math.max(0, calculatedSubtotal + parsedDeliveryCharge - parsedDiscount);

    db.prepare(`
      INSERT INTO orders (
        id, order_number, shop_id, customer_id, pickup_address, delivery_address, 
        area, pickup_date, pickup_time_slot, assigned_delivery_boy_id, assigned_at, assigned_by_user_id,
        status, special_instructions, subtotal, delivery_charge, tax_amount, discount_amount, final_total,
        amount_paid, outstanding_amount, payment_status, delivery_type, expected_payment_date, credit_notes, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, 0, ?, ?,
        0, ?, 'unpaid', ?, ?, ?, ?, ?
      )
    `).run(
      orderId,
      orderNumber,
      targetShopId,
      customer_id,
      effectivePickupAddress,
      effectiveDeliveryAddress,
      area.trim(),
      effectiveDate,
      pickup_time_slot || (isDeliveryOrder ? 'Immediate Delivery' : 'Anytime'),
      assigned_delivery_boy_id || null,
      assigned_delivery_boy_id ? now : null,
      assigned_delivery_boy_id ? req.user!.id : null,
      initialStatus,
      special_instructions || (isDeliveryOrder ? 'Direct Shop Delivery Order' : null),
      calculatedSubtotal,
      parsedDeliveryCharge,
      parsedDiscount,
      finalTotal,
      finalTotal,
      delivery_type || 'standard',
      expected_payment_date || null,
      credit_notes || null,
      now,
      now
    );

    // If items provided, insert order_items & generate invoice immediately
    if (parsedItems.length > 0) {
      for (const item of parsedItems) {
        db.prepare(`
          INSERT INTO order_items (id, order_id, category_id, item_name, quantity, rate, line_total, unit, weight_kg, weight_display)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(item.id, orderId, item.category_id, item.name, item.quantity, item.rate, item.line_total, item.unit, item.weight_kg, item.weight_display);
      }

      const invoiceNumber = generateUniqueInvoiceNumber();
      const invoiceId = crypto.randomUUID();

      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, order_id, shop_id, customer_id, date,
          subtotal, delivery_charge, tax_amount, discount_amount, final_total,
          amount_paid, outstanding_balance, payment_status, expected_payment_date, credit_notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, 'unpaid', ?, ?, ?)
      `).run(
        invoiceId,
        invoiceNumber,
        orderId,
        targetShopId,
        customer_id,
        effectiveDate,
        calculatedSubtotal,
        parsedDeliveryCharge,
        parsedDiscount,
        finalTotal,
        finalTotal,
        expected_payment_date || null,
        credit_notes || null,
        now
      );
    }

    // Status history
    db.prepare(`
      INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), orderId, initialStatus, req.user!.id, isDeliveryOrder ? 'Direct delivery order created' : 'Pickup order created', now);

    // Assignment history if assigned
    if (assigned_delivery_boy_id) {
      db.prepare(`
        INSERT INTO assignment_history (id, order_id, delivery_boy_id, assigned_by_user_id, stage, assigned_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(), 
        orderId, 
        assigned_delivery_boy_id, 
        req.user!.id, 
        isDeliveryOrder ? 'delivery' : 'pickup', 
        now, 
        isDeliveryOrder ? 'Direct delivery assignment' : 'Initial pickup assignment'
      );
    }

    backupDatabase();
    logAudit(req.user!.id, isDeliveryOrder ? 'CREATE_DELIVERY_ORDER' : 'CREATE_PICKUP_ORDER', 'order', orderId, { orderNumber, customer_id, shop_id: targetShopId, order_type });

    // Automatic silent background cloud sync
    syncOrderToCloud(orderId).catch(err => console.warn('[Cloud Sync] Auto order sync notice:', err));
    syncCustomerToCloud(customer_id).catch(err => console.warn('[Cloud Sync] Auto customer sync notice:', err));

    res.json({ success: true, orderId, orderNumber });
  } catch (err: any) {
    console.error('[POST /orders Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

// -------------------------------------------------------------
// QUICK CREATE PICKUP & QUICK CREATE DELIVERY (1-CLICK SHORTCUT)
// -------------------------------------------------------------

apiRouter.post('/orders/quick', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const {
      order_type = 'pickup', // 'pickup' | 'delivery'
      customer_id,
      customer, // { name, mobile, pickup_address, delivery_address, area, building_name, flat_number }
      shop_id,
      assigned_delivery_boy_id,
      pickup_date,
      pickup_time_slot,
      weight, // { kg, grams, rate, item_name }
      photos, // [{ photo_type, image_data, caption }]
      items, // array of items if piece count or multiple
      delivery_charge = 0,
      discount_amount = 0,
      special_instructions,
      advance_paid = 0,
      payment_method = 'cash',
      expected_payment_date,
      credit_notes,
      pickup_proof_notes,
      clothes_summary,
      iron_count = 0,
      dryclean_count = 0,
      wash_count = 0,
      total_pieces = 0,
      notes
    } = req.body;

    let targetShopId = req.user?.role === 'shop' ? req.user.shop_id : shop_id;
    if (!targetShopId) {
      const firstShop = db.prepare('SELECT id, address, name FROM shops LIMIT 1').get() as { id: string; address: string; name: string } | undefined;
      if (!firstShop) return res.status(400).json({ error: 'Please create at least one shop first.' });
      targetShopId = firstShop.id;
    }
    const shopRow = db.prepare('SELECT id, address, name FROM shops WHERE id = ?').get(targetShopId) as { id: string; address: string; name: string } | undefined;

    let finalCustomerId = customer_id;
    let finalCustomerName = '';
    let finalCustomerMobile = '';
    let effectivePickupAddress = '';
    let effectiveDeliveryAddress = '';
    let finalArea = 'Warje';

    const now = new Date().toISOString();

    // If customer_id provided, look up
    if (finalCustomerId) {
      const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(finalCustomerId) as any;
      if (c) {
        finalCustomerName = c.name;
        finalCustomerMobile = c.mobile;
        effectivePickupAddress = c.pickup_address;
        effectiveDeliveryAddress = c.delivery_address || c.pickup_address;
        finalArea = c.area;
      }
    }

    // If new customer details provided or customer_id not found
    if (!finalCustomerId && customer) {
      if (!customer.name || !customer.mobile || !customer.pickup_address) {
        return res.status(400).json({ error: 'Customer Name, Mobile, and Pickup Address are required.' });
      }
      const existingCust = db.prepare('SELECT * FROM customers WHERE mobile = ? LIMIT 1').get(customer.mobile.trim()) as any;
      if (existingCust) {
        finalCustomerId = existingCust.id;
        finalCustomerName = existingCust.name;
        finalCustomerMobile = existingCust.mobile;
        effectivePickupAddress = customer.pickup_address || existingCust.pickup_address;
        effectiveDeliveryAddress = customer.delivery_address || existingCust.delivery_address || effectivePickupAddress;
        finalArea = customer.area || existingCust.area || 'Warje';

        if (customer.pickup_address && customer.pickup_address.trim() !== existingCust.pickup_address) {
          db.prepare(`
            UPDATE customers 
            SET pickup_address = ?, delivery_address = ?, area = ?, updated_at = ?
            WHERE id = ?
          `).run(effectivePickupAddress, effectiveDeliveryAddress, finalArea, now, existingCust.id);
          backupDatabase();
          syncCustomerToCloud(existingCust.id).catch(() => {});
        }
      } else {
        finalCustomerId = crypto.randomUUID();
        finalCustomerName = customer.name.trim();
        finalCustomerMobile = customer.mobile.trim();
        effectivePickupAddress = customer.pickup_address.trim();
        effectiveDeliveryAddress = (customer.delivery_address || customer.pickup_address).trim();
        finalArea = (customer.area || 'Warje').trim();

        db.prepare(`
          INSERT INTO customers (id, shop_id, name, mobile, pickup_address, delivery_address, area, building_name, flat_number, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          finalCustomerId,
          targetShopId,
          finalCustomerName,
          finalCustomerMobile,
          effectivePickupAddress,
          effectiveDeliveryAddress,
          finalArea,
          customer.building_name || null,
          customer.flat_number || null,
          now,
          now
        );
      }
    }

    if (!finalCustomerId) {
      return res.status(400).json({ error: 'Customer information is required.' });
    }

    const isDeliveryOrder = order_type === 'delivery';
    if (isDeliveryOrder && !effectivePickupAddress) {
      effectivePickupAddress = shopRow?.address || 'Shop Counter';
    }

    // Generate collision-free order number
    const orderNumber = generateUniqueOrderNumber();
    const orderId = crypto.randomUUID();

  let effectiveDeliveryBoyId = assigned_delivery_boy_id;
  if (!effectiveDeliveryBoyId && req.user?.role === 'delivery') {
    effectiveDeliveryBoyId = req.user.id;
  }

  // Weight parsing
  let numKg = 0;
  let numGrams = 0;
  let numRate = 80;
  let totalGrams = 0;
  let weightLineTotal = 0;
  let weightDisplay: string | null = null;

  if (weight) {
    numKg = Math.max(0, parseInt(String(weight.kg), 10) || 0);
    numGrams = Math.max(0, Math.min(999, parseInt(String(weight.grams), 10) || 0));
    numRate = Math.max(0, parseFloat(String(weight.rate)) || 80);
    totalGrams = (numKg * 1000) + numGrams;
    if (totalGrams > 0) {
      weightLineTotal = Math.round(((totalGrams * numRate) / 1000) * 100) / 100;
      weightDisplay = `${numKg} kg ${numGrams} g`;
    }
  }

  let calculatedSubtotal = weightLineTotal;
  const parsedItems: any[] = [];

  if (totalGrams > 0) {
    parsedItems.push({
      id: crypto.randomUUID(),
      item_name: weight?.item_name || 'Wash & Fold (By Weight)',
      quantity: 1,
      rate: numRate,
      line_total: weightLineTotal,
      unit: 'kg',
      weight_kg: totalGrams / 1000,
      weight_display: weightDisplay,
      weight_grams_total: totalGrams
    });
  }

  if (Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      let q = Math.max(0, parseInt(it.quantity, 10) || 0);
      const r = Math.max(0, parseFloat(it.rate) || 0);
      const unit = it.unit || 'piece';
      let wKg: number | null = null;
      let wDisplay: string | null = null;
      let lTotal = 0;
      let totalG = 0;

      if (unit === 'kg') {
        const k = parseInt(it.kg, 10) || 0;
        const g = parseInt(it.grams, 10) || 0;
        totalG = (k * 1000) + g;
        if (totalG > 0) {
          wKg = totalG / 1000;
          wDisplay = `${k} kg ${g} g`;
          lTotal = Math.round(((totalG * r) / 1000) * 100) / 100;
          q = 1;
        }
      } else {
        lTotal = Math.round(q * r * 100) / 100;
      }

      if (lTotal > 0 || q > 0) {
        calculatedSubtotal += lTotal;
        parsedItems.push({
          id: crypto.randomUUID(),
          category_id: it.category_id || null,
          item_name: it.item_name || it.name || 'Clothing Item',
          quantity: q,
          rate: r,
          line_total: lTotal,
          unit,
          weight_kg: wKg,
          weight_display: wDisplay,
          weight_grams_total: totalG
        });
      }
    }
  }

  // Photos parsing
  const savedPhotoUrls: string[] = [];
  if (Array.isArray(photos) && photos.length > 0) {
    for (const p of photos) {
      if (!p.image_data) continue;
      const pType = p.photo_type || 'bag';
      const matches = p.image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let fileBuffer: Buffer;
      let ext = 'jpg';
      if (matches && matches.length === 3) {
        if (matches[1].includes('png')) ext = 'png';
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else {
        fileBuffer = Buffer.from(p.image_data, 'base64');
      }
      const fileName = `${orderId}-${pType}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.resolve(uploadsDir, fileName);
      fs.writeFileSync(filePath, fileBuffer);
      const fileUrl = `/uploads/${fileName}`;
      savedPhotoUrls.push(fileUrl);
      db.prepare(`
        INSERT INTO order_photos (id, order_id, photo_type, file_path, file_url, uploaded_by_user_id, created_at, caption)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), orderId, pType, filePath, fileUrl, req.user!.id, now, p.caption || null);
    }
  }

  const parsedDeliveryCharge = Math.max(0, parseFloat(delivery_charge) || 0);
  const parsedDiscount = Math.max(0, parseFloat(discount_amount) || 0);
  const finalTotal = Math.max(0, calculatedSubtotal + parsedDeliveryCharge - parsedDiscount);
  const numAdvance = Math.min(finalTotal, Math.max(0, parseFloat(advance_paid) || 0));
  const outstandingAmount = Math.max(0, finalTotal - numAdvance);
  const paymentStatus = numAdvance >= finalTotal && finalTotal > 0 ? 'paid' : (numAdvance > 0 ? 'partially_paid' : 'unpaid');

  let initialStatus: string;
  if (isDeliveryOrder) {
    initialStatus = effectiveDeliveryBoyId ? 'out_for_delivery' : 'ready_for_delivery';
  } else {
    if (totalGrams > 0 || savedPhotoUrls.length > 0) {
      initialStatus = 'picked_up';
    } else {
      initialStatus = effectiveDeliveryBoyId ? 'assigned' : 'pending';
    }
  }

  const finalProofNotes = pickup_proof_notes || notes || null;
  const finalClothesSummary = clothes_summary || null;
  const numIron = Math.max(0, parseInt(String(iron_count), 10) || 0);
  const numDryclean = Math.max(0, parseInt(String(dryclean_count), 10) || 0);
  const numWash = Math.max(0, parseInt(String(wash_count), 10) || 0);
  const numTotalPieces = Math.max(0, parseInt(String(total_pieces), 10) || (numIron + numDryclean + numWash));

  db.prepare(`
    INSERT INTO orders (
      id, order_number, shop_id, customer_id, pickup_address, delivery_address, 
      area, pickup_date, pickup_time_slot, assigned_delivery_boy_id, assigned_at, assigned_by_user_id,
      status, special_instructions, subtotal, delivery_charge, tax_amount, discount_amount, final_total,
      amount_paid, outstanding_amount, payment_status, delivery_type, expected_payment_date, credit_notes,
      pickup_weight_kg, pickup_weight_grams, pickup_weight_total_grams, pickup_weight_rate, pickup_photos,
      pickup_proof_notes, clothes_summary, iron_count, dryclean_count, wash_count, total_pieces,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 0, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `).run(
    orderId,
    orderNumber,
    targetShopId,
    finalCustomerId,
    effectivePickupAddress,
    effectiveDeliveryAddress,
    finalArea,
    pickup_date || now.split('T')[0],
    pickup_time_slot || (isDeliveryOrder ? 'Immediate Delivery' : 'Quick Pickup'),
    effectiveDeliveryBoyId || null,
    effectiveDeliveryBoyId ? now : null,
    effectiveDeliveryBoyId ? req.user!.id : null,
    initialStatus,
    special_instructions || (isDeliveryOrder ? 'Quick Delivery Order' : 'Quick Pickup Order'),
    calculatedSubtotal,
    parsedDeliveryCharge,
    parsedDiscount,
    finalTotal,
    numAdvance,
    outstandingAmount,
    paymentStatus,
    isDeliveryOrder ? 'quick_delivery' : 'quick_pickup',
    expected_payment_date || null,
    credit_notes || null,
    numKg,
    numGrams,
    totalGrams,
    numRate,
    JSON.stringify(savedPhotoUrls),
    finalProofNotes,
    finalClothesSummary,
    numIron,
    numDryclean,
    numWash,
    numTotalPieces,
    now,
    now
  );

  for (const item of parsedItems) {
    db.prepare(`
      INSERT INTO order_items (id, order_id, category_id, item_name, quantity, rate, line_total, unit, weight_kg, weight_display, weight_grams_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      item.id,
      orderId,
      item.category_id || null,
      item.item_name,
      item.quantity,
      item.rate,
      item.line_total,
      item.unit,
      item.weight_kg,
      item.weight_display,
      item.weight_grams_total || 0
    );
  }

  let invoiceId: string | null = null;
  let invoiceNumber: string | null = null;
  if (parsedItems.length > 0 || finalTotal > 0) {
    invoiceNumber = generateUniqueInvoiceNumber();
    invoiceId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, order_id, shop_id, customer_id, date,
        subtotal, delivery_charge, tax_amount, discount_amount, final_total,
        amount_paid, outstanding_balance, payment_status, pickup_weight_display,
        expected_payment_date, credit_notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceId,
      invoiceNumber,
      orderId,
      targetShopId,
      finalCustomerId,
      pickup_date || now.split('T')[0],
      calculatedSubtotal,
      parsedDeliveryCharge,
      parsedDiscount,
      finalTotal,
      numAdvance,
      outstandingAmount,
      paymentStatus,
      weightDisplay,
      expected_payment_date || null,
      credit_notes || null,
      now
    );

    if (numAdvance > 0) {
      db.prepare(`
        INSERT INTO payment_transactions (
          id, order_id, invoice_id, customer_id, shop_id, amount,
          payment_method, transaction_reference, collected_by_delivery_boy_id,
          recorded_by_user_id, recorded_by_name, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        orderId,
        invoiceId,
        finalCustomerId,
        targetShopId,
        numAdvance,
        payment_method,
        `QUICK-${orderNumber}`,
        req.user?.role === 'delivery' ? req.user.id : null,
        req.user!.id,
        req.user!.name,
        'Advance payment collected during quick create',
        now
      );
    }
  }

  db.prepare(`
    INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), orderId, initialStatus, req.user!.id, `Quick ${order_type} created`, now);

  if (effectiveDeliveryBoyId) {
    db.prepare(`
      INSERT INTO assignment_history (id, order_id, delivery_boy_id, assigned_by_user_id, stage, assigned_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), orderId, effectiveDeliveryBoyId, req.user!.id, isDeliveryOrder ? 'delivery' : 'pickup', now, 'Quick order assignment');
  }

  backupDatabase();
  logAudit(req.user!.id, 'QUICK_CREATE_ORDER', 'order', orderId, { orderNumber, order_type, totalGrams, finalTotal });

  // Sync order & customer to Cloud Firestore
  syncOrderToCloud(orderId).catch(err => console.warn('[Cloud Sync] Order create notice:', err));
  if (finalCustomerId) syncCustomerToCloud(finalCustomerId).catch(() => {});

  res.json({
    success: true,
    orderId,
    orderNumber,
    customerId: finalCustomerId,
    status: initialStatus,
    finalTotal,
    outstandingAmount,
    invoiceId,
    invoiceNumber,
    photos: savedPhotoUrls,
    weight_display: weightDisplay
  });
  } catch (err: any) {
    console.error('[POST /orders/quick Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to create quick order' });
  }
});

apiRouter.post('/orders/:id/assign', authenticate, requireRole(['admin', 'shop']), (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const { delivery_boy_id, stage, notes } = req.body;

  if (!delivery_boy_id) {
    return res.status(400).json({ error: 'Delivery boy is required.' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.user?.role === 'shop' && req.user.shop_id !== order.shop_id) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const now = new Date().toISOString();
  const currentStatus = order.status;
  let newStatus = currentStatus;

  if (currentStatus === 'pending') {
    newStatus = 'assigned';
  }

  db.prepare(`
    UPDATE orders 
    SET assigned_delivery_boy_id = ?, assigned_at = ?, assigned_by_user_id = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(delivery_boy_id, now, req.user!.id, newStatus, now, orderId);

  // Log to assignment history
  db.prepare(`
    INSERT INTO assignment_history (id, order_id, delivery_boy_id, assigned_by_user_id, stage, assigned_at, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), orderId, delivery_boy_id, req.user!.id, stage || 'pickup', now, notes || (order.assigned_delivery_boy_id ? 'Reassigned job' : 'Assigned job'));

  // Log status change if updated
  if (newStatus !== currentStatus) {
    db.prepare(`
      INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), orderId, newStatus, req.user!.id, `Assigned to delivery boy`, now);
  }

  logAudit(req.user!.id, 'ASSIGN_DELIVERY_BOY', 'order', orderId, { delivery_boy_id, stage });
  syncOrderToCloud(orderId).catch(() => {});
  res.json({ success: true, newStatus });
});

apiRouter.post('/orders/:id/status', authenticate, (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const { 
    status, 
    notes, 
    isCreditDelivery, 
    delivery_type, 
    expected_payment_date, 
    credit_notes, 
    allow_unpaid_override 
  } = req.body;

  const validStatuses = [
    'pending', 
    'created', 
    'assigned', 
    'pickup_started', 
    'arriving', 
    'picked_up', 
    'received_at_shop', 
    'in_processing', 
    'ready_for_delivery', 
    'out_for_delivery', 
    'delivered', 
    'failed', 
    'rescheduled', 
    'cancelled'
  ];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Permissions check
  if (req.user?.role === 'delivery') {
    if (order.assigned_delivery_boy_id !== req.user.id) {
      return res.status(403).json({ error: 'Cannot update status of unassigned order' });
    }
    // Require at least 1 pickup photo (bag or clothes) before marking 'picked_up'
    if (status === 'picked_up') {
      const anyPhoto = db.prepare("SELECT id FROM order_photos WHERE order_id = ? LIMIT 1").get(orderId);
      let hasPickupPhotoJson = false;
      try {
        const arr = JSON.parse(order.pickup_photos || '[]');
        if (Array.isArray(arr) && arr.length > 0) hasPickupPhotoJson = true;
      } catch {}
      if (!anyPhoto && !hasPickupPhotoJson) {
        return res.status(400).json({ error: 'Cannot complete pickup: Please upload at least 1 pickup photo first.' });
      }
    }
  }

  // Handle 'delivered' status and payment checks
  const isCredit = Boolean(isCreditDelivery || delivery_type === 'credit' || allow_unpaid_override);
  const outstanding = Number(order.outstanding_amount) || 0;

  if (status === 'delivered') {
    if (outstanding > 0 && !isCredit) {
      return res.status(400).json({ 
        error: `Payment collection required. Outstanding balance is ₹${outstanding.toFixed(2)}. Please collect payment or record as Credit Delivery (Pay Later) before completing delivery.`,
        requiresDuePayment: true,
        outstandingAmount: outstanding
      });
    }
  }

  const now = new Date().toISOString();

  // If credit delivery, save credit terms onto order & invoice
  if (status === 'delivered' && isCredit && outstanding > 0) {
    db.prepare(`
      UPDATE orders 
      SET status = ?, delivery_type = 'credit', expected_payment_date = ?, credit_notes = ?, updated_at = ? 
      WHERE id = ?
    `).run(status, expected_payment_date || order.expected_payment_date || null, credit_notes || order.credit_notes || null, now, orderId);

    db.prepare(`
      UPDATE invoices 
      SET expected_payment_date = ?, credit_notes = ? 
      WHERE order_id = ?
    `).run(expected_payment_date || null, credit_notes || null, orderId);
  } else {
    db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, orderId);
  }

  backupDatabase();

  // Status history
  const historyNote = isCredit && outstanding > 0 
    ? `Credit Delivery Completed (Expected Payment: ${expected_payment_date || 'N/A'})` 
    : (notes || `Status changed to ${status}`);

  db.prepare(`
    INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(crypto.randomUUID(), orderId, status, req.user!.id, historyNote, now);

  logAudit(req.user!.id, 'UPDATE_ORDER_STATUS', 'order', orderId, { status, isCredit, expected_payment_date });
  syncOrderToCloud(orderId).catch(err => console.warn('[Cloud Sync] Status notice:', err));
  res.json({ success: true, status, isCreditDelivery: isCredit });
});

// -------------------------------------------------------------
// PICKUP PHOTOS UPLOAD, LIST & STORAGE (BAG, CLOTHES, OR GENERAL)
// -------------------------------------------------------------

apiRouter.get('/orders/:id/photos', authenticate, (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const photos = db.prepare('SELECT * FROM order_photos WHERE order_id = ? ORDER BY created_at ASC').all(orderId);
  res.json({ photos });
});

apiRouter.post('/orders/:id/photos', authenticate, (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const { photo_type = 'bag', image_data, caption, photos } = req.body;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const now = new Date().toISOString();
  const uploadedResults: Array<{ id: string; photo_type: string; fileUrl: string }> = [];

  const saveSingleImage = (type: string, dataUrl: string, cap?: string) => {
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let fileBuffer: Buffer;
    let ext = 'jpg';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('png')) ext = 'png';
      fileBuffer = Buffer.from(matches[2], 'base64');
    } else {
      fileBuffer = Buffer.from(dataUrl, 'base64');
    }

    const fileName = `${orderId}-${type}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const filePath = path.resolve(uploadsDir, fileName);
    fs.writeFileSync(filePath, fileBuffer);

    const fileUrl = `/uploads/${fileName}`;
    const photoId = crypto.randomUUID();

    // If specific bag/clothes photo and retaking, remove previous
    if (['bag', 'clothes'].includes(type)) {
      const existing = db.prepare('SELECT * FROM order_photos WHERE order_id = ? AND photo_type = ?').get(orderId, type) as any;
      if (existing) {
        try {
          if (fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
        } catch {}
        db.prepare('DELETE FROM order_photos WHERE id = ?').run(existing.id);
      }
    }

    db.prepare(`
      INSERT INTO order_photos (id, order_id, photo_type, file_path, file_url, uploaded_by_user_id, created_at, caption)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(photoId, orderId, type, filePath, fileUrl, req.user!.id, now, cap || null);

    uploadedResults.push({ id: photoId, photo_type: type, fileUrl });
  };

  if (Array.isArray(photos) && photos.length > 0) {
    for (const p of photos) {
      if (p.image_data) {
        saveSingleImage(p.photo_type || 'bag', p.image_data, p.caption);
      }
    }
  } else if (image_data && typeof image_data === 'string') {
    saveSingleImage(photo_type, image_data, caption);
  } else {
    return res.status(400).json({ error: 'Valid image_data (base64 string) is required.' });
  }

  // Sync orders.pickup_photos JSON column
  const allOrderPhotos = db.prepare('SELECT file_url FROM order_photos WHERE order_id = ?').all(orderId) as any[];
  const allUrls = allOrderPhotos.map(p => p.file_url);
  db.prepare('UPDATE orders SET pickup_photos = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(allUrls), now, orderId);

  logAudit(req.user!.id, 'UPLOAD_PICKUP_PHOTO', 'order_photo', orderId, { count: uploadedResults.length });
  syncOrderToCloud(orderId).catch(err => console.warn('[Cloud Sync] Photo notice:', err));

  const bagPhoto = db.prepare("SELECT id FROM order_photos WHERE order_id = ? AND photo_type = 'bag'").get(orderId);
  const clothesPhoto = db.prepare("SELECT id FROM order_photos WHERE order_id = ? AND photo_type = 'clothes'").get(orderId);

  res.json({
    success: true,
    uploaded: uploadedResults,
    photoId: uploadedResults[0]?.id,
    fileUrl: uploadedResults[0]?.fileUrl,
    bothPhotosUploaded: Boolean(bagPhoto && clothesPhoto),
    allPhotos: allUrls
  });
});

apiRouter.delete('/orders/:id/photos/:photoId', authenticate, (req: AuthenticatedRequest, res) => {
  const { id: orderId, photoId } = req.params;
  const photo = db.prepare('SELECT * FROM order_photos WHERE id = ? AND order_id = ?').get(photoId, orderId) as any;
  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  try {
    if (fs.existsSync(photo.file_path)) fs.unlinkSync(photo.file_path);
  } catch {}

  db.prepare('DELETE FROM order_photos WHERE id = ?').run(photoId);

  // Sync orders.pickup_photos
  const allOrderPhotos = db.prepare('SELECT file_url FROM order_photos WHERE order_id = ?').all(orderId) as any[];
  const allUrls = allOrderPhotos.map(p => p.file_url);
  db.prepare('UPDATE orders SET pickup_photos = ? WHERE id = ?').run(JSON.stringify(allUrls), orderId);

  logAudit(req.user!.id, 'DELETE_PICKUP_PHOTO', 'order_photo', photoId, { orderId });
  res.json({ success: true, allPhotos: allUrls });
});

// -------------------------------------------------------------
// WEIGHT ENTRY AT PICKUP (KG + GRAMS) & DIRECT DETAILS RECORDING
// -------------------------------------------------------------

apiRouter.post('/orders/:id/pickup-details', authenticate, (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const { 
    kg = 0, 
    grams = 0, 
    rate = 80, 
    notes,
    pickup_proof_notes,
    clothes_summary,
    iron_count = 0,
    dryclean_count = 0,
    wash_count = 0,
    total_pieces = 0,
    photos = [], 
    item_name = 'Wash & Fold (By Weight)'
  } = req.body;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.user?.role === 'delivery' && order.assigned_delivery_boy_id !== req.user.id) {
    return res.status(403).json({ error: 'Order is not assigned to you' });
  }

  const numKg = Math.max(0, parseInt(String(kg), 10) || 0);
  const numGrams = Math.max(0, Math.min(999, parseInt(String(grams), 10) || 0));
  const numRate = Math.max(0, parseFloat(String(rate)) || 0);
  const totalGrams = (numKg * 1000) + numGrams;

  const finalProofNotes = pickup_proof_notes || notes || order.pickup_proof_notes || null;
  const finalClothesSummary = clothes_summary || order.clothes_summary || null;
  const numIron = Math.max(0, parseInt(String(iron_count), 10) || 0);
  const numDryclean = Math.max(0, parseInt(String(dryclean_count), 10) || 0);
  const numWash = Math.max(0, parseInt(String(wash_count), 10) || 0);
  const numTotalPieces = Math.max(0, parseInt(String(total_pieces), 10) || (numIron + numDryclean + numWash) || (order.total_pieces || 0));

  if (totalGrams <= 0 && numTotalPieces <= 0 && (!photos || photos.length === 0) && !finalProofNotes) {
    return res.status(400).json({ error: 'Please enter clothes count, proof notes, weight, or upload a photo.' });
  }

  // Exact Integer Gram Formula: ((kg * 1000 + grams) * rate) / 1000
  const weightLineTotal = totalGrams > 0 ? Math.round(((totalGrams * numRate) / 1000) * 100) / 100 : 0;
  const weightDisplay = totalGrams > 0 ? `${numKg} kg ${numGrams} g` : null;
  const now = new Date().toISOString();

  // Save photos if any
  const uploadedUrls: string[] = [];
  if (Array.isArray(photos) && photos.length > 0) {
    for (const p of photos) {
      if (!p.image_data) continue;
      const pType = p.photo_type || 'bag';
      const matches = p.image_data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let fileBuffer: Buffer;
      let ext = 'jpg';
      if (matches && matches.length === 3) {
        if (matches[1].includes('png')) ext = 'png';
        fileBuffer = Buffer.from(matches[2], 'base64');
      } else {
        fileBuffer = Buffer.from(p.image_data, 'base64');
      }
      const fileName = `${orderId}-${pType}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${ext}`;
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      const filePath = path.resolve(uploadsDir, fileName);
      fs.writeFileSync(filePath, fileBuffer);
      const fileUrl = `/uploads/${fileName}`;
      uploadedUrls.push(fileUrl);
      db.prepare(`
        INSERT INTO order_photos (id, order_id, photo_type, file_path, file_url, uploaded_by_user_id, created_at, caption)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), orderId, pType, filePath, fileUrl, req.user!.id, now, p.caption || null);
    }
  }

  const allOrderPhotos = db.prepare('SELECT file_url FROM order_photos WHERE order_id = ?').all(orderId) as any[];
  const allPhotoUrls = allOrderPhotos.map(p => p.file_url);

  let newSubtotal = order.subtotal;
  let newFinalTotal = order.final_total;
  let newOutstanding = order.outstanding_amount;
  let newPaymentStatus = order.payment_status;

  if (totalGrams > 0) {
    const existingWeightItem = db.prepare("SELECT id FROM order_items WHERE order_id = ? AND unit = 'kg'").get(orderId) as any;
    if (existingWeightItem) {
      db.prepare(`
        UPDATE order_items 
        SET item_name = ?, quantity = 1, rate = ?, line_total = ?, weight_kg = ?, weight_display = ?, weight_grams_total = ?, notes = ?
        WHERE id = ?
      `).run(item_name, numRate, weightLineTotal, totalGrams / 1000, weightDisplay, totalGrams, finalProofNotes, existingWeightItem.id);
    } else {
      db.prepare(`
        INSERT INTO order_items (id, order_id, item_name, quantity, rate, line_total, unit, weight_kg, weight_display, weight_grams_total, notes)
        VALUES (?, ?, ?, 1, ?, ?, 'kg', ?, ?, ?, ?)
      `).run(crypto.randomUUID(), orderId, item_name, numRate, weightLineTotal, totalGrams / 1000, weightDisplay, totalGrams, finalProofNotes);
    }

    const allItems = db.prepare('SELECT line_total FROM order_items WHERE order_id = ?').all(orderId) as any[];
    newSubtotal = allItems.reduce((acc, it) => acc + (Number(it.line_total) || 0), 0);
    newFinalTotal = Math.max(0, newSubtotal + (Number(order.delivery_charge) || 0) - (Number(order.discount_amount) || 0));
    newOutstanding = Math.max(0, newFinalTotal - (Number(order.amount_paid) || 0));
    newPaymentStatus = order.amount_paid >= newFinalTotal ? 'paid' : (order.amount_paid > 0 ? 'partially_paid' : 'unpaid');
  }

  let nextStatus = order.status;
  if (['pending', 'assigned', 'arriving'].includes(order.status)) {
    nextStatus = 'picked_up';
  }

  db.prepare(`
    UPDATE orders 
    SET pickup_weight_kg = ?, pickup_weight_grams = ?, pickup_weight_total_grams = ?, pickup_weight_rate = ?,
        pickup_photos = ?, subtotal = ?, final_total = ?, outstanding_amount = ?, payment_status = ?, status = ?,
        pickup_proof_notes = ?, clothes_summary = ?, iron_count = ?, dryclean_count = ?, wash_count = ?, total_pieces = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    numKg,
    numGrams,
    totalGrams,
    numRate,
    JSON.stringify(allPhotoUrls),
    newSubtotal,
    newFinalTotal,
    newOutstanding,
    newPaymentStatus,
    nextStatus,
    finalProofNotes,
    finalClothesSummary,
    numIron,
    numDryclean,
    numWash,
    numTotalPieces,
    now,
    orderId
  );

  // Auto generate or update invoice if finalTotal > 0
  if (totalGrams > 0) {
    let invoice = db.prepare('SELECT id FROM invoices WHERE order_id = ?').get(orderId) as any;
    if (!invoice) {
      const invoiceNumber = generateUniqueInvoiceNumber();
      const invId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, order_id, shop_id, customer_id, date, subtotal, 
          delivery_charge, tax_amount, discount_amount, final_total, amount_paid, 
          outstanding_balance, payment_status, pickup_weight_display, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, 0, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        invId,
        invoiceNumber,
        orderId,
        order.shop_id,
        order.customer_id,
        now.split('T')[0],
        newSubtotal,
        order.delivery_charge || 0,
        order.discount_amount || 0,
        newFinalTotal,
        order.amount_paid || 0,
        newOutstanding,
        newPaymentStatus,
        weightDisplay,
        now
      );
    } else {
      db.prepare(`
        UPDATE invoices 
        SET subtotal = ?, final_total = ?, amount_paid = ?, outstanding_balance = ?, 
            payment_status = ?, pickup_weight_display = ?
        WHERE id = ?
      `).run(
        newSubtotal,
        newFinalTotal,
        order.amount_paid || 0,
        newOutstanding,
        newPaymentStatus,
        weightDisplay,
        invoice.id
      );
    }
  }

  if (nextStatus !== order.status) {
    const summaryDesc = totalGrams > 0 ? `Weight ${weightDisplay}` : (numTotalPieces > 0 ? `${numTotalPieces} clothes` : 'Proof captured');
    db.prepare(`
      INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), orderId, nextStatus, req.user!.id, `Pickup completed (${summaryDesc})`, now);
  }

  backupDatabase();
  logAudit(req.user!.id, 'UPDATE_PICKUP_DETAILS', 'order', orderId, { totalGrams, weightDisplay, weightLineTotal });
  syncOrderToCloud(orderId).catch(err => console.warn('[Cloud Sync] Pickup details notice:', err));

  res.json({
    success: true,
    orderId,
    weight_kg: numKg,
    weight_grams: numGrams,
    total_grams: totalGrams,
    rate: numRate,
    weight_display: weightDisplay,
    line_total: weightLineTotal,
    status: nextStatus,
    allPhotoUrls
  });
});

// -------------------------------------------------------------
// CLOTHING COUNTS & INVOICE GENERATION
// -------------------------------------------------------------

apiRouter.post('/orders/:id/items', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const orderId = req.params.id;
    const { 
      items, 
      delivery_charge = 0, 
      tax_amount = 0, 
      discount_amount = 0,
      assigned_delivery_boy_id,
      target_status
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one clothing item is required.' });
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Photo is only required if delivery boy is completing an initial pickup from assigned/arriving stage
    if (req.user?.role === 'delivery' && (order.status === 'assigned' || order.status === 'arriving')) {
      const anyPhoto = db.prepare("SELECT id FROM order_photos WHERE order_id = ? LIMIT 1").get(orderId);
      let hasOrderPhotos = false;
      try {
        const arr = JSON.parse(order.pickup_photos || '[]');
        if (Array.isArray(arr) && arr.length > 0) hasOrderPhotos = true;
      } catch {}
      if (!anyPhoto && !hasOrderPhotos) {
        return res.status(400).json({ error: 'At least 1 pickup photo is required before completing pickup.' });
      }
    }

    // Clear previous items if updating
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);

    let subtotal = 0;
    for (const item of items) {
      let quantity = Math.max(0, parseInt(item.quantity, 10) || 0);
      const rate = Math.max(0, parseFloat(item.rate) || 0);
      const unit = item.unit || 'piece';
      let weightKg: number | null = null;
      let weightDisplay: string | null = null;
      let sqFt: number | null = null;
      let sqFtLength: number | null = null;
      let sqFtWidth: number | null = null;
      let lineTotal = 0;

      if (unit === 'kg') {
        let kg = parseInt(item.kg, 10) || 0;
        let grams = parseInt(item.grams, 10) || 0;
        if (!kg && !grams && item.weight_kg) {
          const totalGrams = Math.round(parseFloat(item.weight_kg) * 1000);
          kg = Math.floor(totalGrams / 1000);
          grams = totalGrams % 1000;
        }
        const totalGrams = (kg * 1000) + grams;
        if (totalGrams > 0) {
          weightKg = Math.round(totalGrams) / 1000;
          weightDisplay = `${kg} kg ${grams} g`;
          // Exact integer gram arithmetic: (kg * 1000 + grams) * rate / 1000
          lineTotal = Math.round(((totalGrams * rate) / 1000) * 100) / 100;
          quantity = 1;
        }
      } else if (unit === 'sq_ft') {
        sqFt = Math.max(0, parseFloat(item.sq_ft) || 0);
        sqFtLength = Math.max(0, parseFloat(item.sq_ft_length) || 0);
        sqFtWidth = Math.max(0, parseFloat(item.sq_ft_width) || 0);
        if (!sqFt && sqFtLength > 0 && sqFtWidth > 0) {
          sqFt = Math.round((sqFtLength * sqFtWidth) * 100) / 100;
        }
        if (sqFt > 0) {
          lineTotal = Math.round(sqFt * rate * 100) / 100;
          quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
        }
      } else {
        lineTotal = Math.round(quantity * rate * 100) / 100;
      }

      if (quantity <= 0 && lineTotal <= 0 && (!sqFt || sqFt <= 0)) continue;
      subtotal += lineTotal;

      db.prepare(`
        INSERT INTO order_items (
          id, order_id, category_id, item_name, quantity, rate, line_total, 
          unit, weight_kg, weight_display, sq_ft, sq_ft_length, sq_ft_width, notes
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        orderId,
        item.category_id || null,
        item.item_name || 'Clothing Item',
        quantity,
        rate,
        lineTotal,
        unit,
        weightKg,
        weightDisplay,
        sqFt,
        sqFtLength,
        sqFtWidth,
        item.notes || null
      );
    }

    const dCharge = parseFloat(delivery_charge) || 0;
    const tAmount = parseFloat(tax_amount) || 0;
    const discAmount = parseFloat(discount_amount) || 0;
    const finalTotal = Math.max(0, subtotal + dCharge + tAmount - discAmount);
    const outstandingAmount = Math.max(0, finalTotal - order.amount_paid);
    const paymentStatus = order.amount_paid >= finalTotal && finalTotal > 0 ? 'paid' : (order.amount_paid > 0 ? 'partially_paid' : 'unpaid');
    const now = new Date().toISOString();

    // If status transitions or explicit target status is set
    let newStatus = target_status || order.status;
    if (!target_status) {
      if (order.status === 'assigned' || order.status === 'arriving') {
        newStatus = 'picked_up';
      }
    }

    let finalDeliveryBoyId = order.assigned_delivery_boy_id;
    if (assigned_delivery_boy_id) {
      finalDeliveryBoyId = assigned_delivery_boy_id;
      db.prepare(`
        INSERT INTO assignment_history (id, order_id, delivery_boy_id, assigned_by_user_id, stage, assigned_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), orderId, assigned_delivery_boy_id, req.user!.id, 'delivery', now, 'Real bill added and dispatched for delivery');
    }

    db.prepare(`
      UPDATE orders 
      SET subtotal = ?, delivery_charge = ?, tax_amount = ?, discount_amount = ?, 
          final_total = ?, outstanding_amount = ?, payment_status = ?, status = ?, 
          assigned_delivery_boy_id = ?, updated_at = ?
      WHERE id = ?
    `).run(subtotal, dCharge, tAmount, discAmount, finalTotal, outstandingAmount, paymentStatus, newStatus, finalDeliveryBoyId, now, orderId);

    // Automatically generate or update Invoice
    let invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(orderId) as any;
    if (!invoice) {
      const invoiceNumber = generateUniqueInvoiceNumber();
      const invId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO invoices (
          id, invoice_number, order_id, shop_id, customer_id, date, subtotal, 
          delivery_charge, tax_amount, discount_amount, final_total, amount_paid, outstanding_balance, payment_status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
        invId,
        invoiceNumber,
        orderId,
        order.shop_id,
        order.customer_id,
        now.split('T')[0],
        subtotal,
        dCharge,
        tAmount,
        discAmount,
        finalTotal,
        order.amount_paid,
        outstandingAmount,
        paymentStatus,
        now
      );
      invoice = { id: invId, invoice_number: invoiceNumber };
    } else {
      db.prepare(`
        UPDATE invoices 
        SET subtotal = ?, delivery_charge = ?, tax_amount = ?, discount_amount = ?, 
            final_total = ?, amount_paid = ?, outstanding_balance = ?, payment_status = ?
        WHERE id = ?
      `).run(subtotal, dCharge, tAmount, discAmount, finalTotal, order.amount_paid, outstandingAmount, paymentStatus, invoice.id);
    }

    // Update status history
    if (newStatus !== order.status) {
      db.prepare(`
        INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), orderId, newStatus, req.user!.id, 'Items counted and bill calculated', now);
    }

    backupDatabase();
    logAudit(req.user!.id, 'SAVE_ORDER_ITEMS', 'order', orderId, { subtotal, finalTotal, itemsCount: items.length });
    syncOrderToCloud(orderId).catch(err => console.warn('[Cloud Sync] Items notice:', err));

    res.json({
      success: true,
      subtotal,
      finalTotal,
      outstandingAmount,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: newStatus
    });
  } catch (err: any) {
    console.error('[POST /orders/:id/items Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to save bill items' });
  }
});

// -------------------------------------------------------------
// INVOICES & WHATSAPP SHARING
// -------------------------------------------------------------

apiRouter.get('/invoices', authenticate, (req: AuthenticatedRequest, res) => {
  let sql = `
    SELECT 
      inv.*, 
      COALESCE(c.name, 'Customer') as customer_name, 
      COALESCE(c.mobile, '') as customer_mobile,
      COALESCE(s.name, 'Friends Laundry') as shop_name, 
      COALESCE(s.phone, '') as shop_phone,
      COALESCE(o.order_number, '') as order_number, 
      COALESCE(o.status, 'pending') as order_status
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    LEFT JOIN shops s ON s.id = inv.shop_id
    LEFT JOIN orders o ON o.id = inv.order_id
  `;

  const params: any[] = [];
  if (req.user?.role === 'shop') {
    sql += ' WHERE inv.shop_id = ?';
    params.push(req.user.shop_id);
  }

  sql += ' ORDER BY inv.created_at DESC';
  const invoices = db.prepare(sql).all(...params);
  res.json({ invoices });
});

apiRouter.get('/invoices/:id', authenticate, (req: AuthenticatedRequest, res) => {
  const invoiceId = req.params.id;
  const invoice = db.prepare(`
    SELECT 
      inv.*, 
      COALESCE(c.name, 'Customer') as customer_name, 
      COALESCE(c.mobile, '') as customer_mobile, 
      c.email as customer_email,
      c.pickup_address, c.delivery_address, c.area as customer_area, c.flat_number, c.building_name,
      COALESCE(s.name, 'Friends Laundry') as shop_name, 
      s.code as shop_code, s.phone as shop_phone, s.address as shop_address, s.gst_number as shop_gst, s.upi_id as shop_upi,
      COALESCE(o.order_number, '') as order_number, 
      o.pickup_date, o.pickup_time_slot, 
      COALESCE(o.status, 'pending') as order_status, 
      o.delivery_type as order_delivery_type
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    LEFT JOIN shops s ON s.id = inv.shop_id
    LEFT JOIN orders o ON o.id = inv.order_id
    WHERE inv.id = ? OR inv.order_id = ?
  `).get(invoiceId, invoiceId) as any;

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  if (req.user?.role === 'shop' && req.user.shop_id !== invoice.shop_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Calculate customer's previous due balance across all past orders (excluding current order)
  const prevDueRow = db.prepare(`
    SELECT COALESCE(SUM(outstanding_amount), 0) as prev_due
    FROM orders
    WHERE customer_id = ? AND id != ? AND created_at <= ? AND outstanding_amount > 0
  `).get(invoice.customer_id, invoice.order_id, invoice.created_at) as { prev_due: number };

  invoice.previous_due = Math.round((prevDueRow ? prevDueRow.prev_due : 0) * 100) / 100;
  // Combined payable = current bill remaining balance + previous unpaid dues
  invoice.total_with_previous_due = Math.round((Number(invoice.outstanding_balance) + invoice.previous_due) * 100) / 100;

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(invoice.order_id);
  const payments = db.prepare(`
    SELECT pt.*, u.name as collected_by_name 
    FROM payment_transactions pt
    LEFT JOIN users u ON u.id = pt.collected_by_delivery_boy_id
    WHERE pt.invoice_id = ? OR pt.order_id = ?
    ORDER BY pt.created_at ASC
  `).all(invoice.id, invoice.order_id);

  const photos = db.prepare('SELECT * FROM order_photos WHERE order_id = ? ORDER BY created_at ASC').all(invoice.order_id);

  res.json({ invoice, items, payments, photos });
});

// WhatsApp Bill Sharing helper & logging
apiRouter.post('/invoices/:id/whatsapp', authenticate, (req: AuthenticatedRequest, res) => {
  const invoiceId = req.params.id;
  const invoice = db.prepare(`
    SELECT 
      inv.*, 
      COALESCE(c.name, 'Customer') as customer_name, 
      COALESCE(c.mobile, '') as customer_mobile,
      COALESCE(s.name, 'Friends Laundry') as shop_name, 
      COALESCE(s.phone, '') as shop_phone,
      COALESCE(o.order_number, '') as order_number
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    LEFT JOIN shops s ON s.id = inv.shop_id
    LEFT JOIN orders o ON o.id = inv.order_id
    WHERE inv.id = ? OR inv.order_id = ?
  `).get(invoiceId, invoiceId) as any;

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  // Clean phone number: remove non-digits
  let phone = (invoice.customer_mobile || '').replace(/\D/g, '');
  if (phone.length === 10) {
    phone = '91' + phone; // Default India country code
  }

  // Fetch actual order items for item-wise breakdown
  const items = db.prepare(`
    SELECT item_name, quantity, rate, line_total, unit, weight_display, weight_kg, sq_ft
    FROM order_items 
    WHERE order_id = ?
    ORDER BY line_total DESC
  `).all(invoice.order_id) as any[];

  // Fetch customer's previous unpaid dues
  const prevDueRow = db.prepare(`
    SELECT COALESCE(SUM(outstanding_amount), 0) as prev_due
    FROM orders
    WHERE customer_id = ? AND id != ? AND outstanding_amount > 0
  `).get(invoice.customer_id, invoice.order_id) as { prev_due: number };
  const prevDue = Math.round((prevDueRow ? prevDueRow.prev_due : 0) * 100) / 100;
  const totalCombinedDue = Math.round((Number(invoice.outstanding_balance) + prevDue) * 100) / 100;

  const totalClothesQty = items.reduce((sum, it) => sum + (it.unit === 'piece' ? (it.quantity || 1) : 1), 0);

  const itemDetailsLines = items.map(it => {
    if (it.unit === 'kg') {
      return `• ${it.item_name} (${it.weight_display || `${it.weight_kg} kg`}) = ₹${Number(it.line_total).toFixed(2)}`;
    }
    if (it.unit === 'sq_ft') {
      return `• ${it.item_name} (${it.sq_ft} sq.ft @ ₹${it.rate}/sq.ft) = ₹${Number(it.line_total).toFixed(2)}`;
    }
    return `• ${it.item_name} — ${it.quantity} pcs × ₹${Number(it.rate).toFixed(2)} = ₹${Number(it.line_total).toFixed(2)}`;
  });

  const message = [
    `*Friends Laundry & Dry Cleaners*`,
    `Tax Invoice & Order Bill Summary`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Order No: ${invoice.order_number}`,
    `Invoice No: ${invoice.invoice_number}`,
    `Customer: ${invoice.customer_name} (${invoice.customer_mobile})`,
    ``,
    `*📋 Garment Breakdown:*`,
    ...(itemDetailsLines.length > 0 ? itemDetailsLines : ['• Clothes recorded at pickup']),
    ``,
    `*💰 Billing Summary:*`,
    `Current Order Bill: ₹${Number(invoice.final_total).toFixed(2)}`,
    ...(prevDue > 0 ? [`Previous Unpaid Due: ₹${prevDue.toFixed(2)}`] : []),
    `*Total Balance Due: ₹${totalCombinedDue.toFixed(2)}*`,
    `Payment Status: ${invoice.payment_status.toUpperCase()}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Thank you for choosing Friends Laundry & Dry Cleaners!`
  ].join('\n');

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  // Log to database as prepared for click-to-chat
  const logId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO whatsapp_logs (id, order_id, invoice_id, customer_id, phone, message_text, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'prepared', ?)
  `).run(logId, invoice.order_id, invoice.id, invoice.customer_id, phone, message, now);

  logAudit(req.user!.id, 'SHARE_WHATSAPP_BILL', 'invoice', invoice.id, { 
    phone, 
    invoiceNumber: invoice.invoice_number,
    totalClothesQty
  });

  res.json({
    success: true,
    phone,
    message,
    whatsappUrl: waUrl,
    hint: 'WhatsApp opened with pre-filled message. Please press Send in WhatsApp to deliver the bill.'
  });
});

// WhatsApp Pickup Proof & Handover Receipt sharing
apiRouter.post('/orders/:id/pickup-proof-whatsapp', authenticate, (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const order = db.prepare(`
    SELECT 
      o.*, 
      COALESCE(c.name, 'Customer') as customer_name, 
      COALESCE(c.mobile, '') as customer_mobile,
      COALESCE(s.name, 'Friends Laundry') as shop_name, 
      s.phone as shop_phone,
      d.name as delivery_boy_name
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN shops s ON s.id = o.shop_id
    LEFT JOIN users d ON d.id = o.assigned_delivery_boy_id
    WHERE o.id = ?
  `).get(orderId) as any;

  if (!order) return res.status(404).json({ error: 'Order not found' });

  let phone = order.customer_mobile.replace(/\D/g, '');
  if (phone.length === 10) {
    phone = '91' + phone;
  }

  const photos = db.prepare('SELECT id FROM order_photos WHERE order_id = ?').all(orderId) as any[];
  const photoCount = photos.length;

  const totalPieces = order.total_pieces || ((order.iron_count || 0) + (order.dryclean_count || 0) + (order.wash_count || 0));
  const proofNotes = order.pickup_proof_notes || order.special_instructions || null;

  const breakdownParts: string[] = [];
  if (order.iron_count > 0) breakdownParts.push(`• Ironing: ${order.iron_count} pcs`);
  if (order.dryclean_count > 0) breakdownParts.push(`• Dry Clean: ${order.dryclean_count} pcs`);
  if (order.wash_count > 0) breakdownParts.push(`• Wash & Fold: ${order.wash_count} pcs`);
  if (order.pickup_weight_total_grams > 0) {
    breakdownParts.push(`• Weight: ${order.pickup_weight_kg || 0} kg ${order.pickup_weight_grams || 0} g`);
  }

  const message = [
    `*🧺 ${order.shop_name || 'LaundryFlow'} — PICKUP PROOF RECEIPT*`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `*Order No:* ${order.order_number}`,
    `*Date & Time:* ${new Date(order.created_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    `*Customer:* ${order.customer_name} (${order.customer_mobile})`,
    `*Address:* ${order.pickup_address}`,
    `*Picked up by:* ${order.delivery_boy_name || req.user?.name || 'Delivery Executive'}`,
    ``,
    `*📋 RECEIVED CLOTHES PROOF / SUMMARY:*`,
    `• Total Clothes: ${totalPieces > 0 ? totalPieces + ' pieces' : 'Handed over'}`,
    ...(breakdownParts.length > 0 ? breakdownParts : []),
    ``,
    `*📝 Clothes Proof Notes & Details:*`,
    `${proofNotes || '(Garments handed over in standard laundry bag)'}`,
    ...(photoCount > 0 ? [``, `📷 *Proof Photos:* ${photoCount} handover photo(s) captured`] : []),
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ *IMPORTANT NOTICE:*`,
    `This is an official Pickup Proof & Handover Receipt.`,
    `Accurate final bill with item-wise pricing will be generated at the shop after cloth checking.`,
    ``,
    `Thank you!`,
    `${order.shop_name || 'LaundryFlow Manager'}`
  ].join('\n');

  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

  const logId = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO whatsapp_logs (id, order_id, invoice_id, customer_id, phone, message_text, status, created_at)
    VALUES (?, ?, NULL, ?, ?, ?, 'prepared', ?)
  `).run(logId, order.id, order.customer_id, phone, message, now);

  logAudit(req.user!.id, 'SHARE_WHATSAPP_PICKUP_PROOF', 'order', order.id, { 
    phone, 
    orderNumber: order.order_number,
    totalPieces
  });

  res.json({
    success: true,
    phone,
    message,
    whatsappUrl: waUrl,
    hint: 'WhatsApp opened with pre-filled Pickup Proof message. Press Send to deliver the proof receipt.'
  });
});

// -------------------------------------------------------------
// DUE PAYMENTS & PAYMENT COLLECTIONS
// -------------------------------------------------------------

apiRouter.get('/due-payments/summary', authenticate, (req: AuthenticatedRequest, res) => {
  const summary = db.prepare(`
    SELECT 
      s.id as shop_id,
      s.name as shop_name,
      s.code as shop_code,
      s.phone as shop_phone,
      s.address as shop_address,
      COUNT(inv.id) as due_orders_count,
      COALESCE(SUM(inv.outstanding_balance), 0) as total_due_amount
    FROM shops s
    LEFT JOIN invoices inv ON inv.shop_id = s.id AND inv.outstanding_balance > 0
    GROUP BY s.id, s.name, s.code, s.phone, s.address
    ORDER BY total_due_amount DESC, s.name ASC
  `).all() as any[];

  const totals = summary.reduce(
    (acc, curr) => ({
      total_orders_with_due: acc.total_orders_with_due + Number(curr.due_orders_count || 0),
      total_outstanding_amount: Math.round((acc.total_outstanding_amount + Number(curr.total_due_amount || 0)) * 100) / 100
    }),
    { total_orders_with_due: 0, total_outstanding_amount: 0 }
  );

  res.json({ summary, totals });
});

apiRouter.get('/due-payments', authenticate, (req: AuthenticatedRequest, res) => {
  const requestedShopId = (req.query.shop_id as string) || '';

  let sql = `
    SELECT 
      inv.id as invoice_id, inv.invoice_number, inv.date, inv.final_total, inv.amount_paid, inv.outstanding_balance,
      o.id as order_id, COALESCE(o.order_number, '') as order_number, COALESCE(o.status, 'delivered') as order_status, o.pickup_date,
      o.delivery_type, o.expected_payment_date, o.credit_notes,
      c.id as customer_id, COALESCE(c.name, 'Customer') as customer_name, COALESCE(c.mobile, '') as customer_mobile, c.area as customer_area, c.flat_number, c.building_name,
      s.id as shop_id, COALESCE(s.name, 'Friends Laundry') as shop_name,
      d.id as delivery_boy_id, d.name as delivery_boy_name
    FROM invoices inv
    LEFT JOIN orders o ON o.id = inv.order_id
    LEFT JOIN customers c ON c.id = inv.customer_id
    LEFT JOIN shops s ON s.id = inv.shop_id
    LEFT JOIN users d ON d.id = o.assigned_delivery_boy_id
    WHERE inv.outstanding_balance > 0
  `;

  const params: any[] = [];
  if (req.user?.role === 'shop') {
    sql += ' AND inv.shop_id = ?';
    params.push(req.user.shop_id);
  } else if (req.user?.role === 'delivery') {
    const scope = req.query.scope as string;
    if (scope === 'assigned') {
      sql += ' AND o.assigned_delivery_boy_id = ?';
      params.push(req.user.id);
    } else if (req.user.service_area_id) {
      sql += ' AND (o.assigned_delivery_boy_id = ? OR c.area IN (SELECT name FROM service_areas WHERE id = ?))';
      params.push(req.user.id, req.user.service_area_id);
    }
  } else if (req.user?.role === 'admin' && requestedShopId && requestedShopId !== 'all') {
    sql += ' AND inv.shop_id = ?';
    params.push(requestedShopId);
  }

  sql += ' ORDER BY inv.outstanding_balance DESC';
  const duePayments = db.prepare(sql).all(...params) as any[];

  // Attach customer's other unpaid dues & combined due without double counting
  for (const item of duePayments) {
    const prevRow = db.prepare(`
      SELECT COALESCE(SUM(outstanding_amount), 0) as s
      FROM orders
      WHERE customer_id = ? AND id != ? AND outstanding_amount > 0
    `).get(item.customer_id, item.order_id) as { s: number };

    item.previous_unpaid_due = Math.round((prevRow ? prevRow.s : 0) * 100) / 100;
    item.total_customer_due = Math.round((Number(item.outstanding_balance) + item.previous_unpaid_due) * 100) / 100;
  }

  res.json({ duePayments });
});

apiRouter.post('/payments/collect', authenticate, (req: AuthenticatedRequest, res) => {
  try {
    const { order_id, invoice_id, amount, payment_method, transaction_reference, notes } = req.body;
    const payAmount = parseFloat(amount);

    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount greater than zero is required.' });
    }

    const validMethods = ['cash', 'upi', 'card', 'bank_transfer'];
    if (!validMethods.includes(payment_method)) {
      return res.status(400).json({ error: 'Valid payment method (cash, upi, card) is required.' });
    }

    // Look up order & invoice
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id) as any;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    let invoice = null;
    if (invoice_id) {
      invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoice_id) as any;
    } else {
      invoice = db.prepare('SELECT * FROM invoices WHERE order_id = ?').get(order_id) as any;
    }

    // Calculate customer's other unpaid orders due balance
    const otherOrdersDueRow = db.prepare(`
      SELECT COALESCE(SUM(outstanding_amount), 0) as total_prev
      FROM orders
      WHERE customer_id = ? AND id != ? AND outstanding_amount > 0
    `).get(order.customer_id, order.id) as { total_prev: number };

    const previousUnpaidDue = Math.round((Number(otherOrdersDueRow?.total_prev) || 0) * 100) / 100;
    const currentOrderDue = Math.round((Number(invoice ? invoice.outstanding_balance : order.outstanding_amount) || 0) * 100) / 100;
    const totalCombinedDue = Math.round((currentOrderDue + previousUnpaidDue) * 100) / 100;

    // Strict constraint: Payment amount cannot exceed total combined due
    if (totalCombinedDue > 0 && payAmount > totalCombinedDue + 0.01) {
      return res.status(400).json({ 
        error: `Payment amount ₹${payAmount} exceeds the total customer balance due of ₹${totalCombinedDue.toFixed(2)}.` 
      });
    }

    // Determine collecting delivery boy
    let collectedBy = null;
    if (req.user?.role === 'delivery') {
      collectedBy = req.user.id;
    } else if (order.assigned_delivery_boy_id) {
      collectedBy = order.assigned_delivery_boy_id;
    }

    const now = new Date().toISOString();
    const primaryTxId = crypto.randomUUID();

    // 1. Portion applied to current order
    const paymentForCurrentOrder = Math.min(payAmount, currentOrderDue);
    const overflowToOtherOrders = Math.max(0, Math.round((payAmount - paymentForCurrentOrder) * 100) / 100);

    // Insert payment transaction for current order
    db.prepare(`
      INSERT INTO payment_transactions (
        id, order_id, invoice_id, customer_id, shop_id, amount, payment_method, 
        transaction_reference, collected_by_delivery_boy_id, is_settled_with_shop, notes, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, 0, ?, ?
      )
    `).run(
      primaryTxId,
      order.id,
      invoice ? invoice.id : null,
      order.customer_id,
      order.shop_id,
      paymentForCurrentOrder,
      payment_method,
      transaction_reference || null,
      collectedBy,
      notes || null,
      now
    );

    // Recalculate totals for current order
    const totalPaidRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_paid 
      FROM payment_transactions 
      WHERE order_id = ?
    `).get(order.id) as { total_paid: number };

    const totalPaid = totalPaidRow.total_paid;
    const newOutstanding = Math.max(0, order.final_total - totalPaid);
    const paymentStatus = newOutstanding <= 0.01 ? 'paid' : (totalPaid > 0 ? 'partially_paid' : 'unpaid');

    // Update order
    db.prepare(`
      UPDATE orders 
      SET amount_paid = ?, outstanding_amount = ?, payment_status = ?, updated_at = ?
      WHERE id = ?
    `).run(totalPaid, newOutstanding, paymentStatus, now, order.id);

    // Update invoice if exists
    if (invoice) {
      db.prepare(`
        UPDATE invoices 
        SET amount_paid = ?, outstanding_balance = ?, payment_status = ?
        WHERE id = ?
      `).run(totalPaid, newOutstanding, paymentStatus, invoice.id);
    }

    syncPaymentToCloud(primaryTxId).catch(() => {});
    syncOrderToCloud(order.id).catch(() => {});

    // 2. If customer paid more than current order due, allocate overflow to older unpaid bills (FIFO)
    const extraAllocations: any[] = [];
    if (overflowToOtherOrders > 0) {
      let remainingOverflow = overflowToOtherOrders;
      const olderUnpaidOrders = db.prepare(`
        SELECT * FROM orders 
        WHERE customer_id = ? AND id != ? AND outstanding_amount > 0 
        ORDER BY created_at ASC
      `).all(order.customer_id, order.id) as any[];

      for (const oldOrd of olderUnpaidOrders) {
        if (remainingOverflow <= 0) break;
        const oldDue = Number(oldOrd.outstanding_amount) || 0;
        const alloc = Math.min(remainingOverflow, oldDue);
        const subTxId = crypto.randomUUID();

        db.prepare(`
          INSERT INTO payment_transactions (
            id, order_id, invoice_id, customer_id, shop_id, amount, payment_method, 
            transaction_reference, collected_by_delivery_boy_id, is_settled_with_shop, notes, created_at
          ) VALUES (
            ?, ?, (SELECT id FROM invoices WHERE order_id = ?), ?, ?, ?, ?, 
            ?, ?, 0, ?, ?
          )
        `).run(
          subTxId,
          oldOrd.id,
          oldOrd.id,
          order.customer_id,
          oldOrd.shop_id,
          alloc,
          payment_method,
          transaction_reference || `PREV-DUE-${order.order_number}`,
          collectedBy,
          `Previous due cleared during delivery of ${order.order_number}`,
          now
        );

        const newOldPaid = (Number(oldOrd.amount_paid) || 0) + alloc;
        const newOldOutstanding = Math.max(0, oldDue - alloc);
        const newOldStatus = newOldOutstanding <= 0.01 ? 'paid' : 'partially_paid';

        db.prepare(`
          UPDATE orders 
          SET amount_paid = ?, outstanding_amount = ?, payment_status = ?, updated_at = ?
          WHERE id = ?
        `).run(newOldPaid, newOldOutstanding, newOldStatus, now, oldOrd.id);

        db.prepare(`
          UPDATE invoices 
          SET amount_paid = ?, outstanding_balance = ?, payment_status = ?
          WHERE order_id = ?
        `).run(newOldPaid, newOldOutstanding, newOldStatus, oldOrd.id);

        syncPaymentToCloud(subTxId).catch(() => {});
        syncOrderToCloud(oldOrd.id).catch(() => {});

        remainingOverflow = Math.max(0, Math.round((remainingOverflow - alloc) * 100) / 100);
        extraAllocations.push({ orderId: oldOrd.id, orderNumber: oldOrd.order_number, amount: alloc, newOutstanding: newOldOutstanding });
      }
    }

    syncCustomerToCloud(order.customer_id).catch(() => {});
    backupDatabase();

    logAudit(req.user!.id, 'COLLECT_PAYMENT', 'payment_transaction', primaryTxId, {
      orderId: order.id,
      amount: payAmount,
      method: payment_method,
      currentOrderPaid: paymentForCurrentOrder,
      overflowAllocations: extraAllocations,
      remainingDue: newOutstanding
    });

    res.json({
      success: true,
      transactionId: primaryTxId,
      amountPaid: totalPaid,
      remainingBalance: newOutstanding,
      paymentStatus,
      overflowAllocations: extraAllocations,
      totalCustomerRemainingDue: Math.max(0, Math.round((newOutstanding + Math.max(0, previousUnpaidDue - overflowToOtherOrders)) * 100) / 100)
    });
  } catch (err: any) {
    console.error('[POST /payments/collect Error]:', err);
    res.status(500).json({ error: err.message || 'Failed to collect payment' });
  }
});

// -------------------------------------------------------------
// SHOP CASH SETTLEMENT
// -------------------------------------------------------------

apiRouter.get('/settlements/pending', authenticate, (req: AuthenticatedRequest, res) => {
  const requestedShopId = (req.query.shop_id as string) || '';
  // Query cash collected by delivery boys that hasn't been handed over to the shop yet
  let sql = `
    SELECT 
      pt.shop_id, pt.collected_by_delivery_boy_id,
      COALESCE(s.name, 'Friends Laundry') as shop_name,
      COALESCE(d.name, 'Staff') as delivery_boy_name, d.email_or_phone as delivery_boy_phone,
      COUNT(pt.id) as transaction_count,
      SUM(pt.amount) as total_collected_pending
    FROM payment_transactions pt
    LEFT JOIN shops s ON s.id = pt.shop_id
    LEFT JOIN users d ON d.id = pt.collected_by_delivery_boy_id
    WHERE pt.is_settled_with_shop = 0 AND pt.payment_method = 'cash'
  `;

  const params: any[] = [];
  if (req.user?.role === 'shop') {
    sql += ' AND pt.shop_id = ?';
    params.push(req.user.shop_id);
  } else if (req.user?.role === 'delivery') {
    sql += ' AND pt.collected_by_delivery_boy_id = ?';
    params.push(req.user.id);
  } else if (req.user?.role === 'admin' && requestedShopId && requestedShopId !== 'all') {
    sql += ' AND pt.shop_id = ?';
    params.push(requestedShopId);
  }

  sql += ' GROUP BY pt.shop_id, pt.collected_by_delivery_boy_id';
  const pending = db.prepare(sql).all(...params);
  res.json({ pendingSettlements: pending });
});

apiRouter.get('/settlements', authenticate, (req: AuthenticatedRequest, res) => {
  const requestedShopId = (req.query.shop_id as string) || '';
  let sql = `
    SELECT 
      ss.*, 
      COALESCE(s.name, 'Friends Laundry') as shop_name,
      COALESCE(d.name, 'Staff') as delivery_boy_name,
      COALESCE(u.name, 'Admin') as confirmed_by_name
    FROM shop_settlements ss
    LEFT JOIN shops s ON s.id = ss.shop_id
    LEFT JOIN users d ON d.id = ss.delivery_boy_id
    LEFT JOIN users u ON u.id = ss.confirmed_by_user_id
  `;

  const params: any[] = [];
  if (req.user?.role === 'shop') {
    sql += ' WHERE ss.shop_id = ?';
    params.push(req.user.shop_id);
  } else if (req.user?.role === 'delivery') {
    sql += ' WHERE ss.delivery_boy_id = ?';
    params.push(req.user.id);
  } else if (req.user?.role === 'admin' && requestedShopId && requestedShopId !== 'all') {
    sql += ' WHERE ss.shop_id = ?';
    params.push(requestedShopId);
  }

  sql += ' ORDER BY ss.created_at DESC';
  const settlements = db.prepare(sql).all(...params);
  res.json({ settlements });
});

apiRouter.post('/settlements/record', authenticate, requireRole(['admin', 'shop']), (req: AuthenticatedRequest, res) => {
  const { shop_id, delivery_boy_id, amount_settled, notes } = req.body;
  const settledAmount = parseFloat(amount_settled);

  if (!shop_id || !delivery_boy_id || !settledAmount || settledAmount <= 0) {
    return res.status(400).json({ error: 'Shop, Delivery Boy, and valid Settled Amount are required.' });
  }

  if (req.user?.role === 'shop' && req.user.shop_id !== shop_id) {
    return res.status(403).json({ error: 'Unauthorized for this shop' });
  }

  // Calculate total cash collected that is pending settlement
  const pendingRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_unsettled 
    FROM payment_transactions 
    WHERE shop_id = ? AND collected_by_delivery_boy_id = ? AND is_settled_with_shop = 0 AND payment_method = 'cash'
  `).get(shop_id, delivery_boy_id) as { total_unsettled: number };

  const totalCollected = pendingRow.total_unsettled;
  if (settledAmount > totalCollected + 0.01) {
    return res.status(400).json({ 
      error: `Settlement amount ₹${settledAmount} exceeds total unsettled cash ₹${totalCollected.toFixed(2)}.` 
    });
  }

  const remaining = Math.max(0, totalCollected - settledAmount);
  const settlementId = crypto.randomUUID();
  const year = new Date().getFullYear();
  const countRow = db.prepare("SELECT COUNT(*) as count FROM shop_settlements WHERE settlement_number LIKE ?").get(`SETT-${year}-%`) as { count: number };
  const seq = String(countRow.count + 1).padStart(4, '0');
  const settlementNumber = `SETT-${year}-${seq}`;
  const now = new Date().toISOString();

  // Create settlement record
  db.prepare(`
    INSERT INTO shop_settlements (
      id, settlement_number, shop_id, delivery_boy_id, amount_collected, amount_settled, remaining_unsettled, confirmed_by_user_id, notes, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `).run(
    settlementId,
    settlementNumber,
    shop_id,
    delivery_boy_id,
    totalCollected,
    settledAmount,
    remaining,
    req.user!.id,
    notes || null,
    now
  );

  // Mark transactions as settled up to settledAmount
  const unsettledTxs = db.prepare(`
    SELECT id, amount 
    FROM payment_transactions 
    WHERE shop_id = ? AND collected_by_delivery_boy_id = ? AND is_settled_with_shop = 0 AND payment_method = 'cash'
    ORDER BY created_at ASC
  `).all(shop_id, delivery_boy_id) as { id: string; amount: number }[];

  let accumulated = 0;
  for (const tx of unsettledTxs) {
    if (accumulated + tx.amount <= settledAmount + 0.01) {
      db.prepare(`
        UPDATE payment_transactions 
        SET is_settled_with_shop = 1, settlement_id = ? 
        WHERE id = ?
      `).run(settlementId, tx.id);
      accumulated += tx.amount;
    }
  }

  logAudit(req.user!.id, 'CONFIRM_SETTLEMENT', 'shop_settlement', settlementId, {
    shop_id,
    delivery_boy_id,
    amount_settled: settledAmount,
    remaining_unsettled: remaining
  });

  res.json({
    success: true,
    settlementId,
    settlementNumber,
    amountSettled: settledAmount,
    remainingUnsettled: remaining
  });
});

// -------------------------------------------------------------
// DASHBOARD & METRICS
// -------------------------------------------------------------

apiRouter.get('/dashboard/stats', authenticate, (req: AuthenticatedRequest, res) => {
  updatePresenceStatus();
  const role = req.user!.role;
  const today = new Date().toISOString().split('T')[0];

  if (role === 'admin') {
    const requestedShopId = (req.query.shop_id as string) || '';
    const hasShop = Boolean(requestedShopId && requestedShopId !== 'all');

    const totalShops = (db.prepare('SELECT COUNT(*) as c FROM shops').get() as any).c;
    const onlineBoys = (db.prepare(`
      SELECT COUNT(*) as c FROM users 
      WHERE role = 'delivery' AND status = 'active' AND is_online = 1
        AND id NOT IN (SELECT id FROM deleted_delivery_boy_tombstones)
    `).get() as any).c;
    const availableBoys = (db.prepare(`
      SELECT COUNT(*) as c FROM users 
      WHERE role = 'delivery' AND status = 'active' AND is_online = 1 AND is_busy = 0
        AND id NOT IN (SELECT id FROM deleted_delivery_boy_tombstones)
    `).get() as any).c;

    const todayPickups = hasShop
      ? (db.prepare("SELECT COUNT(*) as c FROM orders WHERE DATE(pickup_date) = ? AND shop_id = ?").get(today, requestedShopId) as any).c
      : (db.prepare("SELECT COUNT(*) as c FROM orders WHERE DATE(pickup_date) = ?").get(today) as any).c;

    const todayDeliveries = hasShop
      ? (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered' AND DATE(updated_at) = ? AND shop_id = ?").get(today, requestedShopId) as any).c
      : (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'delivered' AND DATE(updated_at) = ?").get(today) as any).c;

    const pendingOrders = hasShop
      ? (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending', 'created', 'assigned', 'pickup_started', 'arriving', 'picked_up', 'received_at_shop', 'in_processing', 'ready_for_delivery', 'out_for_delivery') AND shop_id = ?").get(requestedShopId) as any).c
      : (db.prepare("SELECT COUNT(*) as c FROM orders WHERE status IN ('pending', 'created', 'assigned', 'pickup_started', 'arriving', 'picked_up', 'received_at_shop', 'in_processing', 'ready_for_delivery', 'out_for_delivery')").get() as any).c;

    const totalOutstanding = hasShop
      ? (db.prepare("SELECT COALESCE(SUM(outstanding_amount), 0) as s FROM orders WHERE shop_id = ?").get(requestedShopId) as any).s
      : (db.prepare("SELECT COALESCE(SUM(outstanding_amount), 0) as s FROM orders").get() as any).s;

    const todayCollections = hasShop
      ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE DATE(created_at) = ? AND shop_id = ?").get(today, requestedShopId) as any).s
      : (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE DATE(created_at) = ?").get(today) as any).s;

    const pendingSettlements = hasShop
      ? (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE is_settled_with_shop = 0 AND payment_method = 'cash' AND shop_id = ?").get(requestedShopId) as any).s
      : (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE is_settled_with_shop = 0 AND payment_method = 'cash'").get() as any).s;

    // Overdue credit dues
    const overdueRow = hasShop
      ? (db.prepare(`
          SELECT COUNT(*) as c, COALESCE(SUM(outstanding_amount), 0) as s
          FROM orders
          WHERE outstanding_amount > 0 AND expected_payment_date IS NOT NULL AND expected_payment_date < ? AND shop_id = ?
        `).get(today, requestedShopId) as { c: number; s: number })
      : (db.prepare(`
          SELECT COUNT(*) as c, COALESCE(SUM(outstanding_amount), 0) as s
          FROM orders
          WHERE outstanding_amount > 0 AND expected_payment_date IS NOT NULL AND expected_payment_date < ?
        `).get(today) as { c: number; s: number });

    // Itemized collection transactions list
    const todayCollectionsList = hasShop
      ? (db.prepare(`
          SELECT 
            pt.id, pt.amount, pt.payment_method, pt.created_at,
            c.name as customer_name,
            o.order_number,
            COALESCE(u.name, pt.recorded_by_name, 'Staff') as collected_by
          FROM payment_transactions pt
          LEFT JOIN customers c ON c.id = pt.customer_id
          LEFT JOIN orders o ON o.id = pt.order_id
          LEFT JOIN users u ON u.id = pt.collected_by_delivery_boy_id
          WHERE DATE(pt.created_at) = ? AND pt.shop_id = ?
          ORDER BY pt.created_at DESC
          LIMIT 15
        `).all(today, requestedShopId) as any[])
      : (db.prepare(`
          SELECT 
            pt.id, pt.amount, pt.payment_method, pt.created_at,
            c.name as customer_name,
            o.order_number,
            COALESCE(u.name, pt.recorded_by_name, 'Staff') as collected_by
          FROM payment_transactions pt
          LEFT JOIN customers c ON c.id = pt.customer_id
          LEFT JOIN orders o ON o.id = pt.order_id
          LEFT JOIN users u ON u.id = pt.collected_by_delivery_boy_id
          WHERE DATE(pt.created_at) = ?
          ORDER BY pt.created_at DESC
          LIMIT 15
        `).all(today) as any[]);

    // Always provide per-shop breakdown so UI can present shop-wise metrics
    const shopsList = db.prepare('SELECT id, name, code, phone, address FROM shops ORDER BY name ASC').all() as any[];
    const shopsBreakdown = shopsList.map(sh => {
      const oCount = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE shop_id = ?').get(sh.id) as any).c;
      const pCount = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE shop_id = ? AND status IN ('pending', 'created', 'assigned', 'pickup_started', 'arriving', 'picked_up', 'received_at_shop', 'in_processing', 'ready_for_delivery', 'out_for_delivery')").get(sh.id) as any).c;
      const dRow = db.prepare("SELECT COUNT(*) as c, COALESCE(SUM(outstanding_balance), 0) as s FROM invoices WHERE shop_id = ? AND outstanding_balance > 0").get(sh.id) as any;
      const cToday = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE shop_id = ? AND DATE(created_at) = ?").get(sh.id, today) as any).s;
      return {
        shop_id: sh.id,
        shop_name: sh.name,
        shop_code: sh.code,
        shop_phone: sh.phone,
        total_orders: oCount,
        pending_orders: pCount,
        due_orders_count: dRow.c || 0,
        total_due_amount: Math.round((dRow.s || 0) * 100) / 100,
        today_collections: Math.round((cToday || 0) * 100) / 100
      };
    });

    return res.json({
      role: 'admin',
      selectedShopId: hasShop ? requestedShopId : null,
      totalShops,
      onlineBoys,
      availableBoys,
      todayPickups,
      todayDeliveries,
      pendingOrders,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      todayCollections: Math.round(todayCollections * 100) / 100,
      pendingSettlements: Math.round(pendingSettlements * 100) / 100,
      overdueDuesCount: overdueRow.c || 0,
      overdueDuesAmount: Math.round((overdueRow.s || 0) * 100) / 100,
      todayCollectionsList,
      shopsBreakdown
    });
  }

  if (role === 'shop') {
    const shopId = req.user!.shop_id;
    const todayOrders = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE shop_id = ? AND DATE(created_at) = ?").get(shopId, today) as any).c;
    const assignedBoys = (db.prepare("SELECT COUNT(DISTINCT assigned_delivery_boy_id) as c FROM orders WHERE shop_id = ? AND assigned_delivery_boy_id IS NOT NULL").get(shopId) as any).c;
    const pendingDeliveries = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE shop_id = ? AND status IN ('ready_for_delivery', 'out_for_delivery')").get(shopId) as any).c;
    const generatedInvoices = (db.prepare("SELECT COUNT(*) as c FROM invoices WHERE shop_id = ?").get(shopId) as any).c;
    const outstandingDue = (db.prepare("SELECT COALESCE(SUM(outstanding_amount), 0) as s FROM orders WHERE shop_id = ?").get(shopId) as any).s;
    const collectionsToday = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE shop_id = ? AND DATE(created_at) = ?").get(shopId, today) as any).s;

    return res.json({
      role: 'shop',
      todayOrders,
      assignedBoys,
      pendingDeliveries,
      generatedInvoices,
      outstandingDue,
      collectionsToday
    });
  }

  if (role === 'delivery') {
    const boyId = req.user!.id;
    const assignedPickups = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE assigned_delivery_boy_id = ? AND status IN ('assigned', 'arriving')").get(boyId) as any).c;
    const assignedDeliveries = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE assigned_delivery_boy_id = ? AND status = 'out_for_delivery'").get(boyId) as any).c;
    const pendingTasks = (db.prepare("SELECT COUNT(*) as c FROM orders WHERE assigned_delivery_boy_id = ? AND status NOT IN ('delivered', 'cancelled', 'failed')").get(boyId) as any).c;
    const amountToCollect = (db.prepare("SELECT COALESCE(SUM(outstanding_amount), 0) as s FROM orders WHERE assigned_delivery_boy_id = ? AND status IN ('out_for_delivery', 'delivered') AND outstanding_amount > 0").get(boyId) as any).s;
    const amountCollectedToday = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE collected_by_delivery_boy_id = ? AND DATE(created_at) = ?").get(boyId, today) as any).s;
    const awaitingSettlement = (db.prepare("SELECT COALESCE(SUM(amount), 0) as s FROM payment_transactions WHERE collected_by_delivery_boy_id = ? AND is_settled_with_shop = 0 AND payment_method = 'cash'").get(boyId) as any).s;

    return res.json({
      role: 'delivery',
      assignedPickups,
      assignedDeliveries,
      pendingTasks,
      amountToCollect,
      amountCollectedToday,
      awaitingSettlement,
      is_online: req.user!.is_online,
      is_busy: req.user!.is_busy
    });
  }

  res.json({ role });
});

// -------------------------------------------------------------
// AUDIT LOGS & REPORTS EXPORT
// -------------------------------------------------------------

apiRouter.get('/audit-logs', authenticate, requireRole(['admin']), (req, res) => {
  const logs = db.prepare(`
    SELECT al.*, u.name as user_name, u.role as user_role
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    ORDER BY al.created_at DESC
    LIMIT 100
  `).all();
  res.json({ logs });
});

apiRouter.get('/reports/export', authenticate, (req: AuthenticatedRequest, res) => {
  const type = req.query.type as string; // 'orders', 'due_payments', 'collections', 'settlements'
  const rawShopId = req.user?.role === 'shop' ? req.user.shop_id : (req.query.shop_id as string);
  const shopId = (rawShopId && rawShopId !== 'all') ? rawShopId : null;

  let rows: any[] = [];
  const params: any[] = [];

  if (type === 'orders') {
    let sql = `
      SELECT o.order_number, o.pickup_date, o.status, 
             COALESCE(c.name, 'Customer') as customer_name, COALESCE(c.mobile, '') as mobile, 
             COALESCE(s.name, 'Friends Laundry') as shop_name, o.final_total, o.amount_paid, o.outstanding_amount, o.created_at
      FROM orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN shops s ON s.id = o.shop_id
    `;
    if (shopId) {
      sql += ' WHERE o.shop_id = ?';
      params.push(shopId);
    }
    sql += ' ORDER BY o.created_at DESC';
    rows = db.prepare(sql).all(...params);
  } else if (type === 'due_payments') {
    let sql = `
      SELECT inv.invoice_number, 
             COALESCE(c.name, 'Customer') as customer_name, COALESCE(c.mobile, '') as mobile, 
             COALESCE(s.name, 'Friends Laundry') as shop_name, 
             inv.final_total, inv.amount_paid, inv.outstanding_balance, inv.payment_status
      FROM invoices inv
      LEFT JOIN customers c ON c.id = inv.customer_id
      LEFT JOIN shops s ON s.id = inv.shop_id
      WHERE inv.outstanding_balance > 0
    `;
    if (shopId) {
      sql += ' AND inv.shop_id = ?';
      params.push(shopId);
    }
    sql += ' ORDER BY inv.outstanding_balance DESC';
    rows = db.prepare(sql).all(...params);
  } else if (type === 'collections') {
    let sql = `
      SELECT pt.created_at, pt.amount, pt.payment_method, pt.transaction_reference, 
             COALESCE(c.name, 'Customer') as customer_name, 
             COALESCE(s.name, 'Friends Laundry') as shop_name, 
             COALESCE(d.name, 'Staff') as collected_by, pt.is_settled_with_shop
      FROM payment_transactions pt
      LEFT JOIN customers c ON c.id = pt.customer_id
      LEFT JOIN shops s ON s.id = pt.shop_id
      LEFT JOIN users d ON d.id = pt.collected_by_delivery_boy_id
    `;
    if (shopId) {
      sql += ' WHERE pt.shop_id = ?';
      params.push(shopId);
    }
    sql += ' ORDER BY pt.created_at DESC';
    rows = db.prepare(sql).all(...params);
  } else if (type === 'settlements') {
    let sql = `
      SELECT ss.settlement_number, ss.created_at, 
             COALESCE(s.name, 'Friends Laundry') as shop_name, 
             COALESCE(d.name, 'Staff') as delivery_boy_name, 
             ss.amount_collected, ss.amount_settled, ss.remaining_unsettled, 
             COALESCE(u.name, 'Admin') as confirmed_by
      FROM shop_settlements ss
      LEFT JOIN shops s ON s.id = ss.shop_id
      LEFT JOIN users d ON d.id = ss.delivery_boy_id
      LEFT JOIN users u ON u.id = ss.confirmed_by_user_id
    `;
    if (shopId) {
      sql += ' WHERE ss.shop_id = ?';
      params.push(shopId);
    }
    sql += ' ORDER BY ss.created_at DESC';
    rows = db.prepare(sql).all(...params);
  }

  res.json({ type, count: rows.length, rows });
});

// -------------------------------------------------------------
// A TO Z MASTER CONTROL & EDITING (ADMIN ONLY)
// -------------------------------------------------------------

apiRouter.get('/admin/master-data', authenticate, requireRole(['admin']), (req, res) => {
  const shops = db.prepare('SELECT s.*, a.name as area_name FROM shops s LEFT JOIN service_areas a ON a.id = s.service_area_id ORDER BY s.name ASC').all();
  const areas = db.prepare('SELECT * FROM service_areas ORDER BY name ASC').all();
  const categories = db.prepare('SELECT * FROM clothing_categories ORDER BY sort_order ASC, name ASC').all();
  const deliveryBoys = db.prepare(`
    SELECT u.id, u.name, u.email_or_phone, u.role, u.status, u.is_online, u.is_busy, u.last_heartbeat, 
           u.service_area_id, u.shop_id, s.name as shop_name, a.name as area_name
    FROM users u
    LEFT JOIN shops s ON s.id = u.shop_id
    LEFT JOIN service_areas a ON a.id = u.service_area_id
    WHERE u.role = 'delivery'
      AND u.status = 'active'
      AND u.id NOT IN (SELECT id FROM deleted_delivery_boy_tombstones)
      AND (u.email_or_phone IS NULL OR u.email_or_phone NOT IN (SELECT phone FROM deleted_delivery_boy_tombstones WHERE phone IS NOT NULL AND phone != ''))
    ORDER BY u.name ASC
  `).all();
  const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC LIMIT 200').all();
  const rawOrders = db.prepare(`
    SELECT o.*, 
           COALESCE(c.name, 'Customer') as customer_name, 
           COALESCE(c.mobile, '') as customer_mobile, 
           COALESCE(s.name, 'Friends Laundry') as shop_name, 
           COALESCE(u.name, 'Unassigned') as delivery_boy_name,
           (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as items_count,
           (SELECT invoice_number FROM invoices WHERE order_id = o.id LIMIT 1) as invoice_number
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN shops s ON s.id = o.shop_id
    LEFT JOIN users u ON u.id = o.assigned_delivery_boy_id
    ORDER BY o.created_at DESC
    LIMIT 200
  `).all() as any[];

  const getItemsStmt = db.prepare('SELECT id, order_id, category_id, item_name, quantity, rate, line_total, unit, weight_kg, weight_display, sq_ft FROM order_items WHERE order_id = ?');
  const orders = rawOrders.map(o => ({
    ...o,
    items: getItemsStmt.all(o.id)
  }));
  const invoices = db.prepare(`
    SELECT inv.*, 
           COALESCE(c.name, 'Customer') as customer_name, 
           COALESCE(c.mobile, '') as customer_mobile, 
           COALESCE(s.name, 'Friends Laundry') as shop_name, 
           COALESCE(o.order_number, '') as order_number
    FROM invoices inv
    LEFT JOIN customers c ON c.id = inv.customer_id
    LEFT JOIN shops s ON s.id = inv.shop_id
    LEFT JOIN orders o ON o.id = inv.order_id
    ORDER BY inv.created_at DESC
    LIMIT 100
  `).all();
  const payments = db.prepare(`
    SELECT pt.*, 
           COALESCE(c.name, 'Customer') as customer_name, 
           COALESCE(s.name, 'Friends Laundry') as shop_name, 
           COALESCE(o.order_number, '') as order_number, 
           COALESCE(u.name, 'Staff') as collected_by
    FROM payment_transactions pt
    LEFT JOIN customers c ON c.id = pt.customer_id
    LEFT JOIN shops s ON s.id = pt.shop_id
    LEFT JOIN orders o ON o.id = pt.order_id
    LEFT JOIN users u ON u.id = pt.collected_by_delivery_boy_id
    ORDER BY pt.created_at DESC
    LIMIT 100
  `).all();

  res.json({
    shops,
    areas,
    categories,
    deliveryBoys,
    customers,
    orders,
    invoices,
    payments
  });
});

// 1. Master Edit Order
apiRouter.put('/admin/orders/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const {
    customer_id,
    shop_id,
    pickup_address,
    delivery_address,
    area,
    pickup_date,
    pickup_time_slot,
    assigned_delivery_boy_id,
    status,
    special_instructions,
    delivery_charge,
    discount_amount,
    payment_status,
    amount_paid,
    outstanding_amount,
    final_total
  } = req.body;

  const currentOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!currentOrder) return res.status(404).json({ error: 'Order not found' });

  const now = new Date().toISOString();

  db.prepare(`
    UPDATE orders SET
      customer_id = COALESCE(?, customer_id),
      shop_id = COALESCE(?, shop_id),
      pickup_address = COALESCE(?, pickup_address),
      delivery_address = COALESCE(?, delivery_address),
      area = COALESCE(?, area),
      pickup_date = COALESCE(?, pickup_date),
      pickup_time_slot = COALESCE(?, pickup_time_slot),
      assigned_delivery_boy_id = ?,
      status = COALESCE(?, status),
      special_instructions = ?,
      delivery_charge = COALESCE(?, delivery_charge),
      discount_amount = COALESCE(?, discount_amount),
      payment_status = COALESCE(?, payment_status),
      amount_paid = COALESCE(?, amount_paid),
      outstanding_amount = COALESCE(?, outstanding_amount),
      final_total = COALESCE(?, final_total),
      updated_at = ?
    WHERE id = ?
  `).run(
    customer_id || null,
    shop_id || null,
    pickup_address || null,
    delivery_address || null,
    area || null,
    pickup_date || null,
    pickup_time_slot || null,
    assigned_delivery_boy_id || null,
    status || null,
    special_instructions !== undefined ? special_instructions : currentOrder.special_instructions,
    delivery_charge !== undefined ? parseFloat(delivery_charge) : null,
    discount_amount !== undefined ? parseFloat(discount_amount) : null,
    payment_status || null,
    amount_paid !== undefined ? parseFloat(amount_paid) : null,
    outstanding_amount !== undefined ? parseFloat(outstanding_amount) : null,
    final_total !== undefined ? parseFloat(final_total) : null,
    now,
    orderId
  );

  // Sync to invoice if invoice exists
  const invoice = db.prepare('SELECT id FROM invoices WHERE order_id = ?').get(orderId) as any;
  if (invoice) {
    db.prepare(`
      UPDATE invoices SET
        delivery_charge = COALESCE(?, delivery_charge),
        discount_amount = COALESCE(?, discount_amount),
        final_total = COALESCE(?, final_total),
        amount_paid = COALESCE(?, amount_paid),
        outstanding_balance = COALESCE(?, outstanding_balance),
        payment_status = COALESCE(?, payment_status),
        customer_id = COALESCE(?, customer_id),
        shop_id = COALESCE(?, shop_id)
      WHERE id = ?
    `).run(
      delivery_charge !== undefined ? parseFloat(delivery_charge) : null,
      discount_amount !== undefined ? parseFloat(discount_amount) : null,
      final_total !== undefined ? parseFloat(final_total) : null,
      amount_paid !== undefined ? parseFloat(amount_paid) : null,
      outstanding_amount !== undefined ? parseFloat(outstanding_amount) : null,
      payment_status || null,
      customer_id || null,
      shop_id || null,
      invoice.id
    );
  }

  // Record status history if changed
  if (status && status !== currentOrder.status) {
    db.prepare(`
      INSERT INTO order_status_history (id, order_id, status, changed_by_user_id, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), orderId, status, req.user!.id, 'Status changed via Master Editor', now);
  }

  backupDatabase();
  syncOrderToCloud(orderId).catch(() => {});
  logAudit(req.user!.id, 'MASTER_EDIT_ORDER', 'order', orderId, req.body);
  res.json({ success: true, message: 'Order updated successfully' });
});

// 2. Master Edit Order Items & Quantities (Full live re-count & bill recalculation)
apiRouter.put('/admin/orders/:id/items', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const { items, delivery_charge = 0, discount_amount = 0 } = req.body;

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Items array is required' });
  }

  // Delete existing items
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);

  let newSubtotal = 0;
  for (const it of items) {
    const q = Math.max(0, parseInt(it.quantity, 10) || 0);
    const r = Math.max(0, parseFloat(it.rate) || 0);
    if (q > 0) {
      const lineTotal = Math.round(q * r * 100) / 100;
      newSubtotal += lineTotal;
      db.prepare(`
        INSERT INTO order_items (id, order_id, item_name, quantity, rate, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), orderId, it.item_name || it.name, q, r, lineTotal);
    }
  }

  const dCharge = Math.max(0, parseFloat(delivery_charge) || 0);
  const dDiscount = Math.max(0, parseFloat(discount_amount) || 0);
  const finalTotal = Math.max(0, newSubtotal + dCharge - dDiscount);
  const amountPaid = order.amount_paid || 0;
  const outstanding = Math.max(0, finalTotal - amountPaid);
  const paymentStatus = outstanding === 0 ? 'paid' : (amountPaid > 0 ? 'partially_paid' : 'unpaid');
  const now = new Date().toISOString();

  // Update order record
  db.prepare(`
    UPDATE orders SET
      subtotal = ?,
      delivery_charge = ?,
      discount_amount = ?,
      final_total = ?,
      outstanding_amount = ?,
      payment_status = ?,
      updated_at = ?
    WHERE id = ?
  `).run(newSubtotal, dCharge, dDiscount, finalTotal, outstanding, paymentStatus, now, orderId);

  // Update or insert invoice
  const existingInv = db.prepare('SELECT id FROM invoices WHERE order_id = ?').get(orderId) as any;
  if (existingInv) {
    db.prepare(`
      UPDATE invoices SET
        subtotal = ?,
        delivery_charge = ?,
        discount_amount = ?,
        final_total = ?,
        amount_paid = ?,
        outstanding_balance = ?,
        payment_status = ?
      WHERE id = ?
    `).run(newSubtotal, dCharge, dDiscount, finalTotal, amountPaid, outstanding, paymentStatus, existingInv.id);
  } else {
    const year = new Date().getFullYear();
    const countRow = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE invoice_number LIKE ?").get(`INV-${year}-%`) as any;
    const invNumber = `INV-${year}-${String(countRow.count + 1).padStart(4, '0')}`;
    db.prepare(`
      INSERT INTO invoices (
        id, invoice_number, order_id, shop_id, customer_id, date,
        subtotal, delivery_charge, tax_amount, discount_amount, final_total,
        amount_paid, outstanding_balance, payment_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), invNumber, orderId, order.shop_id, order.customer_id, now.split('T')[0], newSubtotal, dCharge, dDiscount, finalTotal, amountPaid, outstanding, paymentStatus, now);
  }

  backupDatabase();
  logAudit(req.user!.id, 'MASTER_EDIT_ORDER_ITEMS', 'order', orderId, { newSubtotal, finalTotal, itemsCount: items.length });
  syncOrderToCloud(orderId).catch(() => {});
  res.json({ success: true, subtotal: newSubtotal, final_total: finalTotal, outstanding_amount: outstanding });
});

// 3. Master Delete Order
apiRouter.delete('/admin/orders/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const orderId = req.params.id;
  const existing = db.prepare('SELECT id, order_number FROM orders WHERE id = ?').get(orderId) as { id: string; order_number: string } | undefined;
  if (existing) {
    db.prepare('INSERT OR REPLACE INTO deleted_order_tombstones (id, order_number, deleted_at) VALUES (?, ?, ?)')
      .run(existing.id, existing.order_number || null, new Date().toISOString());
  }

  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM order_photos WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM order_status_history WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM assignment_history WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM payment_transactions WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM invoices WHERE order_id = ?').run(orderId);
  db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);

  backupDatabase();
  logAudit(req.user!.id, 'MASTER_DELETE_ORDER', 'order', orderId);
  syncOrderDeleteToCloud(orderId).catch(err => console.warn('[Cloud Sync] Order delete sync notice:', err));
  res.json({ success: true, message: 'Order and associated records removed' });
});

// 4. Master Edit Invoice
apiRouter.put('/admin/invoices/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const invId = req.params.id;
  const { subtotal, delivery_charge, discount_amount, final_total, amount_paid, outstanding_balance, payment_status } = req.body;

  const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId) as any;
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });

  db.prepare(`
    UPDATE invoices SET
      subtotal = COALESCE(?, subtotal),
      delivery_charge = COALESCE(?, delivery_charge),
      discount_amount = COALESCE(?, discount_amount),
      final_total = COALESCE(?, final_total),
      amount_paid = COALESCE(?, amount_paid),
      outstanding_balance = COALESCE(?, outstanding_balance),
      payment_status = COALESCE(?, payment_status)
    WHERE id = ?
  `).run(
    subtotal !== undefined ? parseFloat(subtotal) : null,
    delivery_charge !== undefined ? parseFloat(delivery_charge) : null,
    discount_amount !== undefined ? parseFloat(discount_amount) : null,
    final_total !== undefined ? parseFloat(final_total) : null,
    amount_paid !== undefined ? parseFloat(amount_paid) : null,
    outstanding_balance !== undefined ? parseFloat(outstanding_balance) : null,
    payment_status || null,
    invId
  );

  // Sync to order
  db.prepare(`
    UPDATE orders SET
      subtotal = COALESCE(?, subtotal),
      delivery_charge = COALESCE(?, delivery_charge),
      discount_amount = COALESCE(?, discount_amount),
      final_total = COALESCE(?, final_total),
      amount_paid = COALESCE(?, amount_paid),
      outstanding_amount = COALESCE(?, outstanding_amount),
      payment_status = COALESCE(?, payment_status)
    WHERE id = ?
  `).run(
    subtotal !== undefined ? parseFloat(subtotal) : null,
    delivery_charge !== undefined ? parseFloat(delivery_charge) : null,
    discount_amount !== undefined ? parseFloat(discount_amount) : null,
    final_total !== undefined ? parseFloat(final_total) : null,
    amount_paid !== undefined ? parseFloat(amount_paid) : null,
    outstanding_balance !== undefined ? parseFloat(outstanding_balance) : null,
    payment_status || null,
    inv.order_id
  );

  backupDatabase();
  logAudit(req.user!.id, 'MASTER_EDIT_INVOICE', 'invoice', invId, req.body);
  res.json({ success: true, message: 'Invoice updated' });
});

// 5. Master Edit Payment
apiRouter.put('/admin/payments/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const pId = req.params.id;
  const { amount, payment_method, transaction_reference, notes } = req.body;

  db.prepare(`
    UPDATE payment_transactions SET
      amount = COALESCE(?, amount),
      payment_method = COALESCE(?, payment_method),
      transaction_reference = ?,
      notes = ?
    WHERE id = ?
  `).run(
    amount !== undefined ? parseFloat(amount) : null,
    payment_method || null,
    transaction_reference !== undefined ? transaction_reference : null,
    notes !== undefined ? notes : null,
    pId
  );

  backupDatabase();
  logAudit(req.user!.id, 'MASTER_EDIT_PAYMENT', 'payment', pId, req.body);
  res.json({ success: true, message: 'Payment updated' });
});

// 6. Master Delete Customer
apiRouter.delete('/admin/customers/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const custId = req.params.id;
  const activeOrders = (db.prepare('SELECT COUNT(*) as c FROM orders WHERE customer_id = ?').get(custId) as any).c;
  if (activeOrders > 0) {
    return res.status(400).json({ error: `Cannot delete customer: ${activeOrders} orders exist for this customer.` });
  }

  db.prepare('DELETE FROM customers WHERE id = ?').run(custId);
  backupDatabase();
  logAudit(req.user!.id, 'MASTER_DELETE_CUSTOMER', 'customer', custId);
  res.json({ success: true, message: 'Customer deleted' });
});

// 7. Master Service Area Management
apiRouter.post('/admin/service-areas', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const { name, pincode, city = 'Pune' } = req.body;
  if (!name) return res.status(400).json({ error: 'Area name is required' });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO service_areas (id, name, pincode, city, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), pincode || null, city, now);

  backupDatabase();
  logAudit(req.user!.id, 'CREATE_SERVICE_AREA', 'area', id, { name, pincode });
  res.json({ success: true, id, name });
});

apiRouter.put('/admin/service-areas/:id', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  const { name, pincode, city } = req.body;
  db.prepare(`
    UPDATE service_areas SET
      name = COALESCE(?, name),
      pincode = ?,
      city = COALESCE(?, city)
    WHERE id = ?
  `).run(name ? name.trim() : null, pincode !== undefined ? pincode : null, city || null, req.params.id);

  backupDatabase();
  res.json({ success: true, message: 'Service area updated' });
});

// 8. Database Durability Stats & Manual Backup
apiRouter.get('/admin/database/stats', authenticate, requireRole(['admin']), (req, res) => {
  try {
    const dbFile = path.join(dataDir, 'laundry.db');
    const backupFile = path.join(dataDir, 'laundry_backup.db');

    let dbSize = 0;
    let backupSize = 0;
    let backupDate: string | null = null;

    if (fs.existsSync(dbFile)) {
      dbSize = fs.statSync(dbFile).size;
    }
    if (fs.existsSync(backupFile)) {
      const bStat = fs.statSync(backupFile);
      backupSize = bStat.size;
      backupDate = bStat.mtime.toISOString();
    }

    const counts = {
      orders: (db.prepare('SELECT COUNT(*) as c FROM orders').get() as any).c,
      customers: (db.prepare('SELECT COUNT(*) as c FROM customers').get() as any).c,
      users: (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c,
      shops: (db.prepare('SELECT COUNT(*) as c FROM shops').get() as any).c,
      categories: (db.prepare('SELECT COUNT(*) as c FROM clothing_categories').get() as any).c,
      invoices: (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any).c,
      orderItems: (db.prepare('SELECT COUNT(*) as c FROM order_items').get() as any).c,
      payments: (db.prepare('SELECT COUNT(*) as c FROM payment_transactions').get() as any).c
    };

    res.json({
      success: true,
      journalMode: 'WAL',
      dbSizeBytes: dbSize,
      dbSizeFormatted: `${(dbSize / 1024).toFixed(1)} KB`,
      backupSizeBytes: backupSize,
      backupSizeFormatted: `${(backupSize / 1024).toFixed(1)} KB`,
      lastBackupTime: backupDate,
      counts
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/admin/database/backup', authenticate, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  backupDatabase();
  logAudit(req.user!.id, 'MANUAL_DB_BACKUP', 'system', 'database');
  res.json({ success: true, message: 'Database flushed and snapshot backup created successfully.' });
});

// -------------------------------------------------------------
// CLOUD FIRESTORE SYNCHRONIZATION
// -------------------------------------------------------------

apiRouter.get('/sync/status', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get sync status' });
  }
});

apiRouter.post('/sync/cloud-sync', authenticate, async (req: AuthenticatedRequest, res) => {
  try {
    const [pushed, rehydrated] = await Promise.all([
      pushAllToFirestore(),
      rehydrateFromFirestore()
    ]);
    const status = await getSyncStatus();
    res.json({
      success: true,
      message: 'Cloud Firestore bidirectional sync completed successfully.',
      pushed,
      rehydrated,
      status
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});
