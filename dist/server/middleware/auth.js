"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const auth_1 = require("../services/auth");
function requireAuth(req, res, next) {
    const user = (0, auth_1.getCurrentUser)(req);
    if (!user) {
        res.status(401).json({ error: 'Nicht angemeldet' });
        return;
    }
    req.user = user;
    next();
}
function requireRole(minRole) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Nicht angemeldet' });
            return;
        }
        if (req.user.role === 'administrator') {
            next();
            return;
        }
        if (minRole === 'techniker') {
            next();
            return;
        }
        res.status(403).json({ error: 'Keine Berechtigung' });
    };
}
