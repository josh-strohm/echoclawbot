import { Router } from 'express';
import { sqlite } from '../db';

export const conversationsRouter = Router();

conversationsRouter.get('/stats', (req, res) => {
    try {
        const msgCount: any = sqlite.prepare('SELECT COUNT(*) as c FROM messages').get();
        const chatCount: any = sqlite.prepare('SELECT COUNT(DISTINCT chat_id) as c FROM messages').get();
        res.json({ totalMessages: msgCount.c, totalChats: chatCount.c });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

conversationsRouter.get('/timeline', (req, res) => {
    try {
        const rows = sqlite.prepare(`
            SELECT DATE(timestamp) as date, COUNT(*) as count 
            FROM messages 
            GROUP BY DATE(timestamp) 
            ORDER BY date
        `).all();
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

conversationsRouter.get('/list', (req, res) => {
    try {
        const rows = sqlite.prepare(`
            SELECT chat_id, COUNT(*) as msg_count, MAX(timestamp) as last_active 
            FROM messages 
            GROUP BY chat_id 
            ORDER BY last_active DESC
        `).all();
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

conversationsRouter.get('/history/:chatId', (req, res) => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const rows = sqlite.prepare(`
            SELECT role, content, timestamp 
            FROM messages 
            WHERE chat_id = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `).all(req.params.chatId, limit);
        res.json((rows as any[]).reverse());
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

conversationsRouter.get('/summaries', (req, res) => {
    try {
        const rows = sqlite.prepare('SELECT * FROM summaries ORDER BY timestamp DESC LIMIT 50').all();
        res.json(rows);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
