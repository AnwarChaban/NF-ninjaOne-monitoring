import { Router } from 'express';
import { getDb } from '../db';
import { createSession, invalidateSession, hashPassword, verifyPassword } from '../services/auth';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// Public: first-time setup — only works when no users exist yet
router.post('/auth/setup', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (existing.count > 0) {
    res.status(403).json({ error: 'Setup already completed' });
    return;
  }

  const { username, display_name, password } = req.body as {
    username?: string;
    display_name?: string;
    password?: string;
  };

  if (!username || !display_name) {
    res.status(400).json({ error: 'username and display_name are required' });
    return;
  }

  const passwordHash = password ? hashPassword(password) : null;
  const result = db.prepare(
    'INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)'
  ).run(username, display_name, 'administrator', passwordHash);

  res.json({ ok: true, id: result.lastInsertRowid });
});

// Public: list active users for login dropdown (includes hasPassword flag)
router.get('/auth/users', (_req, res) => {
  const users = getDb().prepare(`
    SELECT id, username, display_name AS displayName, role,
           CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END AS hasPassword
    FROM users WHERE active = 1 ORDER BY display_name
  `).all();
  res.json(users);
});

// Public: login
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username) {
    res.status(400).json({ error: 'username is required' });
    return;
  }

  const user = getDb().prepare(
    'SELECT id, username, display_name AS displayName, role, password_hash AS passwordHash FROM users WHERE username = ? AND active = 1'
  ).get(username) as { id: number; username: string; displayName: string; role: string; passwordHash: string | null } | undefined;

  if (!user) {
    res.status(401).json({ error: 'Benutzer nicht gefunden' });
    return;
  }

  // Admins with a password must provide it
  if (user.role === 'administrator' && user.passwordHash) {
    if (!password) {
      res.status(401).json({ error: 'Kennwort erforderlich' });
      return;
    }
    if (!verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: 'Falsches Kennwort' });
      return;
    }
  }

  const ua = Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'];
  const token = createSession(user.id, req.ip, ua);
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});

// Logout
router.post('/auth/logout', requireAuth, (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ')) {
    invalidateSession(authHeader.slice(7));
  }
  res.json({ ok: true });
});

// Current user
router.get('/auth/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// List all users (admin only)
router.get('/users', requireAuth, requireRole('administrator'), (_req, res) => {
  const users = getDb().prepare(`
    SELECT id, username, display_name AS displayName, role,
           CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END AS hasPassword,
           created_at AS createdAt, active
    FROM users ORDER BY display_name
  `).all();
  res.json(users);
});

// Create user (admin only)
router.post('/users', requireAuth, requireRole('administrator'), (req, res) => {
  const { username, display_name, role, password } = req.body as {
    username?: string;
    display_name?: string;
    role?: string;
    password?: string;
  };

  if (!username || !display_name || !role) {
    res.status(400).json({ error: 'username, display_name und role sind erforderlich' });
    return;
  }
  if (role !== 'administrator' && role !== 'techniker') {
    res.status(400).json({ error: 'role muss administrator oder techniker sein' });
    return;
  }
  if (role === 'techniker' && password) {
    res.status(400).json({ error: 'Techniker können kein Kennwort haben' });
    return;
  }

  const passwordHash = (role === 'administrator' && password) ? hashPassword(password) : null;

  try {
    const result = getDb().prepare(
      'INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)'
    ).run(username, display_name, role, passwordHash);
    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Benutzername bereits vergeben' });
    } else {
      res.status(500).json({ error: 'Fehler beim Erstellen des Benutzers' });
    }
  }
});

// Update user (admin only)
router.patch('/users/:id', requireAuth, requireRole('administrator'), (req, res) => {
  const id = parseInt(req.params['id'] as string);
  const { username, display_name, role, active, password, remove_password } = req.body as {
    username?: string;
    display_name?: string;
    role?: string;
    active?: boolean;
    password?: string;
    remove_password?: boolean;
  };

  // Check target user's role before allowing password ops
  const target = getDb().prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
  const targetRole = role ?? target?.role;

  if (password && targetRole === 'techniker') {
    res.status(400).json({ error: 'Techniker können kein Kennwort haben' });
    return;
  }

  const updates: string[] = [];
  const values: unknown[] = [];

  if (username !== undefined) { updates.push('username = ?'); values.push(username); }
  if (display_name !== undefined) { updates.push('display_name = ?'); values.push(display_name); }
  if (role !== undefined) {
    if (role !== 'administrator' && role !== 'techniker') {
      res.status(400).json({ error: 'Ungültige Rolle' });
      return;
    }
    updates.push('role = ?'); values.push(role);
    // Remove password when downgrading to techniker
    if (role === 'techniker') {
      updates.push('password_hash = ?'); values.push(null);
    }
  }
  if (active !== undefined) { updates.push('active = ?'); values.push(active ? 1 : 0); }
  if (password) {
    updates.push('password_hash = ?'); values.push(hashPassword(password));
  } else if (remove_password) {
    updates.push('password_hash = ?'); values.push(null);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'Keine Änderungen' });
    return;
  }

  values.push(id);
  getDb().prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// Deactivate user (admin only)
router.delete('/users/:id', requireAuth, requireRole('administrator'), (req, res) => {
  getDb().prepare('UPDATE users SET active = 0 WHERE id = ?').run(parseInt(req.params['id'] as string));
  res.json({ ok: true });
});

export default router;
