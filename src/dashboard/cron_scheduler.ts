import cron, { ScheduledTask } from 'node-cron';
import { sqlite } from './db';
import { getAllowedUserIds, sendTelegramMessage } from '../../examples/telegram_bot';
import { getDashboardAgent } from './routes/chat';

// Reflection heartbeat — drains the memory reflection queue every 2 minutes during idle time
let reflectionHeartbeat: NodeJS.Timeout | null = null;

function startReflectionHeartbeat() {
    if (reflectionHeartbeat) return; // already running
    reflectionHeartbeat = setInterval(async () => {
        const agent = getDashboardAgent();
        if (!agent) return;
        const memory = agent.getMemory();
        if (memory.reflectionQueueDepth === 0) return;
        try {
            await memory.processReflectionQueue();
        } catch (e: any) {
            console.error('[ReflectionHeartbeat] Error processing queue:', e.message);
        }
    }, 2 * 60 * 1000); // every 2 minutes
    console.log('[ReflectionHeartbeat] Started — will drain reflection queue every 2 minutes.');
}

// Globally patch console.warn to ignore disruptive node-cron "missed execution" noise
const originalConsoleWarn = console.warn;
console.warn = function (msg, ...args) {
    if (typeof msg === 'string' && (msg.includes('missed execution') || msg.includes('NODE-CRON'))) {
        return;
    }
    originalConsoleWarn.apply(console, [msg, ...args]);
};

/**
 * Executes a cron job. If the job name starts with "[TASK]", it creates a new
 * entry in the Kanban 'tasks' table for the background loop to pick up.
 */

interface CronJob {
    id: number;
    name: string;
    schedule: string;
    description: string;
    status: string;
}

const scheduledTasks = new Map<number, ScheduledTask>();

export function startCronScheduler() {
    console.log('[Cron] Starting cron job scheduler...');
    loadAndScheduleJobs();

    setInterval(() => {
        loadAndScheduleJobs();
    }, 60000);

    startReflectionHeartbeat();
}

function loadAndScheduleJobs() {
    try {
        const jobs = sqlite.prepare('SELECT * FROM cron_jobs WHERE status = ?').all('active') as CronJob[];
        const activeIds = new Set(jobs.map(j => j.id));

        // 1. Stop and remove tasks that are no longer in the active list
        for (const [id, task] of scheduledTasks.entries()) {
            if (!activeIds.has(id)) {
                task.stop();
                scheduledTasks.delete(id);
                console.log(`[Cron] Stopped and removed inactive job id=${id}`);
            }
        }

        // 2. Schedule new active jobs
        jobs.forEach(job => {
            if (!scheduledTasks.has(job.id)) {
                if (cron.validate(job.schedule)) {
                    const task = cron.schedule(job.schedule, () => {
                        executeCronJob(job);
                    });
                    scheduledTasks.set(job.id, task);
                    console.log(`[Cron] Scheduled: "${job.name}" (${job.schedule})`);
                } else {
                    console.warn(`[Cron] Invalid schedule for job "${job.name}": ${job.schedule}`);
                }
            }
        });

        console.log(`[Cron] Scheduler synced: ${scheduledTasks.size} active tasks running.`);
    } catch (e: any) {
        console.error('[Cron] Error loading jobs:', e.message);
    }
}

export async function executeCronJob(job: CronJob) {
    console.log(`[Cron] Executing: ${job.name}`);

    try {
        const agent = getDashboardAgent();
        const taskDescription = job.description || job.name.replace(/^\[(REMINDER|TASK|CRON|ONCE|RECURRING)\]\s*/i, '').trim();

        if (agent) {
            console.log(`[Cron] Running agent with task: ${taskDescription}`);

            try {
                // Run the agent asynchronously
                const response = await agent.run(taskDescription);
                console.log(`[Cron] Agent completed task: ${job.name}`);

                // Record success in history
                sqlite.prepare('INSERT INTO cron_history (job_name, status, output) VALUES (?, ?, ?)')
                    .run(job.name, 'success', response.substring(0, 1000));

                // If it's a one-time job, deactivate it after success
                if (job.name.toUpperCase().startsWith('[ONCE]')) {
                    sqlite.prepare('UPDATE cron_jobs SET status = ? WHERE id = ?').run('inactive', job.id);
                    console.log(`[Cron] Deactivated one-time job: ${job.name}`);
                }

                // Send result to Telegram
                const userIds = getAllowedUserIds();
                for (const userId of userIds) {
                    const summary = response.length > 500 ? response.substring(0, 500) + '...' : response;
                    sendTelegramMessage(userId, `✅ Scheduled Task Completed: ${job.name}\n\n${summary}`);
                }
            } catch (err: any) {
                console.error(`[Cron] Agent task failed: ${err.message}`);

                sqlite.prepare('INSERT INTO cron_history (job_name, status, output) VALUES (?, ?, ?)')
                    .run(job.name, 'error', err.message);

                // Notify about failure
                const userIds = getAllowedUserIds();
                for (const userId of userIds) {
                    sendTelegramMessage(userId, `❌ Scheduled Task Failed: ${job.name}\n\nError: ${err.message}`);
                }
            }
        } else {
            console.warn('[Cron] Agent not available, skipping task execution');
            sqlite.prepare('INSERT INTO cron_history (job_name, status, output) VALUES (?, ?, ?)')
                .run(job.name, 'skipped', 'Agent not available at execution time');
        }
    } catch (e: any) {
        console.error(`[Cron] Error executing ${job.name}:`, e.message);
        sqlite.prepare('INSERT INTO cron_history (job_name, status, output) VALUES (?, ?, ?)')
            .run(job.name, 'error', `Execution Error: ${e.message}`);
    }
}

export function stopCronScheduler() {
    scheduledTasks.forEach((task) => task.stop());
    scheduledTasks.clear();
    console.log('[Cron] All scheduled tasks stopped');
}

export function reloadCronScheduler() {
    console.log('[Cron] Reloading scheduler from database...');
    // We don't necessarily need to stop everything if loadAndScheduleJobs syncs correctly,
    // but stopping and clearing ensures a clean state if schedules changed.
    stopCronScheduler();
    loadAndScheduleJobs();
}

export function cancelScheduledJob(jobId: number) {
    const task = scheduledTasks.get(jobId);
    if (!task) return false;
    task.stop();
    scheduledTasks.delete(jobId);
    console.log('[Cron] Cancelled scheduled job id=' + jobId);
    return true;
}
