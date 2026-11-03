import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

export interface AuthUser {
  id: string;
  name: string;
  email_or_phone: string;
  role: 'admin' | 'shop' | 'delivery';
  shop_id: string | null;
  service_area_id: string | null;
  status: 'active' | 'inactive';
  is_online: number;
  is_busy: number;
  last_heartbeat: string | null;
  shop_name?: string | null;
  area_name?: string | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(verifyHash));
}

export function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, createdAt);

  // Mark user online
  db.prepare(`
    UPDATE users SET is_online = 1, last_heartbeat = ?, updated_at = ? WHERE id = ?
  `).run(createdAt, createdAt, userId);

  return token;
}

export function deleteSession(token: string, userId?: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  if (userId) {
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET is_online = 0, updated_at = ? WHERE id = ?').run(now, userId);
  }
}

export function getUserByToken(token: string): AuthUser | null {
  const now = new Date().toISOString();
  
  // Clean expired sessions
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);

  const row = db.prepare(`
    SELECT 
      u.id, u.name, u.email_or_phone, u.role, u.shop_id, u.service_area_id, 
      u.status, u.is_online, u.is_busy, u.last_heartbeat,
      s.name as shop_name,
      a.name as area_name
    FROM sessions sess
    JOIN users u ON u.id = sess.user_id
    LEFT JOIN shops s ON s.id = u.shop_id
    LEFT JOIN service_areas a ON a.id = u.service_area_id
    WHERE sess.token = ? AND sess.expires_at > ? AND u.status = 'active'
  `).get(token, now) as (AuthUser | undefined);

  return row || null;
}

// Presence monitor: marks delivery boys/users offline if inactive for > 90 seconds
export function updatePresenceStatus() {
  const threshold = new Date(Date.now() - 90 * 1000).toISOString();
  db.prepare(`
    UPDATE users 
    SET is_online = 0 
    WHERE is_online = 1 AND (last_heartbeat IS NULL OR last_heartbeat < ?)
  `).run(threshold);
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  updatePresenceStatus();

  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']);
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired or invalid' });
    return;
  }

  req.user = user;
  next();
}

export function requireRole(allowedRoles: ('admin' | 'shop' | 'delivery')[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ error: 'Access denied: insufficient permissions' });
      return;
    }

    next();
  };
}
