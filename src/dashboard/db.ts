import Database from 'better-sqlite3';
import * as path from 'path';

export const sqlite = new Database(path.resolve(process.cwd(), 'echoclaw_short_term.db'));

// Ensure required tables exist for dashboard queries if they haven't been created yet
sqlite.exec(`
    CREATE TABLE IF NOT EXISTS core_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        content TEXT,
        importance INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        role TEXT,
        content TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT,
        summary TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT,
        title TEXT,
        description TEXT,
        status TEXT,
        progress_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cost_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT,
        model TEXT,
        tokens INTEGER,
        cost_usd REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT,
        details TEXT,
        status TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cron_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        schedule TEXT,
        description TEXT,
        status TEXT DEFAULT 'active'
    );
    CREATE TABLE IF NOT EXISTS cron_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT,
        status TEXT,
        output TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        role TEXT,
        status TEXT DEFAULT 'offline',
        model TEXT,
        total_tokens INTEGER DEFAULT 0,
        last_active DATETIME
    );
`);

export const supabase = null;

// Seed initial agents if empty
const agentCount = sqlite.prepare('SELECT COUNT(*) as c FROM agents').get() as { c: number };
if (agentCount.c === 0) {
    const defaultAgents = [
        { name: 'EchoClaw Core', role: 'Primary Assistant', status: 'online', model: 'minimax/minimax-m2.5' }
    ];
    const insertAgent = sqlite.prepare('INSERT INTO agents (name, role, status, model, last_active) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)');
    defaultAgents.forEach(a => insertAgent.run(a.name, a.role, a.status, a.model));
}

// No seed data for cron jobs - user creates them manually

// cost_log mock seeding removed so it represents real tokens spent.

export const pinecone = null;
