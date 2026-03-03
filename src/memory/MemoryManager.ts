import Database from 'better-sqlite3';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Supported Memory Tiers:
 * 1. short_term (SQLite)
 * 2. mid_term (Supabase)
 * 3. long_term (Pinecone)
 */
export type MemoryTier = 'short_term' | 'mid_term' | 'long_term';

/**
 * Universal payload for adding memory across tiers
 */
export interface MemoryPayload {
    // Shared / generic
    userId?: string;
    sessionId?: string;

    // Short-term (SQLite)
    role?: 'user' | 'assistant' | 'system' | 'tool';
    content?: string;

    // Mid-term (Supabase)
    tableName?: string; // Target Supabase table, e.g., 'user_profiles', 'system_logs', 'tool_history'
    data?: Record<string, any>; // Arbitrary row data to insert

    // Long-term (Pinecone) / Semantic text to embed
    textToEmbed?: string;
    metadata?: Record<string, any>;
}

/**
 * Retrieved context from all three memory tiers
 */
export interface CombinedContext {
    shortTerm: any[];
    midTerm: any[];
    longTerm: any[];
}

/**
 * MemoryManager Orchestrator
 * Implements a 3-tier memory system for the EchoClaw Bot.
 *
 * Requirements:
 * - SQLite (Tier 1) for fast local session history
 * - Supabase (Tier 2) for persistent structured profiles/logs  
 * - Pinecone (Tier 3) for vector embeddings and RAG
 * 
 * Note: Designed explicitly for OpenAI's `text-embedding-3-small` model.
 * The Pinecone index should be configured with 1536 dimensions corresponding to this model.
 */
export class MemoryManager {
    private sqlite: Database.Database;
    private supabase?: SupabaseClient;
    private pinecone?: Pinecone;
    private openai: OpenAI;
    private readonly EMBEDDING_MODEL = 'text-embedding-3-small';

    constructor() {
        // --- Tier 1: Initialize SQLite ---
        // Stored locally in the current working directory
        const dbPath = path.resolve(process.cwd(), 'echoclaw_short_term.db');
        this.sqlite = new Database(dbPath);
        this.initSqliteDb();

        // --- Tier 2: Initialize Supabase ---
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
        if (supabaseUrl && supabaseKey) {
            this.supabase = createClient(supabaseUrl, supabaseKey);
        } else {
            console.warn('[MemoryManager] Missing Supabase environment variables. Mid-term memory unavailable.');
        }

        // --- Tier 3: Initialize Pinecone ---
        const pineconeApiKey = process.env.PINECONE_API_KEY;
        if (pineconeApiKey) {
            this.pinecone = new Pinecone({ apiKey: pineconeApiKey });
        } else {
            console.warn('[MemoryManager] Missing Pinecone environment variables. Long-term semantic memory unavailable.');
        }

        // --- OpenAI (used for embeddings) ---
        const openaiApiKey = process.env.OPENAI_API_KEY || 'dummy';
        this.openai = new OpenAI({ apiKey: openaiApiKey });
    }

    /**
     * Bootstraps the local SQLite database layout if it does not already exist.
     */
    private initSqliteDb() {
        try {
            this.sqlite.exec(`
                CREATE TABLE IF NOT EXISTS session_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    user_id TEXT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Helpful indices for fast lookups
            this.sqlite.exec(`
                CREATE INDEX IF NOT EXISTS idx_session_id ON session_history(session_id);
                CREATE INDEX IF NOT EXISTS idx_user_id ON session_history(user_id);
            `);
        } catch (error) {
            console.error('[MemoryManager] SQLite initialization error:', error);
        }
    }

    /**
     * Intelligently routes data to the correct storage tier.
     * 
     * @param tier 'short_term' | 'mid_term' | 'long_term'
     * @param payload Memory payload containing the content/data to store
     */
    public async addMemory(tier: MemoryTier, payload: MemoryPayload): Promise<void> {
        try {
            switch (tier) {
                case 'short_term':
                    this.addShortTermMemory(payload);
                    break;
                case 'mid_term':
                    await this.addMidTermMemory(payload);
                    break;
                case 'long_term':
                    await this.addLongTermMemory(payload);
                    break;
                default:
                    throw new Error(`Unsupported memory tier: ${tier}`);
            }
        } catch (error: any) {
            console.error(`[MemoryManager] Failed to add memory to tier '${tier}':`, error.message);
            throw error;
        }
    }

    /**
     * Retrieves context from all three memory tiers asynchronously.
     * Combines recent chats, relevant structured metadata, and semantic similarity matches.
     * 
     * @param sessionId The current active session id
     * @param userId The active user id
     * @param semanticQuery A query string to search for historically relevant information (RAG)
     * @param historyLimit Number of short term turns to load
     * @param supabaseTables List of tables in supabase to blindly pull rows matching the user_id from (example implementation)
     * @returns A CombinedContext object holding aggregated conversational state
     */
    public async retrieveContext(
        sessionId: string,
        userId: string,
        semanticQuery?: string,
        historyLimit: number = 10,
        supabaseTables: string[] = [] // Specify tables like 'user_profiles' based on your implementation
    ): Promise<CombinedContext> {
        const [shortTerm, midTerm, longTerm] = await Promise.all([
            this.getShortTermMemory(sessionId, historyLimit),
            this.getMidTermMemory(userId, supabaseTables),
            semanticQuery ? this.getLongTermMemory(semanticQuery, userId) : Promise.resolve([])
        ]);

        return { shortTerm, midTerm, longTerm };
    }

    // ======================================
    // TIER 1: SHORT-TERM MEMORY (SQLite)
    // ======================================

    private addShortTermMemory(payload: MemoryPayload) {
        if (!payload.sessionId || !payload.role || !payload.content) {
            throw new Error('Short-term memory requires sessionId, role, and content.');
        }

        const stmt = this.sqlite.prepare(`
            INSERT INTO session_history (session_id, user_id, role, content)
            VALUES (?, ?, ?, ?)
        `);

        stmt.run(payload.sessionId, payload.userId || null, payload.role, payload.content);
    }

    private async getShortTermMemory(sessionId: string, limit: number): Promise<any[]> {
        const stmt = this.sqlite.prepare(`
            SELECT role, content, created_at 
            FROM session_history 
            WHERE session_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `);

        // Better-SQLite3 executes synchronously. We reverse it so the oldest is first for proper chronological feeding to LLM context.
        const rows = stmt.all(sessionId, limit) as any[];
        return rows.reverse();
    }

    // ======================================
    // TIER 2: MID-TERM MEMORY (Supabase)
    // ======================================

    private async addMidTermMemory(payload: MemoryPayload) {
        if (!this.supabase) throw new Error('Supabase client not initialized.');
        if (!payload.tableName) throw new Error('Mid-term memory requires a tableName.');
        if (!payload.data) throw new Error('Mid-term memory requires a data payload to insert.');

        // Extract raw data and inject userId for relation tracking
        const rowData = {
            ...(payload.userId ? { user_id: payload.userId } : {}),
            ...payload.data
        };

        const { error } = await this.supabase
            .from(payload.tableName)
            .insert(rowData);

        if (error) {
            throw new Error(`Supabase insert failed on table '${payload.tableName}': ${error.message}`);
        }
    }

    private async getMidTermMemory(userId: string, tables: string[]): Promise<any[]> {
        if (!this.supabase || !userId) return [];

        const midTermData: any[] = [];

        // As a generic strategy, pull any related context assigned to this user from requested tables
        for (const table of tables) {
            const { data, error } = await this.supabase
                .from(table)
                .select('*')
                .eq('user_id', userId);

            if (!error && data) {
                midTermData.push({ table, records: data });
            } else if (error) {
                console.warn(`[MemoryManager] Failed retrieving from Supabase table '${table}':`, error.message);
            }
        }

        return midTermData;
    }

    // ======================================
    // TIER 3: LONG-TERM MEMORY (Pinecone)
    // ======================================

    private async addLongTermMemory(payload: MemoryPayload) {
        if (!this.pinecone) throw new Error('Pinecone client not initialized.');
        if (!payload.textToEmbed) throw new Error('Long-term memory requires textToEmbed.');

        // 1. Generate embedding using OpenAI
        const embeddingRes = await this.openai.embeddings.create({
            model: this.EMBEDDING_MODEL,
            input: payload.textToEmbed,
            encoding_format: 'float',
            dimensions: 1024
        });

        const vector = embeddingRes.data[0].embedding;
        const indexName = process.env.PINECONE_INDEX || 'echoclaw-memory';
        const index = this.pinecone.index(indexName);

        // 2. Generate vector ID (could use UUID, but simplifying here for context)
        const vectorId = `mem-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // 3. Upsert to Pinecone (including the raw text back in the payload so it's readable)
        await index.upsert({
            records: [
                {
                    id: vectorId,
                    values: vector,
                    metadata: {
                        ...payload.metadata,
                        textToEmbed: payload.textToEmbed,
                        user_id: payload.userId || '',
                        session_id: payload.sessionId || ''
                    }
                }
            ]
        });
    }

    private async getLongTermMemory(query: string, userId?: string): Promise<any[]> {
        if (!this.pinecone) return [];

        // 1. Generate embedding for user query
        const embeddingRes = await this.openai.embeddings.create({
            model: this.EMBEDDING_MODEL,
            input: query,
            encoding_format: 'float',
            dimensions: 1024
        });

        const vector = embeddingRes.data[0].embedding;
        const indexName = process.env.PINECONE_INDEX || 'echoclaw-memory';
        const index = this.pinecone.index(indexName);

        // 2. Query Pinecone, filtering by user if necessary
        const searchRes = await index.query({
            vector,
            topK: 5,
            includeMetadata: true,
            filter: userId ? { user_id: { $eq: userId } } : undefined
        });

        return searchRes.matches.map(match => ({
            id: match.id,
            score: match.score,
            metadata: match.metadata
        }));
    }
}
