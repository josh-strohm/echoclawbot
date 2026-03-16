import { Router } from 'express';
import { sqlite } from '../db';

export const costRouter = Router();

function getRangeDate(range: string) {
    const now = new Date();
    if (range === '24h') now.setHours(now.getHours() - 24);
    else if (range === '7d') now.setDate(now.getDate() - 7);
    else if (range === '30d') now.setDate(now.getDate() - 30);
    else return '1970-01-01 00:00:00';
    return now.toISOString().replace('T', ' ').substring(0, 19);
}

costRouter.get('/summary', (req, res) => {
    const range = (req.query.range as string) || 'all';
    try {
        const data = sqlite.prepare(`SELECT * FROM cost_log WHERE timestamp >= ?`).all(getRangeDate(range)) as any[];
        let spend = 0, tokens = 0;
        data.forEach(r => { spend += r.cost_usd || 0; tokens += r.tokens || 0; });
        res.json({ spend, tokens, requests: data.length, avgCost: data.length ? spend / data.length : 0 });
    } catch {
        res.json({ spend: 0, tokens: 0, requests: 0, avgCost: 0 });
    }
});

costRouter.get('/by-model', (req, res) => {
    const range = (req.query.range as string) || 'all';
    try {
        const data = sqlite.prepare(`SELECT * FROM cost_log WHERE timestamp >= ?`).all(getRangeDate(range)) as any[];
        const map: Record<string, number> = {};
        data.forEach(r => {
            const m = r.model || 'unknown';
            map[m] = (map[m] || 0) + (r.cost_usd || 0);
        });
        res.json(Object.entries(map).map(([model, cost]) => ({ model, cost })));
    } catch {
        res.json([]);
    }
});

costRouter.get('/by-service', (req, res) => {
    const range = (req.query.range as string) || 'all';
    try {
        const data = sqlite.prepare(`SELECT * FROM cost_log WHERE timestamp >= ?`).all(getRangeDate(range)) as any[];
        const map: Record<string, number> = {};
        data.forEach(r => {
            const s = r.service || 'unknown';
            map[s] = (map[s] || 0) + (r.cost_usd || 0);
        });
        res.json(Object.entries(map).map(([service, cost]) => ({ service, cost })));
    } catch {
        res.json([]);
    }
});

costRouter.get('/timeline', (req, res) => {
    const range = (req.query.range as string) || 'all';
    try {
        const data = sqlite.prepare(`SELECT * FROM cost_log WHERE timestamp >= ? ORDER BY timestamp ASC`).all(getRangeDate(range)) as any[];
        const map: Record<string, number> = {};
        data.forEach(r => {
            const d = new Date(r.timestamp);
            const key = range === '24h'
                ? `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:00`
                : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            map[key] = (map[key] || 0) + (r.cost_usd || 0);
        });
        res.json(Object.keys(map).map(time => ({ time, cost: map[time] })));
    } catch (e) {
        res.json([]);
    }
});
