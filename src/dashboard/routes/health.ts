import { Router } from 'express';
import * as os from 'os';
import { sqlite } from '../db';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
    res.json({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: os.cpus()[0].model,
        cpuUsage: os.loadavg()
    });
});

healthRouter.get('/tiers', async (req, res) => {
    let sqliteHealth = 'down';
    try {
        sqlite.prepare('SELECT 1').get();
        sqliteHealth = 'healthy';
    } catch { }
    res.json({
        sqlite: { status: sqliteHealth, details: 'Local storage' },
        supabase: { status: 'not_configured', details: 'Cloud database (Removed)' },
        pinecone: { status: 'not_configured', details: 'Vector memory (Removed)' }
    });
});

healthRouter.get('/errors', async (req, res) => {
    const data = sqlite.prepare(`SELECT * FROM activity_log WHERE status = 'error' ORDER BY timestamp DESC LIMIT 50`).all();
    res.json(data || []);
});
