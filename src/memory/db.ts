/**
 * memory/db.ts — SQLite database initialization and schema.
 *
 * Uses better-sqlite3 with FTS5 for full-text search.
 * Uses sqlite-vec for vector embeddings.
 * Uses Ollama for local embeddings.
 *
 * Creates the database file at ./echoclawbot.db (gitignored).
 *
 * Tables:
 *   - memories: stores facts, preferences, context
 *   - memories_fts: FTS5 virtual table for fast text search
 *   - memory_vectors: sqlite-vec virtual table for semantic search
 *   - memory_metadata: stores text and metadata for vectors
 *   - reminders: stores scheduled reminders
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger.js";
import * as vec from "sqlite-vec";

let db: Database.Database;

export function initDatabase(): Database.Database {
    const dbPath = path.resolve("echoclawbot.db");
    logger.info("db", `Opening database at ${dbPath}`);

    db = new Database(dbPath);

    vec.load(db);
    logger.info("db", "Loaded sqlite-vec extension");

    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");

    db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     INTEGER NOT NULL,
      type        TEXT NOT NULL DEFAULT 'fact',
      content     TEXT NOT NULL,
      source      TEXT DEFAULT 'user',
      importance  REAL DEFAULT 0.5,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
      access_count INTEGER NOT NULL DEFAULT 0
    );
  `);

    db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      type,
      content='memories',
      content_rowid='id',
      tokenize='porter unicode61'
    );
  `);

    try {
        db.exec(`
      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, type)
        VALUES (new.id, new.content, new.type);
      END;
    `);
    } catch { }

    try {
        db.exec(`
      CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, type)
        VALUES('delete', old.id, old.content, old.type);
      END;
    `);
    } catch { }

    try {
        db.exec(`
      CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, type)
        VALUES('delete', old.id, old.content, old.type);
        INSERT INTO memories_fts(rowid, content, type)
        VALUES (new.id, new.content, new.type);
      END;
    `);
    } catch { }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_chat_id ON memories(chat_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);`);

    const count = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
    logger.info("db", `Database ready — ${count} memories stored`);

    db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id     INTEGER NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT,
      due_at      TEXT NOT NULL,
      recurrence  TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      snoozed_until TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_chat_id ON reminders(chat_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);`);

    const reminderCount = (db.prepare("SELECT COUNT(*) as c FROM reminders").get() as { c: number }).c;
    logger.info("db", `Reminders table ready — ${reminderCount} reminders stored`);

    try { db.exec("DROP TABLE IF EXISTS memory_metadata"); } catch {}
    try { db.exec("DROP TABLE IF EXISTS memory_vectors"); } catch {}

    db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
      embedding float[384]
    );
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS memory_metadata (
      row_id     INTEGER PRIMARY KEY,
      fact_id    TEXT NOT NULL,
      chat_id    INTEGER NOT NULL,
      text       TEXT NOT NULL,
      importance REAL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_metadata_chat_id ON memory_metadata(chat_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_metadata_fact_id ON memory_metadata(fact_id);`);

    logger.info("db", "Vector memory tables ready");

    // ── Three-Tier Memory: Tier 1 ────────────────────────────

    // Core memory: durable facts about the user
    db.exec(`
        CREATE TABLE IF NOT EXISTS core_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            content TEXT NOT NULL,
            importance REAL DEFAULT 0.5,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_core_memory_chat ON core_memory(chat_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_core_memory_category ON core_memory(category);`);

    // Messages: full conversation history
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);`);

    // Summaries: rolling summaries of older conversations
    db.exec(`
        CREATE TABLE IF NOT EXISTS summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id TEXT NOT NULL,
            content TEXT NOT NULL,
            message_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_summaries_chat ON summaries(chat_id);`);

    logger.info("db", "Three-tier memory tables ready");

    return db;
}

export function getDb(): Database.Database {
    if (!db) {
        throw new Error("Database not initialized. Call initDatabase() first.");
    }
    return db;
}

export function closeDatabase(): void {
    if (db) {
        db.close();
        logger.info("db", "Database closed");
    }
}
