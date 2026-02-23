/**
 * memory/db.ts — SQLite database initialization and schema.
 *
 * Uses better-sqlite3 with FTS5 for full-text search.
 * Uses sqlite-vec for vector embeddings.
 * Creates the database file at ./echoclawbot.db (gitignored).
 *
 * Tables:
 *   - memories: stores facts, preferences, context
 *   - memories_fts: FTS5 virtual table for fast text search
 *   - memory_vectors: sqlite-vec virtual table for semantic search
 *   - memory_metadata: stores text and metadata for vectors
 */

import Database from "better-sqlite3";
import path from "path";
import { logger } from "../logger.js";
import * as vec from "sqlite-vec";

let db: Database.Database;

/**
 * Initialize the SQLite database and create tables if needed.
 * Call this once at startup.
 */
export function initDatabase(): Database.Database {
    const dbPath = path.resolve("echoclawbot.db");
    logger.info("db", `Opening database at ${dbPath}`);

    db = new Database(dbPath);

    // Load sqlite-vec extension
    vec.load(db);
    logger.info("db", "Loaded sqlite-vec extension");

    // Performance pragmas
    db.pragma("journal_mode = WAL");      // Write-Ahead Logging for concurrent reads
    db.pragma("synchronous = NORMAL");    // Balance between safety and speed
    db.pragma("foreign_keys = ON");

    // ── Main memories table ──────────────────────────────
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

    // ── FTS5 virtual table for full-text search ──────────
    db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      type,
      content='memories',
      content_rowid='id',
      tokenize='porter unicode61'
    );
  `);

    // ── Triggers to keep FTS in sync ─────────────────────
    // These are idempotent — SQLite will silently skip if they exist
    try {
        db.exec(`
      CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts(rowid, content, type)
        VALUES (new.id, new.content, new.type);
      END;
    `);
    } catch { /* trigger already exists */ }

    try {
        db.exec(`
      CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, type)
        VALUES('delete', old.id, old.content, old.type);
      END;
    `);
    } catch { /* trigger already exists */ }

    try {
        db.exec(`
      CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
        INSERT INTO memories_fts(memories_fts, rowid, content, type)
        VALUES('delete', old.id, old.content, old.type);
        INSERT INTO memories_fts(rowid, content, type)
        VALUES (new.id, new.content, new.type);
      END;
    `);
    } catch { /* trigger already exists */ }

    // ── Indexes ──────────────────────────────────────────
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_chat_id ON memories(chat_id);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);`);

    const count = (db.prepare("SELECT COUNT(*) as c FROM memories").get() as { c: number }).c;
    logger.info("db", `Database ready — ${count} memories stored`);

    // ── Reminders table ─────────────────────────────────────────
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

    // ── Vector memory tables ───────────────────────────────────
    // Drop and recreate for fresh start (remove this after initial migration)
    try { db.exec("DROP TABLE IF EXISTS memory_metadata"); } catch {}
    try { db.exec("DROP TABLE IF EXISTS memory_vectors"); } catch {}

    db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_vectors USING vec0(
      embedding float[1536]
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

    return db;
}

/** Get the active database instance. */
export function getDb(): Database.Database {
    if (!db) {
        throw new Error("Database not initialized. Call initDatabase() first.");
    }
    return db;
}

/** Close the database cleanly (call on shutdown). */
export function closeDatabase(): void {
    if (db) {
        db.close();
        logger.info("db", "Database closed");
    }
}
