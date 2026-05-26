"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../services/audit");
const db_1 = require("../db");
const router = (0, express_1.Router)();
router.get('/logs', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (req, res) => {
    const { dateFrom, dateTo, userId, action, entityType, page = '1', limit = '50', } = req.query;
    const result = (0, audit_1.getLogs)({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        userId: userId ? parseInt(userId) : undefined,
        action: action || undefined,
        entityType: entityType || undefined,
        page: parseInt(page),
        limit: Math.min(parseInt(limit) || 50, 200),
    });
    res.json(result);
});
// Available filter options (users + action types)
router.get('/logs/meta', auth_1.requireAuth, (0, auth_1.requireRole)('administrator'), (_req, res) => {
    const users = (0, db_1.getDb)().prepare('SELECT DISTINCT user_id AS id, username FROM audit_logs WHERE username IS NOT NULL ORDER BY username').all();
    const actions = (0, db_1.getDb)().prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all();
    const entityTypes = (0, db_1.getDb)().prepare('SELECT DISTINCT entity_type AS entityType FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type').all();
    res.json({
        users,
        actions: actions.map(r => r.action),
        entityTypes: entityTypes.map(r => r.entityType),
    });
});
exports.default = router;
