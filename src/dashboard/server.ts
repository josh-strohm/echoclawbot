import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';

import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { startCronScheduler } from './cron_scheduler';

import { costRouter } from './routes/costs';
import { memoryRouter } from './routes/memory';
import { conversationsRouter } from './routes/conversations';
import { healthRouter } from './routes/health';
import { activityRouter } from './routes/activity';
import { tasksRouter } from './routes/tasks';
import { filesRouter } from './routes/files';
import { searchRouter } from './routes/search';
import { notificationsRouter } from './routes/notifications';
import { cronRouter } from './routes/cron';
import { terminalRouter } from './routes/terminal';
import { settingsRouter } from './routes/settings';
import { agentsRouter } from './routes/agents';
import { skillsRouter } from './routes/skills';
import { chatRouter } from './routes/chat';

export function startDashboard() {
    const app = express();
    const port = process.env.DASHBOARD_PORT || 3100;

    startCronScheduler();

    app.use(cors());
    app.use(express.json());

    // Logging middleware for debugging
    app.use((req, res, next) => {
        if (!req.path.startsWith('/api') && !req.path.includes('.')) {
            console.log(`[Dashboard] Nav: ${req.path}`);
        }
        next();
    });

    // API Routes mounted with Rate Limit and Auth
    const apiRouter = express.Router();
    apiRouter.use(rateLimitMiddleware);
    apiRouter.use(authMiddleware);

    apiRouter.use('/costs', costRouter);
    apiRouter.use('/memory', memoryRouter);
    apiRouter.use('/conversations', conversationsRouter);
    apiRouter.use('/health', healthRouter);
    apiRouter.use('/activity', activityRouter);
    apiRouter.use('/tasks', tasksRouter);
    apiRouter.use('/files', filesRouter);
    apiRouter.use('/search', searchRouter);
    apiRouter.use('/notifications', notificationsRouter);
    apiRouter.use('/cron', cronRouter);
    apiRouter.use('/terminal', terminalRouter);
    apiRouter.use('/settings', settingsRouter);
    apiRouter.use('/agents', agentsRouter);
    apiRouter.use('/skills', skillsRouter);
    apiRouter.use('/chat', chatRouter);

    app.use('/api', apiRouter);

    // Serve Static Frontend - Anchor to __filename so the path works correctly
    // regardless of the working directory (e.g. when run via NSSM as a service).
    // __filename resolves to either:
    //   tsx (dev):  C:\code\echoclaw.bot\src\dashboard\server.ts  -> public is ./public
    //   compiled:   C:\code\echoclaw.bot\dist\src\dashboard\server.js -> public is ../../../src/dashboard/public
    const devPublicPath = path.resolve(path.dirname(__filename), 'public');
    const prodPublicPath = path.resolve(path.dirname(__filename), '../../../src/dashboard/public');
    const publicPath = fs.existsSync(devPublicPath + '/index.html') ? devPublicPath : prodPublicPath;
    app.use(express.static(publicPath));

    // Redirect all navigation requests to index.html for hash routing
    // Using middleware instead of app.get('*') to avoid PathErrors in Express 5
    app.use((req, res, next) => {
        // Only handle GET requests that don't look like files or API calls
        if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
            return res.sendFile(path.join(publicPath, 'index.html'));
        }
        next();
    });

    app.listen(port, () => {
        console.log(`[Dashboard] Mission Control running on http://localhost:${port}`);
    });
}
