import crypto from 'crypto';
import { getDb } from '../db';
import type { Request } from 'express';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: 'administrator' | 'techniker';
}

const SESSION_DURATION_DAYS = 30;

export function createSession(userId: number, ipAddress?: string, userAgent?: string): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, token, ipAddress ?? null, userAgent ?? null, now.toISOString(), expiresAt.toISOString());

  return token;
}

export function validateSession(token: string): AuthUser | null {
  const row = getDb().prepare(`
    SELECT u.id, u.username, u.display_name AS displayName, u.role
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = ?
      AND s.expires_at > datetime('now')
      AND u.active = 1
  `).get(token) as AuthUser | undefined;

  return row ?? null;
}

export function invalidateSession(token: string): void {
  getDb().prepare('DELETE FROM user_sessions WHERE session_token = ?').run(token);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashToVerify = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashToVerify, 'hex'));
}

export function getCurrentUser(req: Request): AuthUser | null {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    return validateSession(authHeader.slice(7));
  }
  return null;
}
