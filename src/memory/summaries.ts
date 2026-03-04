import { getDb } from "./db.js";
import { logger } from "../logger.js";

export interface Summary {
    id: number;
    chat_id: string;
    content: string;
    message_count: number;
    created_at: string;
}

export function saveSummary(chatId: string, content: string, messageCount: number): Summary {
    const db = getDb();
    const now = new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO summaries (chat_id, content, message_count, created_at)
        VALUES (?, ?, ?, ?)
    `).run(chatId, content, messageCount, now);

    logger.info("memory", "Saved summary", { chatId, messageCount });

    return db.prepare("SELECT * FROM summaries WHERE id = ?").get(result.lastInsertRowid) as Summary;
}

export function getSummaries(chatId: string): Summary[] {
    const db = getDb();
    
    return db.prepare(`
        SELECT * FROM summaries 
        WHERE chat_id = ?
        ORDER BY created_at DESC
    `).all(chatId) as Summary[];
}

export function getLatestSummary(chatId: string): Summary | undefined {
    const db = getDb();
    
    return db.prepare(`
        SELECT * FROM summaries 
        WHERE chat_id = ?
        ORDER BY created_at DESC
        LIMIT 1
    `).get(chatId) as Summary | undefined;
}

export function deleteSummary(id: number): void {
    const db = getDb();
    db.prepare("DELETE FROM summaries WHERE id = ?").run(id);
}

export function clearSummaries(chatId: string): void {
    const db = getDb();
    db.prepare("DELETE FROM summaries WHERE chat_id = ?").run(chatId);
    logger.info("memory", "Cleared summaries", { chatId });
}
