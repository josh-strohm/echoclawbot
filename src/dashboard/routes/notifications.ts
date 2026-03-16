import { Router } from 'express';
import { sqlite } from '../db';

export const notificationsRouter = Router();

notificationsRouter.get('/', (req, res) => {
    try {
        const rows = sqlite.prepare('SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 20').all();
        res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

notificationsRouter.post('/mark-read', (req, res) => {
    try {
        sqlite.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
