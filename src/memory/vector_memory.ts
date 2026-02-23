/**
 * memory/vector_memory.ts — SQLite-Vec Wrapper for Semantic Memory
 *
 * Uses sqlite-vec for vector embeddings stored locally in SQLite.
 */

import { getDb } from "./db.js";
import { generateEmbedding } from "./embeddings.js";
import { logger } from "../logger.js";

export interface SemanticFact {
    id: string;
    score?: number;
    chat_id: number;
    content: string;
    created_at: string;
    updated_at: string;
    importance: number;
}

/**
 * Upsert a single semantic fact into SQLite-Vec.
 */
export async function upsertFact(
    factId: string,
    chatId: number,
    content: string,
    importance: number = 0.5
): Promise<void> {
    const db = getDb();

    try {
        const vector = await generateEmbedding(content);
        const now = new Date().toISOString();

        const existing = db.prepare("SELECT row_id FROM memory_metadata WHERE fact_id = ?").get(factId) as { row_id: number } | undefined;

        if (existing) {
            db.prepare(`
                UPDATE memory_vectors SET embedding = ? WHERE rowid = ?
            `).run(JSON.stringify(vector), existing.row_id);

            db.prepare(`
                UPDATE memory_metadata SET text = ?, importance = ?, updated_at = ? WHERE row_id = ?
            `).run(content, importance, now, existing.row_id);

            logger.info("vector_memory", `Updated existing fact: ${factId}`);
        } else {
            const insertVec = db.prepare(`
                INSERT INTO memory_vectors (embedding) VALUES (?)
            `).run(JSON.stringify(vector));

            const rowId = insertVec.lastInsertRowid as number;

            db.prepare(`
                INSERT INTO memory_metadata (row_id, fact_id, chat_id, text, importance, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(rowId, factId, chatId, content, importance, now, now);

            logger.info("vector_memory", `Inserted new fact: ${factId}`);
        }
    } catch (err) {
        logger.error("vector_memory", `Failed to upsert fact ${factId}`, { error: String(err) });
        throw err;
    }
}

/**
 * Perform a semantic search query against the vector store.
 */
export async function searchSemanticFacts(
    chatId: number,
    query: string,
    limit: number = 5
): Promise<SemanticFact[]> {
    const db = getDb();

    try {
        const queryVector = await generateEmbedding(query);

        // Get all vectors for this chat
        const results = db.prepare(`
            SELECT 
                mm.row_id,
                mm.fact_id,
                mm.chat_id,
                mm.text,
                mm.importance,
                mm.created_at,
                mm.updated_at,
                mv.embedding
            FROM memory_metadata mm
            JOIN memory_vectors mv ON mv.rowid = mm.row_id
            WHERE mm.chat_id = ?
        `).all(chatId) as {
            row_id: number;
            fact_id: string;
            chat_id: number;
            text: string;
            importance: number;
            created_at: string;
            updated_at: string;
            embedding: Buffer;
        }[];

        // Convert embedding Buffer to number array and calculate cosine similarity
        const scored = results.map(doc => {
            const docVector = Array.from(new Float32Array(doc.embedding.buffer));
            const similarity = cosineSimilarity(queryVector, docVector);
            return { ...doc, similarity };
        });

        // Sort by similarity and take top results
        scored.sort((a, b) => b.similarity - a.similarity);
        const topResults = scored.slice(0, limit);

        logger.info("vector_memory", `Semantic search found ${topResults.length} matches for chat ${chatId}`, {
            query: query.substring(0, 50)
        });

        return topResults.map((doc) => ({
            id: doc.fact_id,
            score: doc.similarity,
            chat_id: doc.chat_id,
            content: doc.text,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            importance: doc.importance,
        }));
    } catch (err) {
        logger.error("vector_memory", "Semantic search failed", { error: String(err) });
        return [];
    }
}

function cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}

/**
 * Delete a batch of facts by their fact IDs.
 */
export async function deleteFacts(factIds: string[]): Promise<void> {
    if (factIds.length === 0) return;

    const db = getDb();

    try {
        const placeholders = factIds.map(() => "?").join(",");
        const rows = db.prepare(`
            SELECT row_id FROM memory_metadata WHERE fact_id IN (${placeholders})
        `).all(...factIds) as { row_id: number }[];

        if (rows.length === 0) {
            logger.warn("vector_memory", "No matching facts to delete");
            return;
        }

        const rowIds = rows.map(r => r.row_id);
        const rowPlaceholders = rowIds.map(() => "?").join(",");

        db.prepare(`DELETE FROM memory_vectors WHERE rowid IN (${rowPlaceholders})`).run(...rowIds);
        db.prepare(`DELETE FROM memory_metadata WHERE row_id IN (${rowPlaceholders})`).run(...rowIds);

        logger.info("vector_memory", `Deleted ${rows.length} facts`);
    } catch (err) {
        logger.error("vector_memory", "Failed to delete facts", { error: String(err) });
    }
}
