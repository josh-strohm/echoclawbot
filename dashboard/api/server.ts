import express from "express";
import cors from "cors";
import os from "os";
import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, "../../.env");
dotenv.config({ path: ENV_PATH });

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.resolve(__dirname, "../../echoclawbot.db");
const LOG_PATH = path.resolve(__dirname, "../../bot.log");
let db: Database.Database;

try {
    db = new Database(DB_PATH);
} catch (error) {
    console.error("Could not load DB", error);
}

// System endpoints
app.get("/api/system/health", (req, res) => {
    const memoryUsage = process.memoryUsage();
    res.json({
        cpu: os.cpus()[0].model,
        cores: os.cpus().length,
        freeMem: os.freemem(),
        totalMem: os.totalmem(),
        uptime: os.uptime(),
        platform: os.platform(),
        processMemory: memoryUsage,
    });
});

// Logs endpoint
app.get("/api/logs", (req, res) => {
    try {
        if (!fs.existsSync(LOG_PATH)) {
            return res.json({ logs: [] });
        }
        // Read tail of the file safely
        const content = fs.readFileSync(LOG_PATH, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        const tail = lines.slice(-100); // last 100 lines
        res.json({ logs: tail });
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

// Database endpoints
app.get("/api/db/messages", (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not loaded" });
    const { chatId } = req.query;
    try {
        let rows;
        if (chatId) {
            rows = db.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC").all(chatId);
        } else {
            rows = db.prepare("SELECT * FROM messages ORDER BY id DESC LIMIT 100").all();
        }
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.post("/api/chat", async (req, res) => {
    const { message, chatId = "dashboard_user" } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required" });

    console.log("[API] Chat request received:", { message: message.substring(0, 50), chatId });

    // Set timeout for the entire request - 45 seconds
    const timeoutMs = 45000;
    const timeout = setTimeout(() => {
        console.error("[API] Request timed out");
        if (!res.headersSent) {
            res.status(504).json({ error: "Request timed out after 45 seconds" });
        }
    }, timeoutMs);

    try {
        // Ensure tools are registered
        console.log("[API] Loading tools...");
        await import("../../src/tools/index.js");
        console.log("[API] Tools loaded");

        // Ensure core database is initialized for the agent
        console.log("[API] Initializing database...");
        const { initDatabase } = await import("../../src/memory/db.js");
        try {
            initDatabase();
            console.log("[API] Database initialized");
        } catch (dbErr) {
            console.log("[API] Database init error (might be ok):", dbErr);
        }

        console.log("[API] Running agent...");
        const { runAgent } = await import("../../src/agent.js");
        
        let response;
        try {
            response = await runAgent(chatId, message);
            console.log("[API] Agent completed, response length:", response?.length);
        } catch (agentErr) {
            console.error("[API] Agent error:", agentErr);
            response = "Sorry, I encountered an error: " + String(agentErr);
        }

        clearTimeout(timeout);
        res.json({ response });
    } catch (e: any) {
        clearTimeout(timeout);
        console.error("[API] Chat error:", e);
        console.error("[API] Stack:", e?.stack);
        
        if (!res.headersSent) {
            res.status(500).json({ error: String(e), stack: e?.stack });
        }
    }
});

app.get("/api/db/memories", (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not loaded" });
    try {
        const rows = db.prepare("SELECT * FROM memories ORDER BY importance DESC LIMIT 50").all();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.get("/api/db/reminders", (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not loaded" });
    try {
        const rows = db.prepare("SELECT * FROM reminders ORDER BY due_at ASC").all();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.post("/api/db/reminders", (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not loaded" });
    const { title, body, due_at } = req.body;
    if (!title || !due_at) {
        return res.status(400).json({ error: "title and due_at are required" });
    }
    try {
        const stmt = db.prepare("INSERT INTO reminders (chat_id, title, body, due_at, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'))");
        const info = stmt.run("dashboard", title, body || "", due_at);
        res.json({ id: info.lastInsertRowid });
    } catch (e) {
        console.error("Error creating reminder:", e);
        res.status(500).json({ error: String(e) });
    }
});

app.get("/api/db/core_memory", (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not loaded" });
    try {
        const rows = db.prepare("SELECT * FROM core_memory ORDER BY id DESC").all();
        res.json(rows);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.get("/api/settings", (req, res) => {
    res.json({
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ? "********************************" : "",
        openAIApiKey: process.env.OPENAI_API_KEY ? "********************************" : "",
        openRouterApiKey: process.env.OPENROUTER_API_KEY ? "********************************" : "",
        googleApiKey: process.env.GOOGLE_API_KEY ? "********************************" : "",
        provider: process.env.PROVIDER || 'anthropic',
        model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
        maxIterations: process.env.MAX_AGENT_ITERATIONS || '10'
    });
});

app.get("/api/costs", (req, res) => {
    if (!db) return res.status(500).json({ error: "DB not loaded" });
    try {
        const row = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
        const msgCount = row.count || 0;

        const activeModel = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

        // Dynamic extrapolation from messages to represent usage.
        const avgPromptTokens = msgCount * 650;
        const avgCompletionTokens = msgCount * 180;
        const cost = (avgPromptTokens * 0.000003) + (avgCompletionTokens * 0.000015);

        res.json([{
            id: 1,
            date: new Date().toISOString().split('T')[0],
            agent: 'EchoClaw Main',
            model: activeModel,
            promptTokens: avgPromptTokens,
            completionTokens: avgCompletionTokens,
            cost: cost
        }]);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

app.get("/api/skills", async (req, res) => {
    try {
        await import("../../src/tools/index.js");
        const registry = await import("../../src/tools/registry.js");
        const skills = registry.getToolsForAPI();
        res.json(skills);
    } catch (e) {
        console.error("error loading skills", e);
        res.status(500).json({ error: String(e) });
    }
});

app.get("/api/files", (req, res) => {
    try {
        const fileBase = process.env.FILE_BASE_DIR || '';
        if (!fileBase || !fs.existsSync(fileBase)) {
            return res.json([]);
        }

        const files: any[] = [];

        const scanDir = (dir: string) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                // Construct standardized relative path
                let relPath = fullPath.replace(fileBase, '').replace(/\\/g, '/');
                if (!relPath.startsWith('/')) relPath = '/' + relPath;

                if (stat.isDirectory()) {
                    files.push({
                        name: item,
                        path: relPath,
                        type: 'directory',
                        size: 0,
                        modified: stat.mtime
                    });
                    scanDir(fullPath);
                } else {
                    files.push({
                        name: item,
                        path: relPath,
                        type: 'file',
                        size: stat.size,
                        modified: stat.mtime
                    });
                }
            }
        };

        scanDir(fileBase);

        res.json(files);
    } catch (e) {
        res.status(500).json({ error: String(e) });
    }
});

const PORT = 4000;
app.listen(PORT, () => {
    console.log(`Mission Control API running on http://localhost:${PORT}`);
});
