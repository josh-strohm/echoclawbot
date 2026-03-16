import { Router } from 'express';
import { sqlite } from '../db';

export const activityRouter = Router();

activityRouter.get('/recent', (req, res) => {
    const limit = parseInt(req.query.limit as string) || 100;
    try {
        let stmtStr = `SELECT * FROM activity_log`;
        let params: any[] = [];
        if (req.query.status) {
            stmtStr += ` WHERE status = ?`;
            params.push(req.query.status);
        }
        stmtStr += ` ORDER BY timestamp DESC LIMIT ?`;
        params.push(limit);

        const data = sqlite.prepare(stmtStr).all(...params) as any[];
        res.json(data || []);
    } catch {
        res.json([]);
    }
});

activityRouter.get('/stats', (req, res) => {
    try {
        const data = sqlite.prepare(`SELECT action, status FROM activity_log ORDER BY timestamp DESC LIMIT 1000`).all() as any[];
        if (!data || data.length === 0) return res.json({ total: 0, successRate: 0, mostCommon: 'N/A' });

        let success = 0;
        const actions: Record<string, number> = {};
        data.forEach(r => {
            if (r.status === 'success') success++;
            actions[r.action] = (actions[r.action] || 0) + 1;
        });

        const mostCommon = Object.keys(actions).reduce((a, b) => actions[a] > actions[b] ? a : b);
        res.json({
            total: data.length,
            successRate: (success / data.length) * 100,
            mostCommon,
            distribution: Object.entries(actions).map(([action, count]) => ({ action, count }))
        });
    } catch {
        res.json({ total: 0, successRate: 0, mostCommon: 'N/A' });
    }
});
