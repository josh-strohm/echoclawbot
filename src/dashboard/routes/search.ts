import { Router } from 'express';
import { sqlite } from '../db';

export const searchRouter = Router();

searchRouter.get('/', async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.json({ results: [] });

    try {
        const results: any[] = [];

        // Search memory SQLite
        const memoryResults = sqlite.prepare(`
            SELECT 'core_memory' as source, id, category as title, content as snippet
            FROM core_memory WHERE content LIKE ?
            LIMIT 10
        `).all(`%${q}%`);
        results.push(...memoryResults);

        // Search messages
        const messageResults = sqlite.prepare(`
            SELECT 'messages' as source, chat_id as id, role as title, content as snippet
            FROM messages WHERE content LIKE ?
            LIMIT 10
        `).all(`%${q}%`);
        results.push(...messageResults);

        // Pinecone has been removed. Semantic vectors are handled by SQLite plugins now.
        res.json({ results });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
