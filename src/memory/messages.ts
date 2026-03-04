import { getDb } from "./db.js";
import { logger } from "../logger.js";

export interface Message {
    id: number;
    chat_id: string;
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
}

export function saveMessage(chatId: string, role: string, content: string): Message {
    const db = getDb();
    const now = new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO messages (chat_id, role, content, created_at)
        VALUES (?, ?, ?, ?)
    `).run(chatId, role, content, now);

    return db.prepare("SELECT * FROM messages WHERE id = ?").get(result.lastInsertRowid) as Message;
}

export function getMessages(chatId: string, limit: number = 20, offset: number = 0): Message[] {
    const db = getDb();
    
    return db.prepare(`
        SELECT * FROM messages 
        WHERE chat_id = ?
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
    `).all(chatId, limit, offset) as Message[];
}

export function getMessageCount(chatId: string): number {
    const db = getDb();
    const result = db.prepare(`
        SELECT COUNT(*) as count FROM messages WHERE chat_id = ?
    `).get(chatId) as { count: number };
    return result.count;
}

export function deleteMessages(chatId: string, keepCount: number): number {
    const db = getDb();
    
    // Get IDs of messages to keep (most recent)
    const toKeep = db.prepare(`
        SELECT id FROM messages 
        WHERE chat_id = ?
        ORDER BY created_at DESC
        LIMIT ?
    `).all(chatId, keepCount) as { id: number }[];

    if (toKeep.length === 0) return 0;

    const keepIds = toKeep.map(m => m.id);
    const placeholders = keepIds.map(() => "?").join(",");
    
    const result = db.prepare(`
        DELETE FROM messages 
        WHERE chat_id = ? AND id NOT IN (${placeholders})
    `).run(chatId, ...keepIds);

    return result.changes;
}

export function clearMessages(chatId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM messages WHERE chat_id = ?").run(chatId);
    logger.info("memory", "Cleared messages", { chatId });
}

export function getAllMessagesForCompaction(chatId: string): Message[] {
    const db = getDb();
    
    return db.prepare(`
        SELECT * FROM messages 
        WHERE chat_id = ?
        ORDER BY created_at ASC
    `).all(chatId) as Message[];
}
