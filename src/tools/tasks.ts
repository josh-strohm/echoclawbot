import { registerFunctionTool } from './registry';
import { sqlite } from '../dashboard/db';

registerFunctionTool(
    async () => {
        try {
            const rows = sqlite.prepare("SELECT * FROM tasks WHERE status != 'Done'").all() as any[];
            if (!rows.length) return "No pending tasks found.";
            return rows.map(t => `[ID: ${t.id}] ${t.status} - ${t.title}`).join('\n');
        } catch (e: any) {
            return `Error getting pending tasks: ${e.message}`;
        }
    },
    {
        name: 'get_pending_tasks',
        description: 'Get a list of all currently active or pending tasks.',
        parameters: { type: 'object', properties: {} }
    }
);

registerFunctionTool(
    async (args: { id: number, patch: { status?: string, progress_notes?: string } }) => {
        try {
            const updates = [];
            const params: any[] = [];
            if (args.patch.status) {
                updates.push('status = ?');
                params.push(args.patch.status);
            }
            if (args.patch.progress_notes) {
                updates.push('progress_notes = ?');
                params.push(args.patch.progress_notes);
            }
            if (!updates.length) return "No updates provided.";

            updates.push('updated_at = CURRENT_TIMESTAMP');
            params.push(args.id);

            const info = sqlite.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            if (info.changes === 0) return `Task with ID ${args.id} not found.`;
            return `Task ${args.id} updated successfully.`;
        } catch (e: any) {
            return `Error updating task: ${e.message}`;
        }
    },
    {
        name: 'update_task',
        description: 'Update the status or progress notes of an existing task by its ID.',
        parameters: {
            type: 'object',
            properties: {
                id: { type: 'number', description: 'The numeric ID of the task to update' },
                patch: {
                    type: 'object',
                    properties: {
                        status: { type: 'string', description: 'New status (Todo, In Progress, Done, Failed)', enum: ['Todo', 'In Progress', 'Done', 'Failed'] },
                        progress_notes: { type: 'string', description: 'New or appended progress notes' }
                    }
                }
            },
            required: ['id', 'patch']
        }
    }
);

registerFunctionTool(
    async (args: { title: string, schedule: string, description?: string }) => {
        try {
            const jobName = `[TASK] ${args.title}`;
            sqlite.prepare('INSERT INTO cron_jobs (name, schedule, description, status) VALUES (?, ?, ?, ?)')
                .run(jobName, args.schedule, args.description || '', 'active');

            return `Task "${args.title}" scheduled successfully with expression: ${args.schedule}`;
        } catch (e: any) {
            return `Error scheduling task: ${e.message}`;
        }
    },
    {
        name: 'schedule_task',
        description: 'Schedule a future or recurring task for yourself. The title MUST be descriptive. Use a standard cron expression (e.g., "0 9 * * *" for daily at 9am, "*/30 * * * *" for every 30 mins). The system will automatically wake you up to perform this task when the time comes.',
        parameters: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'What is the task you need to perform?' },
                schedule: { type: 'string', description: 'Cron expression for when to run. (e.g. "0 12 * * *" for noon daily, or "0 * * * *" for hourly)' },
                description: { type: 'string', description: 'Detailed context for when you wake up to do this.' }
            },
            required: ['title', 'schedule']
        }
    }
);
