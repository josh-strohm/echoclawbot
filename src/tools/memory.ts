/**
 * tools/memory.ts — Memory tools for the agentic loop.
 *
 * Three-tier memory system:
 * - Tier 1: SQLite (core_memory, messages, summaries)
 * - Tier 2: Pinecone (semantic search)
 * - Tier 3: Supabase (structured data)
 *
 * Gives the LLM the ability to:
 *   - remember: Save a fact, preference, or note about the user (Tier 1)
 *   - recall: Search memories for relevant information (Tier 1 + 2)
 *   - remember_fact: Explicitly store to core memory (Tier 1)
 *   - recall_memory: Search semantic memory and display core facts (Tier 1 + 2)
 *   - add_to_memory: Ingest content to knowledge namespace (Tier 2)
 *   - save_data: Save structured data to Supabase (Tier 3)
 *   - query_data: Query Supabase data store (Tier 3)
 *   - forget: Delete a specific memory
 *   - list_memories: Show stored memories
 */

import { registerTool } from "./registry.js";
import { upsertFact, searchSemanticFacts, deleteFacts } from "../memory/vector_memory.js";
import { saveMemory, deleteMemory } from "../memory/store.js";
import { saveCoreMemory, getCoreMemory, searchCoreMemory } from "../memory/coreMemory.js";
import { searchPineconeMemory, ingestToKnowledge, searchKnowledge } from "../services/pineconeMemory.js";
import { saveData, queryData } from "../services/supabaseStore.js";
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
        const chatId = (input as Record<string, unknown>)._chatId as string || "0";

        const factId = `fact_${crypto.randomUUID()}`;

        try {
            await upsertFact(factId, chatId, content, importance);
            saveMemory(chatId, content, type as any, "user", importance);
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
        const chatId = (input as Record<string, unknown>)._chatId as string || "0";

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
        const chatId = (input as Record<string, unknown>)._chatId as string || "0";

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

// ── remember_fact (Tier 1) ─────────────────────────────────

registerTool({
    name: "remember_fact",
    description:
        "Explicitly store a fact to core memory (Tier 1). " +
        "Use this to remember important information about the user that should always be available. " +
        "Categories: name, location, job, preference, date, other.",
    inputSchema: {
        type: "object" as const,
        properties: {
            content: {
                type: "string",
                description: "The fact to remember.",
            },
            category: {
                type: "string",
                enum: ["name", "location", "job", "preference", "date", "other"],
                description: "Category of the fact.",
            },
            importance: {
                type: "number",
                description: "Importance 0-1 (default 0.5). Use 0.8+ for critical info.",
            },
        },
        required: ["content", "category"],
    },
    execute: async (input) => {
        const content = input.content as string;
        const category = input.category as string;
        const importance = typeof input.importance === "number" ? input.importance : 0.5;
        const chatId = (input as Record<string, unknown>)._chatId as string || "0";

        try {
            saveCoreMemory(chatId, content, category, importance);
            return JSON.stringify({ saved: true, content, category });
        } catch (err) {
            return JSON.stringify({ saved: false, error: String(err) });
        }
    },
});

// ── recall_memory (Tier 1 + 2) ────────────────────────────────

registerTool({
    name: "recall_memory",
    description:
        "Search semantic memory (Tier 1 + 2) and display core facts. " +
        "Searches both core memory (exact) and Pinecone (semantic) for relevant information.",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "What to search for.",
            },
        },
        required: ["query"],
    },
    execute: async (input) => {
        const query = input.query as string;
        const chatId = (input as Record<string, unknown>)._chatId as string || "0";

        // Get core facts
        const coreFacts = searchCoreMemory(chatId, query);

        // Search Pinecone
        const semanticResults = await searchPineconeMemory(chatId, query, 5);

        return JSON.stringify({
            core_facts: coreFacts.map(f => ({ category: f.category, content: f.content })),
            semantic_results: semanticResults.map(r => ({ content: r.content, score: r.score })),
        });
    },
});

// ── add_to_memory (Tier 2) ───────────────────────────────────

registerTool({
    name: "add_to_memory",
    description:
        "Ingest transcripts, URLs, or raw text into the knowledge namespace (Tier 2). " +
        "Content is chunked with 150-char overlap before embedding for context continuity.",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "string",
                description: "Unique ID for this knowledge item.",
            },
            content: {
                type: "string",
                description: "Text content to ingest.",
            },
            source: {
                type: "string",
                description: "Source description (e.g., 'webpage', 'transcript').",
            },
        },
        required: ["id", "content"],
    },
    execute: async (input) => {
        const id = input.id as string;
        const content = input.content as string;
        const source = input.source as string || "user";

        try {
            const success = await ingestToKnowledge(id, content, { source });
            return JSON.stringify({ success, id, chunks: Math.ceil(content.length / 850) });
        } catch (err) {
            return JSON.stringify({ success: false, error: String(err) });
        }
    },
});

// ── save_data (Tier 3) ────────────────────────────────────────

registerTool({
    name: "save_data",
    description:
        "Save structured data to Supabase data_store (Tier 3). " +
        "Use for analytics, user preferences, or any structured data you want to persist.",
    inputSchema: {
        type: "object" as const,
        properties: {
            key: {
                type: "string",
                description: "Unique key for this data.",
            },
            value: {
                type: "string",
                description: "Value to store (will be saved as string or JSON).",
            },
            data_type: {
                type: "string",
                enum: ["text", "number", "json"],
                description: "Type of data being stored.",
            },
        },
        required: ["key", "value"],
    },
    execute: async (input) => {
        const key = input.key as string;
        const value = input.value as string;
        const dataType = input.data_type as "text" | "number" | "json" || "text";

        try {
            const result = await saveData(key, value, dataType);
            return JSON.stringify({ saved: true, key, data_type: dataType });
        } catch (err) {
            return JSON.stringify({ saved: false, error: String(err) });
        }
    },
});

// ── query_data (Tier 3) ───────────────────────────────────────

registerTool({
    name: "query_data",
    description:
        "Query the Supabase data_store (Tier 3) by key or data type.",
    inputSchema: {
        type: "object" as const,
        properties: {
            key: {
                type: "string",
                description: "Specific key to query (optional).",
            },
            data_type: {
                type: "string",
                enum: ["text", "number", "json"],
                description: "Filter by data type (optional).",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const key = input.key as string | undefined;
        const dataType = input.data_type as string | undefined;

        try {
            const results = await queryData(key, dataType);
            return JSON.stringify({ count: results.length, data: results });
        } catch (err) {
            return JSON.stringify({ error: String(err) });
        }
    },
});
