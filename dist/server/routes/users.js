"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../services/auth");
const auth_2 = require("../middleware/auth");
const audit_1 = require("../services/audit");
const router = (0, express_1.Router)();
// Public: first-time setup — only works when no users exist yet
router.post('/auth/setup', (req, res) => {
    const db = (0, db_1.getDb)();
    const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get();
    if (existing.count > 0) {
        res.status(403).json({ error: 'Setup already completed' });
        return;
    }
    const { username, display_name, password } = req.body;
    if (!username || !display_name) {
        res.status(400).json({ error: 'username and display_name are required' });
        return;
    }
    const passwordHash = password ? (0, auth_1.hashPassword)(password) : null;
    const result = db.prepare('INSERT INTO users (username, display_name, role, password_hash) VALUES (?, ?, ?, ?)').run(username, display_name, 'administrator', passwordHash);
    res.json({ ok: true, id: result.lastInsertRowid });
});
// Public: list active users for login dropdown (includes hasPassword flag)
router.get('/auth/users', (_req, res) => {
    const users = (0, db_1.getDb)().prepare(`
    SELECT id, username, display_name AS displayName, role, email,
           CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END AS hasPassword
    FROM users WHERE active = 1 ORDER BY display_name
  `).all();
    res.json(users);
});
// Public: login
router.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username) {
        res.status(400).json({ error: 'username is required' });
        return;
    }
    const user = (0, db_1.getDb)().prepare('SELECT id, username, display_name AS displayName, role, password_hash AS passwordHash FROM users WHERE username = ? AND active = 1').get(username);
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
        if (!(0, auth_1.verifyPassword)(password, user.passwordHash)) {
            res.status(401).json({ error: 'Falsches Kennwort' });
            return;
        }
    }
    const ua = Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'];
    const token = (0, auth_1.createSession)(user.id, req.ip, ua, auth_1.SESSION_DURATION_MS_APP);
    (0, audit_1.logAction)({ id: user.id, username: user.username, displayName: user.displayName, role: user.role }, 'user.login', 'user', user.id, user.displayName, { method: 'password' }, req);
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});
// Auto-login via NinjaOne UID (called by browser extension)
router.post('/auth/ninja-login', (req, res) => {
    const { ninja_uid } = req.body;
    if (!ninja_uid) {
        res.status(400).json({ error: 'ninja_uid is required' });
        return;
    }
    const user = (0, db_1.getDb)().prepare('SELECT id, username, display_name AS displayName, role FROM users WHERE ninja_uid = ? AND active = 1').get(ninja_uid);
    if (!user) {
        res.status(401).json({ error: 'Kein Version Checker Benutzer für diese NinjaOne-Sitzung gefunden.' });
        return;
    }
    const ua = Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent'];
    const token = (0, auth_1.createSession)(user.id, req.ip, ua);
    (0, audit_1.logAction)({ id: user.id, username: user.username, displayName: user.displayName, role: user.role }, 'user.login', 'user', user.id, user.displayName, { method: 'ninja_sso' }, req);
    res.json({ token, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } });
});
// Logout
router.post('/auth/logout', auth_2.requireAuth, (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        (0, auth_1.invalidateSession)(authHeader.slice(7));
    }
    (0, audit_1.logAction)(req.user, 'user.logout', 'user', req.user.id, req.user.displayName, null, req);
    res.json({ ok: true });
});
// Current user
router.get('/auth/me', auth_2.requireAuth, (req, res) => {
    res.json(req.user);
});
// List all users (admin only)
router.get('/users', auth_2.requireAuth, (0, auth_2.requireRole)('administrator'), (_req, res) => {
    const users = (0, db_1.getDb)().prepare(`
    SELECT id, username, display_name AS displayName, role, email, ninja_uid AS ninjaUid,
           CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END AS hasPassword,
           created_at AS createdAt, active
    FROM users ORDER BY display_name
  `).all();
    res.json(users);
});
// Create user (admin only)
router.post('/users', auth_2.requireAuth, (0, auth_2.requireRole)('administrator'), (req, res) => {
    const { username, display_name, role, password, email } = req.body;
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
    const passwordHash = (role === 'administrator' && password) ? (0, auth_1.hashPassword)(password) : null;
    const emailVal = email?.trim() || null;
    try {
        const result = (0, db_1.getDb)().prepare('INSERT INTO users (username, display_name, role, password_hash, email) VALUES (?, ?, ?, ?, ?)').run(username, display_name, role, passwordHash, emailVal);
        (0, audit_1.logAction)(req.user, 'user.create', 'user', Number(result.lastInsertRowid), display_name, { username, role }, req);
        res.json({ ok: true, id: result.lastInsertRowid });
    }
    catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            res.status(409).json({ error: 'Benutzername bereits vergeben' });
        }
        else {
            res.status(500).json({ error: 'Fehler beim Erstellen des Benutzers' });
        }
    }
});
// Update user (admin only)
router.patch('/users/:id', auth_2.requireAuth, (0, auth_2.requireRole)('administrator'), (req, res) => {
    const id = parseInt(req.params['id']);
    const { username, display_name, role, active, password, remove_password, email } = req.body;
    // Check target user's role before allowing password ops
    const target = (0, db_1.getDb)().prepare('SELECT role FROM users WHERE id = ?').get(id);
    const targetRole = role ?? target?.role;
    if (password && targetRole === 'techniker') {
        res.status(400).json({ error: 'Techniker können kein Kennwort haben' });
        return;
    }
    const updates = [];
    const values = [];
    if (username !== undefined) {
        updates.push('username = ?');
        values.push(username);
    }
    if (display_name !== undefined) {
        updates.push('display_name = ?');
        values.push(display_name);
    }
    if (role !== undefined) {
        if (role !== 'administrator' && role !== 'techniker') {
            res.status(400).json({ error: 'Ungültige Rolle' });
            return;
        }
        updates.push('role = ?');
        values.push(role);
        // Remove password when downgrading to techniker
        if (role === 'techniker') {
            updates.push('password_hash = ?');
            values.push(null);
        }
    }
    if (active !== undefined) {
        updates.push('active = ?');
        values.push(active ? 1 : 0);
    }
    if (email !== undefined) {
        updates.push('email = ?');
        values.push(email?.trim() || null);
    }
    if (password) {
        updates.push('password_hash = ?');
        values.push((0, auth_1.hashPassword)(password));
    }
    else if (remove_password) {
        updates.push('password_hash = ?');
        values.push(null);
    }
    if (updates.length === 0) {
        res.status(400).json({ error: 'Keine Änderungen' });
        return;
    }
    values.push(id);
    (0, db_1.getDb)().prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    (0, audit_1.logAction)(req.user, 'user.update', 'user', id, display_name ?? username, { role, active }, req);
    res.json({ ok: true });
});
// Deactivate user (admin only)
router.delete('/users/:id', auth_2.requireAuth, (0, auth_2.requireRole)('administrator'), (req, res) => {
    const id = parseInt(req.params['id']);
    const target = (0, db_1.getDb)().prepare('SELECT display_name FROM users WHERE id = ?').get(id);
    (0, db_1.getDb)().prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
    (0, audit_1.logAction)(req.user, 'user.delete', 'user', id, target?.display_name ?? String(id), null, req);
    res.json({ ok: true });
});
exports.default = router;
