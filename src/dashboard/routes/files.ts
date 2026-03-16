import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const filesRouter = Router();

const getSafePath = (targetPath: string) => {
    const root = process.env.DASHBOARD_FILE_ROOT || process.env.AGENT_WORKSPACE || process.cwd();
    const resolved = path.resolve(root, targetPath || '');
    if (!resolved.startsWith(root)) {
        throw new Error('Access denied: Out of bounds path');
    }
    return resolved;
};

filesRouter.get('/list', (req, res) => {
    try {
        const target = getSafePath(req.query.path as string);
        if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
            return res.json([]);
        }
        const items = fs.readdirSync(target, { withFileTypes: true });
        const list = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.join((req.query.path as string) || '', item.name)
        }));
        res.json(list);
    } catch (e: any) { res.status(403).json({ error: e.message }); }
});

filesRouter.get('/read', (req, res) => {
    try {
        const target = getSafePath(req.query.path as string);
        if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.type(path.extname(target) || 'text/plain');
        res.send(fs.readFileSync(target, 'utf-8'));
    } catch (e: any) { res.status(403).json({ error: e.message }); }
});

filesRouter.post('/write', (req, res) => {
    if (process.env.DASHBOARD_ENABLE_WRITE !== 'true') {
        return res.status(403).json({ error: 'Write is disabled' });
    }
    try {
        const { path: p, content } = req.body;
        const target = getSafePath(p);
        fs.writeFileSync(target, content, 'utf-8');
        res.json({ success: true });
    } catch (e: any) { res.status(403).json({ error: e.message }); }
});
