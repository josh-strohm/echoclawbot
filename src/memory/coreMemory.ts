import { getDb } from "./db.js";
import { logger } from "../logger.js";

export interface CoreMemory {
    id: number;
    chat_id: string;
    category: string;
    content: string;
    importance: number;
    created_at: string;
    updated_at: string;
}

export function saveCoreMemory(
    chatId: string,
    content: string,
    category: string = "general",
    importance: number = 0.5
): CoreMemory {
    const db = getDb();
    const now = new Date().toISOString();

    // Check if similar fact already exists
    const existing = db.prepare(`
        SELECT id, content FROM core_memory 
        WHERE chat_id = ? AND content = ?
    `).get(chatId, content) as { id: number } | undefined;

    if (existing) {
        db.prepare(`
            UPDATE core_memory SET updated_at = ? WHERE id = ?
        `).run(now, existing.id);
        
        return db.prepare("SELECT * FROM core_memory WHERE id = ?").get(existing.id) as CoreMemory;
    }

    const result = db.prepare(`
        INSERT INTO core_memory (chat_id, category, content, importance, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(chatId, category, content, importance, now, now);

    logger.info("memory", "Saved core memory", { chatId, category, contentLength: content.length });

    return db.prepare("SELECT * FROM core_memory WHERE id = ?").get(result.lastInsertRowid) as CoreMemory;
}

export function getCoreMemory(chatId: string, category?: string): CoreMemory[] {
    const db = getDb();
    
    if (category) {
        return db.prepare(`
            SELECT * FROM core_memory 
            WHERE chat_id = ? AND category = ?
            ORDER BY importance DESC, updated_at DESC
        `).all(chatId, category) as CoreMemory[];
    }

    return db.prepare(`
        SELECT * FROM core_memory 
        WHERE chat_id = ?
        ORDER BY importance DESC, updated_at DESC
    `).all(chatId) as CoreMemory[];
}

export function updateCoreMemory(id: number, content: string, importance?: number): void {
    const db = getDb();
    const now = new Date().toISOString();

    if (importance !== undefined) {
        db.prepare(`
            UPDATE core_memory SET content = ?, importance = ?, updated_at = ? WHERE id = ?
        `).run(content, importance, now, id);
    } else {
        db.prepare(`
            UPDATE core_memory SET content = ?, updated_at = ? WHERE id = ?
        `).run(content, now, id);
    }
}

export function deleteCoreMemory(id: number): void {
    const db = getDb();
    db.prepare("DELETE FROM core_memory WHERE id = ?").run(id);
}

export function searchCoreMemory(chatId: string, query: string): CoreMemory[] {
    const db = getDb();
    const pattern = `%${query}%`;
    
    return db.prepare(`
        SELECT * FROM core_memory 
        WHERE chat_id = ? AND (content LIKE ? OR category LIKE ?)
        ORDER BY importance DESC
    `).all(chatId, pattern, pattern) as CoreMemory[];
}
