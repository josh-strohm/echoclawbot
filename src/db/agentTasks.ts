import { getDb } from "../memory/db.js";
import { logger } from "../logger.js";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface AgentTask {
    id: string;
    parent_task_id: string | null;
    title: string;
    description: string;
    status: TaskStatus;
    result: string | null;
    dependencies: string;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface SubtaskDefinition {
    title: string;
    description: string;
    dependencies: string[];
    priority: number;
}

export function migrateAgentTasks(): void {
    const db = getDb();

    db.exec(`
        CREATE TABLE IF NOT EXISTS agent_tasks (
            id TEXT PRIMARY KEY,
            parent_task_id TEXT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            result TEXT,
            dependencies TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent ON agent_tasks(parent_task_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);`);

    logger.info("db", "Agent tasks table ready");
}

export function createAgentTask(
    id: string,
    parentTaskId: string | null,
    title: string,
    description: string,
    dependencies: string[] = []
): AgentTask {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO agent_tasks (id, parent_task_id, title, description, status, dependencies, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
    `).run(id, parentTaskId, title, description, JSON.stringify(dependencies), now, now);

    return {
        id,
        parent_task_id: parentTaskId,
        title,
        description,
        status: "pending",
        result: null,
        dependencies: JSON.stringify(dependencies),
        created_at: now,
        updated_at: now,
        completed_at: null,
    };
}

export function getAgentTask(id: string): AgentTask | undefined {
    const db = getDb();
    const row = db.prepare("SELECT * FROM agent_tasks WHERE id = ?").get(id) as AgentTask | undefined;
    return row;
}

export function getSubtasks(parentTaskId: string): AgentTask[] {
    const db = getDb();
    return db.prepare("SELECT * FROM agent_tasks WHERE parent_task_id = ? ORDER BY created_at").all(parentTaskId) as AgentTask[];
}

export function getMostRecentTeam(): AgentTask | undefined {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM agent_tasks 
        WHERE parent_task_id IS NULL 
        ORDER BY created_at DESC 
        LIMIT 1
    `).get() as AgentTask | undefined;
}

export function getMostRecentSubtasks(): AgentTask[] {
    const parent = getMostRecentTeam();
    if (!parent) return [];
    return getSubtasks(parent.id);
}

export function updateTaskStatus(
    id: string,
    status: TaskStatus,
    result: string | null = null
): void {
    const db = getDb();
    const now = new Date().toISOString();

    if (status === "completed" || status === "failed" || status === "cancelled") {
        db.prepare(`
            UPDATE agent_tasks 
            SET status = ?, result = ?, updated_at = ?, completed_at = ?
            WHERE id = ?
        `).run(status, result, now, now, id);
    } else {
        db.prepare(`
            UPDATE agent_tasks 
            SET status = ?, result = ?, updated_at = ?
            WHERE id = ?
        `).run(status, result, now, id);
    }
}

export function cancelAllTasks(parentTaskId: string): number {
    const db = getDb();
    const now = new Date().toISOString();

    const result = db.prepare(`
        UPDATE agent_tasks 
        SET status = 'cancelled', updated_at = ?, completed_at = ?
        WHERE parent_task_id = ? AND status IN ('pending', 'running')
    `).run(now, now, parentTaskId);

    const parentResult = db.prepare(`
        UPDATE agent_tasks 
        SET status = 'cancelled', updated_at = ?, completed_at = ?
        WHERE id = ? AND status IN ('pending', 'running')
    `).run(now, now, parentTaskId);

    return result.changes + parentResult.changes;
}

export function getTasksByStatus(parentTaskId: string, status: TaskStatus): AgentTask[] {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM agent_tasks 
        WHERE parent_task_id = ? AND status = ?
    `).all(parentTaskId, status) as AgentTask[];
}

export function getPendingOrRunningTasks(parentTaskId: string): AgentTask[] {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM agent_tasks 
        WHERE parent_task_id = ? AND status IN ('pending', 'running')
    `).all(parentTaskId) as AgentTask[];
}

export function getCompletedTasks(parentTaskId: string): AgentTask[] {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM agent_tasks 
        WHERE parent_task_id = ? AND status = 'completed'
    `).all(parentTaskId) as AgentTask[];
}

export function getFailedTasks(parentTaskId: string): AgentTask[] {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM agent_tasks 
        WHERE parent_task_id = ? AND status = 'failed'
    `).all(parentTaskId) as AgentTask[];
}
