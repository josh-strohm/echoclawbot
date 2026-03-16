import { Router } from 'express';
import { sqlite } from '../db';

export const tasksRouter = Router();

tasksRouter.get('/', (req, res) => {
    try {
        let query = 'SELECT * FROM tasks ORDER BY updated_at DESC';
        const params: any[] = [];
        if (req.query.status) {
            query = 'SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC';
            params.push(req.query.status);
        }
        res.json(sqlite.prepare(query).all(...params));
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

tasksRouter.post('/', (req, res) => {
    try {
        const { title, description } = req.body;
        const task_id = `task_${Date.now()}`;
        sqlite.prepare('INSERT INTO tasks (task_id, title, description, status, progress_notes) VALUES (?, ?, ?, ?, ?)').run(
            task_id, title, description || '', 'Todo', ''
        );
        res.json({ success: true, task_id });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

tasksRouter.patch('/:id', (req, res) => {
    try {
        const { status, progress_notes } = req.body;
        const setStrings = [];
        const params: any[] = [];
        if (status) { setStrings.push('status = ?'); params.push(status); }
        if (progress_notes !== undefined) { setStrings.push('progress_notes = ?'); params.push(progress_notes); }

        if (setStrings.length === 0) return res.json({ success: true });

        setStrings.push('updated_at = CURRENT_TIMESTAMP');
        params.push(req.params.id);

        sqlite.prepare(`UPDATE tasks SET ${setStrings.join(', ')} WHERE id = ?`).run(...params);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

tasksRouter.delete('/:id', (req, res) => {
    try {
        sqlite.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
