import { Router } from 'express';
import { sqlite } from '../db';
import OpenAI from 'openai';

export const memoryRouter = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });

memoryRouter.get('/core-facts', (req, res) => {
    try {
        const facts = sqlite.prepare('SELECT * FROM core_memory ORDER BY category, importance DESC').all();
        const grouped = (facts as any[]).reduce((acc, f) => {
            if (!acc[f.category]) acc[f.category] = [];
            acc[f.category].push(f);
            return acc;
        }, {} as Record<string, any[]>);
        res.json(grouped);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

memoryRouter.delete('/core-facts/:id', (req, res) => {
    try {
        sqlite.prepare('DELETE FROM core_memory WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

memoryRouter.get('/stats', async (req, res) => {
    try {
        const factsRow: any = sqlite.prepare('SELECT COUNT(*) as c FROM core_memory').get();
        const msgRow: any = sqlite.prepare('SELECT COUNT(*) as c FROM messages').get();
        const sumRow: any = sqlite.prepare('SELECT COUNT(*) as c FROM summaries').get();



        res.json({
            coreFacts: factsRow.c,
            messages: msgRow.c,
            summaries: sumRow.c,
            vectors: 0
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

memoryRouter.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        // Using SQLite File-First memory index for vector search.
        const searchRes = await import('../../memory/file_first').then(m => m.searchEngine.search(q as string, { limit: parseInt(req.query.topK as string) || 5, matchType: 'hybrid' }));

        res.json(searchRes.map(m => ({ score: m.score, metadata: { text: m.chunk } })));
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

memoryRouter.get('/knowledge', async (req, res) => {
    try {
        res.json([{
            id: 'mock-1',
            metadata: { text: 'Knowledge module metadata mock endpoint.' }
        }]);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
