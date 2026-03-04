import { getDb } from "../memory/db.js";
import { logger } from "../logger.js";

export interface FileOperation {
    id: string;
    operation: string;
    path: string;
    destination: string | null;
    status: "success" | "failed";
    error: string | null;
    created_at: string;
}

export function migrateFileOperations(): void {
    const db = getDb();

    db.exec(`
        CREATE TABLE IF NOT EXISTS file_operations (
            id TEXT PRIMARY KEY,
            operation TEXT NOT NULL,
            path TEXT NOT NULL,
            destination TEXT,
            status TEXT NOT NULL DEFAULT 'success',
            error TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_file_operations_created ON file_operations(created_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_file_operations_operation ON file_operations(operation);`);

    logger.info("db", "File operations table ready");
}

function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function logFileOperation(
    operation: string,
    path: string,
    status: "success" | "failed",
    destination?: string,
    error?: string
): FileOperation {
    const db = getDb();
    const id = generateUUID();
    const now = new Date().toISOString();

    db.prepare(`
        INSERT INTO file_operations (id, operation, path, destination, status, error, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, operation, path, destination || null, status, error || null, now);

    return {
        id,
        operation,
        path,
        destination: destination || null,
        status,
        error: error || null,
        created_at: now,
    };
}

export function getRecentFileOperations(limit: number = 50): FileOperation[] {
    const db = getDb();
    return db.prepare(`
        SELECT * FROM file_operations ORDER BY created_at DESC LIMIT ?
    `).all(limit) as FileOperation[];
}
