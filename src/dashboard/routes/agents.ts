import { Router } from 'express';
import { sqlite } from '../db';

export const agentsRouter = Router();

agentsRouter.get('/', (req, res) => {
    try {
        const agents = sqlite.prepare('SELECT * FROM agents ORDER BY id ASC').all();
        res.json(agents);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

agentsRouter.patch('/:id', (req, res) => {
    try {
        const { status } = req.body;
        sqlite.prepare('UPDATE agents SET status = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
