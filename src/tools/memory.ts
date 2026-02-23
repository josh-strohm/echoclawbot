/**
 * tools/memory.ts — Memory tools for the agentic loop.
 *
 * All memory operations go directly to the local vector store (sqlite-vec).
 * SQLite for text/metadata, vector embeddings for semantic search.
 *
 * Gives the LLM the ability to:
 *   - remember: Save a fact, preference, or note about the user
 *   - recall: Search memories for relevant information
 *   - forget: Delete a specific memory
 *   - list_memories: Show stored memories
 *
 * The LLM decides when to save/recall — the system prompt guides it.
 */

import { registerTool } from "./registry.js";
import { upsertFact, searchSemanticFacts, deleteFacts } from "../memory/vector_memory.js";
import { logger } from "../logger.js";
import crypto from "crypto";

// ── remember ───────────────────────────────────────────────

registerTool({
    name: "remember",
    description:
        "Save something to long-term memory. Use this when the user tells you a fact about themselves, " +
        "a preference, or something they'd want you to remember across conversations. " +
        "Types: 'fact' (about the user), 'preference' (likes/dislikes/settings), 'note' (general), 'context' (situational).",
    inputSchema: {
        type: "object" as const,
        properties: {
            content: {
                type: "string",
                description: "The fact or preference to remember. Be specific and concise.",
            },
            type: {
                type: "string",
                enum: ["fact", "preference", "note", "context"],
                description: "The type of memory. Defaults to 'fact'.",
            },
            importance: {
                type: "number",
                description: "How important this is (0.0 to 1.0). Default 0.5. Use 0.8+ for critical info like name, job, etc.",
            },
        },
        required: ["content"],
    },
    execute: async (input) => {
        const content = input.content as string;
        const type = (input.type as string) || "fact";
        const importance = typeof input.importance === "number" ? input.importance : 0.5;
        const chatId = (input as Record<string, unknown>)._chatId as number || 0;

        const factId = `fact_${crypto.randomUUID()}`;

        try {
            await upsertFact(factId, chatId, content, importance);
            logger.info("memory", "Saved memory to vector store", { factId, type, contentLength: content.length });

            return JSON.stringify({
                saved: true,
                id: factId,
                type,
                content,
                importance,
            });
        } catch (err) {
            logger.error("memory", "Failed to save memory to vector store", { error: String(err) });
            return JSON.stringify({
                saved: false,
                error: "Failed to save memory. Please try again.",
            });
        }
    },
});

// ── recall ─────────────────────────────────────────────────

registerTool({
    name: "recall",
    description:
        "Search your long-term semantic memory for relevant information about the user. " +
        "Use this when you need to remember something the user told you before, or to check if you know something.",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "What to search for in memory (e.g. 'favorite color', 'job', 'birthday').",
            },
            limit: {
                type: "number",
                description: "Max results to return. Default 5.",
            },
        },
        required: ["query"],
    },
    execute: async (input) => {
        const query = input.query as string;
        const limit = (input.limit as number) || 5;
        const chatId = (input as Record<string, unknown>)._chatId as number || 0;

        const results = await searchSemanticFacts(chatId, query, limit);

        if (results.length === 0) {
            return JSON.stringify({ found: false, message: "No matching memories found." });
        }

        return JSON.stringify({
            found: true,
            count: results.length,
            memories: results.map((m) => ({
                id: m.id,
                content: m.content,
                importance: m.importance,
                score: m.score,
                created: m.created_at,
            })),
        });
    },
});

// ── forget ─────────────────────────────────────────────────

registerTool({
    name: "forget",
    description:
        "Delete a specific memory by its ID. Use this when the user asks you to forget something, " +
        "or when a memory is outdated. Use 'recall' first to find the memory ID.",
    inputSchema: {
        type: "object" as const,
        properties: {
            memory_id: {
                type: "string",
                description: "The ID of the memory to delete (e.g. 'fact_abc123...').",
            },
        },
        required: ["memory_id"],
    },
    execute: async (input) => {
        const memoryId = input.memory_id as string;

        try {
            await deleteFacts([memoryId]);
            logger.info("memory", "Deleted memory from vector store", { memoryId });
            return JSON.stringify({
                deleted: true,
                message: `Memory ${memoryId} deleted.`,
            });
        } catch (err) {
            logger.error("memory", "Failed to delete memory", { error: String(err) });
            return JSON.stringify({
                deleted: false,
                message: `Failed to delete memory ${memoryId}.`,
            });
        }
    },
});

// ── list_memories ──────────────────────────────────────────

registerTool({
    name: "list_memories",
    description:
        "List all stored memories about the user. Use this when the user asks 'what do you remember about me?' or similar.",
    inputSchema: {
        type: "object" as const,
        properties: {
            limit: {
                type: "number",
                description: "Max memories to return. Default 10.",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const limit = (input.limit as number) || 10;
        const chatId = (input as Record<string, unknown>)._chatId as number || 0;

        const memories = await searchSemanticFacts(chatId, "user facts preferences projects personal information", limit);

        return JSON.stringify({
            count: memories.length,
            memories: memories.map((m) => ({
                id: m.id,
                content: m.content,
                importance: m.importance,
                score: m.score,
                created: m.created_at,
            })),
        });
    },
});
