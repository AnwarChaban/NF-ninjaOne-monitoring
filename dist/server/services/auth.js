"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SESSION_DURATION_MS_APP = void 0;
exports.createSession = createSession;
exports.validateSession = validateSession;
exports.invalidateSession = invalidateSession;
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
exports.getCurrentUser = getCurrentUser;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const SESSION_DURATION_MS_DEFAULT = 30 * 24 * 60 * 60 * 1000; // 30 days
exports.SESSION_DURATION_MS_APP = 30 * 60 * 1000; // 30 minutes
function createSession(userId, ipAddress, userAgent, durationMs = SESSION_DURATION_MS_DEFAULT) {
    const db = (0, db_1.getDb)();
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMs);
    db.prepare(`
    INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, token, ipAddress ?? null, userAgent ?? null, now.toISOString(), expiresAt.toISOString());
    return token;
}
function validateSession(token) {
    const row = (0, db_1.getDb)().prepare(`
    SELECT u.id, u.username, u.display_name AS displayName, u.role
    FROM user_sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token = ?
      AND s.expires_at > datetime('now')
      AND u.active = 1
  `).get(token);
    return row ?? null;
}
function invalidateSession(token) {
    (0, db_1.getDb)().prepare('DELETE FROM user_sessions WHERE session_token = ?').run(token);
}
function hashPassword(password) {
    const salt = crypto_1.default.randomBytes(16).toString('hex');
    const hash = crypto_1.default.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash)
        return false;
    const hashToVerify = crypto_1.default.scryptSync(password, salt, 64).toString('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashToVerify, 'hex'));
}
function getCurrentUser(req) {
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
        return validateSession(authHeader.slice(7));
    }
    return null;
}
