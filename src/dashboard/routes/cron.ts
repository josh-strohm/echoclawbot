import { Router } from 'express';
import { sqlite } from '../db';
import { cancelScheduledJob, reloadCronScheduler, executeCronJob } from '../cron_scheduler';
import * as fs from 'fs';
import * as path from 'path';

export const cronRouter = Router();

// Log to a physical file for emergency debugging
const debugLog = (msg: string) => {
    const logPath = path.resolve(process.cwd(), 'cron_debug.log');
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logPath, entry);
    console.log(`[Cron API DEBUG] ${msg}`);
};

cronRouter.get('/jobs', (req, res) => {
    try {
        const jobs = sqlite.prepare('SELECT * FROM cron_jobs ORDER BY id DESC').all();
        res.json(jobs);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cronRouter.post('/jobs', (req, res) => {
    try {
        const { name, schedule, description } = req.body;
        debugLog(`Creating job: ${name}`);
        sqlite.prepare('INSERT INTO cron_jobs (name, schedule, description, status) VALUES (?, ?, ?, ?)')
            .run(name, schedule, description, 'active');
        reloadCronScheduler();
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cronRouter.post('/jobs/:id/run', async (req, res) => {
    try {
        const jobId = Number(req.params.id);
        const job = sqlite.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(jobId) as any;
        if (!job) return res.status(404).json({ error: 'Job not found' });

        debugLog(`Manual trigger for ID=${jobId} (${job.name})`);
        executeCronJob(job).catch(e => debugLog(`Manual Run Fail: ${e.message}`));

        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cronRouter.post('/jobs/:id/toggle', (req, res) => {
    try {
        const jobId = Number(req.params.id);
        const job = sqlite.prepare('SELECT * FROM cron_jobs WHERE id = ?').get(jobId) as any;
        if (!job) return res.status(404).json({ error: 'Job not found' });

        const newStatus = job.status === 'active' ? 'paused' : 'active';
        sqlite.prepare('UPDATE cron_jobs SET status = ? WHERE id = ?').run(newStatus, jobId);
        reloadCronScheduler();
        debugLog(`Toggle ID=${jobId} to ${newStatus}`);
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cronRouter.post('/jobs/:id/delete', (req, res) => {
    try {
        const jobId = Number(req.params.id);
        debugLog(`Request to DELETE ID=${jobId}`);

        // Ensure it exists
        const job = sqlite.prepare('SELECT id, name FROM cron_jobs WHERE id = ?').get(jobId);
        if (!job) {
            debugLog(`Delete failed: ID=${jobId} not found in DB`);
            return res.status(404).json({ error: 'Job not found' });
        }

        cancelScheduledJob(jobId);
        const result = sqlite.prepare('DELETE FROM cron_jobs WHERE id = ?').run(jobId);
        debugLog(`DELETE execute on ID=${jobId}. DB Changes: ${result.changes}`);

        reloadCronScheduler();
        res.json({ success: true });
    } catch (e: any) {
        debugLog(`DELETE ERROR: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

cronRouter.delete('/jobs', (req, res) => {
    try {
        debugLog('Request: DELETE ALL JOBS');
        const result = sqlite.prepare('DELETE FROM cron_jobs').run();
        debugLog(`Clear All result: ${result.changes} rows deleted`);
        reloadCronScheduler();
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});

cronRouter.get('/history', (req, res) => {
    try {
        const history = sqlite.prepare('SELECT * FROM cron_history ORDER BY timestamp DESC LIMIT 50').all();
        res.json(history);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
});
