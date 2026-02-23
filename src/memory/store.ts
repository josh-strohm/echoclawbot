/**
 * memory/store.ts — Memory CRUD operations.
 *
 * Provides functions for:
 *   - Saving new memories (facts, preferences, context)
 *   - Searching memories via FTS5 full-text search
 *   - Retrieving recent or important memories
 *   - Deleting memories
 *
 * All queries are parameterized — no SQL injection risk.
 */

import { getDb } from "./db.js";
import { logger } from "../logger.js";

// ── Types ──────────────────────────────────────────────────

export type MemoryType = "fact" | "preference" | "context" | "note";

export interface Memory {
    id: number;
    chat_id: number;
    type: MemoryType;
    content: string;
    source: string;
    importance: number;
    created_at: string;
    updated_at: string;
    accessed_at: string;
    access_count: number;
}

// ── Save ───────────────────────────────────────────────────

import { upsertFact } from "./vector_memory.js";
import crypto from "crypto";

/**
 * Save a new memory.
 */
export async function saveMemory(
    chatId: number,
    content: string,
    type: MemoryType = "fact",
    source: string = "user",
    importance: number = 0.5
): Promise<Memory> {
    const db = getDb();

    const stmt = db.prepare(`
    INSERT INTO memories (chat_id, type, content, source, importance)
    VALUES (?, ?, ?, ?, ?)
  `);

    const result = stmt.run(chatId, type, content, source, importance);
    const memoryId = result.lastInsertRowid;

    logger.info("memory", "Saved memory to SQLite", {
        id: memoryId,
        type,
        contentLength: content.length,
    });

    // Also upsert into vector store immediately for semantic retrieval
    const factId = `fact_${crypto.randomUUID()}`;
    try {
        await upsertFact(factId, Number(chatId), content, importance);
        logger.info("memory", "Upserted to vector store", { factId });
    } catch (err) {
        logger.error("memory", "Failed to upsert to vector store during saveMemory", { error: String(err) });
    }

    return db.prepare("SELECT * FROM memories WHERE id = ?").get(memoryId) as Memory;
}

// ── Search (FTS5) ──────────────────────────────────────────

/**
 * Search memories using full-text search.
 * Returns results ranked by relevance, filtered to the given chat.
 */
export function searchMemories(
    chatId: number,
    query: string,
    limit: number = 10
): Memory[] {
    const db = getDb();

    // Sanitize query for FTS5 — wrap each word in quotes to avoid syntax errors
    const sanitized = query
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .map((w) => `"${w}"`)
        .join(" OR ");

    if (!sanitized) return [];

    try {
        const results = db.prepare(`
      SELECT m.*, rank
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
        AND m.chat_id = ?
      ORDER BY rank
      LIMIT ?
    `).all(sanitized, chatId, limit) as (Memory & { rank: number })[];

        // Update access timestamps
        if (results.length > 0) {
            const updateStmt = db.prepare(`
        UPDATE memories 
        SET accessed_at = datetime('now'), access_count = access_count + 1
        WHERE id = ?
      `);
            for (const r of results) {
                updateStmt.run(r.id);
            }
        }

        logger.info("memory", "Search results", {
            query: query.slice(0, 100),
            resultCount: results.length,
        });

        return results;
    } catch (err) {
        logger.warn("memory", "FTS search error, falling back to LIKE", {
            error: err instanceof Error ? err.message : String(err),
        });

        // Fallback: simple LIKE search
        return db.prepare(`
      SELECT * FROM memories
      WHERE chat_id = ? AND content LIKE ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(chatId, `%${query}%`, limit) as Memory[];
    }
}

// ── Retrieve ───────────────────────────────────────────────

/**
 * Get recent memories for a chat.
 */
export function getRecentMemories(chatId: number, limit: number = 20): Memory[] {
    const db = getDb();
    return db.prepare(`
    SELECT * FROM memories
    WHERE chat_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(chatId, limit) as Memory[];
}

/**
 * Get the most important memories for a chat.
 */
export function getImportantMemories(chatId: number, limit: number = 10): Memory[] {
    const db = getDb();
    return db.prepare(`
    SELECT * FROM memories
    WHERE chat_id = ?
    ORDER BY importance DESC, access_count DESC
    LIMIT ?
  `).all(chatId, limit) as Memory[];
}

/**
 * Get all memories of a specific type.
 */
export function getMemoriesByType(chatId: number, type: MemoryType, limit: number = 20): Memory[] {
    const db = getDb();
    return db.prepare(`
    SELECT * FROM memories
    WHERE chat_id = ? AND type = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(chatId, type, limit) as Memory[];
}

// ── Delete ─────────────────────────────────────────────────

/**
 * Delete a specific memory by ID (with ownership check).
 */
export function deleteMemory(chatId: number, memoryId: number): boolean {
    const db = getDb();
    const result = db.prepare(`
    DELETE FROM memories WHERE id = ? AND chat_id = ?
  `).run(memoryId, chatId);

    if (result.changes > 0) {
        logger.info("memory", "Deleted memory", { memoryId });
        return true;
    }
    return false;
}

/**
 * Get a count of all memories for a chat.
 */
export function getMemoryCount(chatId: number): number {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as c FROM memories WHERE chat_id = ?").get(chatId) as { c: number };
    return row.c;
}

import { searchSemanticFacts } from "./vector_memory.js";

// ── Context Builder ────────────────────────────────────────

/**
 * Build a memory context string to inject into the system prompt.
 * Combines important memories + relevant search results via Semantic Vector Search.
 */
export async function buildMemoryContext(chatId: number, currentMessage: string): Promise<string> {
    const relevant = await searchSemanticFacts(chatId, currentMessage, 10);

    if (relevant.length === 0) return "";

    const lines = relevant.map((m) => `- [Score: ${m.score?.toFixed(2) || "N/A"}] ${m.content}`);

    return `\n\n--- SEMANTIC MEMORIES ---\nHere are important facts retrieved from your long-term memory regarding the current conversation:\n${lines.join("\n")}\n--- END MEMORIES ---`;
}
