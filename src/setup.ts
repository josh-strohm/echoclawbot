import * as readline from "readline";
import * as fs from "fs";
import * as path from "path";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function isPlaceholder(value: string): boolean {
    return !value || value.startsWith("YOUR_") || value.includes("_HERE");
}

function ask(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function main() {
    console.log("\n🔑 EchoClaw Bot - API Key Setup\n");
    console.log("Press Enter to keep the current value (shown in brackets).\n");

    const envPath = path.join(process.cwd(), ".env");
    const currentEnv = fs.existsSync(envPath)
        ? parseEnvFile(fs.readFileSync(envPath, "utf-8"))
        : {};

    const required = [
        { key: "TELEGRAM_BOT_TOKEN", question: "Telegram Bot Token: ", current: currentEnv.TELEGRAM_BOT_TOKEN || "" },
        { key: "TELEGRAM_ALLOWED_USER_IDS", question: "Telegram Allowed User IDs (comma-separated): ", current: currentEnv.TELEGRAM_ALLOWED_USER_IDS || "" },
        { key: "ANTHROPIC_API_KEY", question: "Anthropic API Key: ", current: currentEnv.ANTHROPIC_API_KEY || "" },
        { key: "OPENAI_API_KEY", question: "OpenAI API Key: ", current: currentEnv.OPENAI_API_KEY || "" },
        { key: "ELEVENLABS_API_KEY", question: "ElevenLabs API Key: ", current: currentEnv.ELEVENLABS_API_KEY || "" },
        { key: "OPENROUTER_API_KEY", question: "OpenRouter API Key: ", current: currentEnv.OPENROUTER_API_KEY || "" },
    ];

    const optional = [
        { key: "NOTION_API_KEY", question: "Notion API Key (optional): ", current: currentEnv.NOTION_API_KEY || "" },
        { key: "GOOGLE_CLIENT_ID", question: "Google Client ID (optional): ", current: currentEnv.GOOGLE_CLIENT_ID || "" },
        { key: "GOOGLE_CLIENT_SECRET", question: "Google Client Secret (optional): ", current: currentEnv.GOOGLE_CLIENT_SECRET || "" },
        { key: "GOOGLE_REDIRECT_URI", question: "Google Redirect URI (optional): ", current: currentEnv.GOOGLE_REDIRECT_URI || "" },
        { key: "GOOGLE_REFRESH_TOKEN", question: "Google Refresh Token (optional): ", current: currentEnv.GOOGLE_REFRESH_TOKEN || "" },
    ];

    const envVars: Record<string, string> = {};

    for (const item of required) {
        let currentValue = isPlaceholder(item.current) ? "" : item.current;
        let answer = "";
        if (currentValue) {
            answer = await ask(`${item.question}[current: ${currentValue.substring(0, 10)}...]: `);
        } else {
            while (!answer) {
                answer = await ask(item.question);
            }
        }
        envVars[item.key] = answer || currentValue;
    }

    for (const item of optional) {
        let currentValue = isPlaceholder(item.current) ? "" : item.current;
        const answer = await ask(`${item.question}[skip]: `);
        if (answer) {
            envVars[item.key] = answer;
        } else if (currentValue) {
            envVars[item.key] = currentValue;
        }
    }

    const provider = await ask(`\nProvider (anthropic or openrouter) [${currentEnv.PROVIDER || "anthropic"}]: `);
    envVars.PROVIDER = provider || currentEnv.PROVIDER || "anthropic";

    const claudeModel = await ask(`Claude Model [${currentEnv.CLAUDE_MODEL || "minimax/minimax-m2.5"}]: `);
    envVars.CLAUDE_MODEL = claudeModel || currentEnv.CLAUDE_MODEL || "minimax/minimax-m2.5";

    const maxIters = await ask(`Max Agent Iterations [${currentEnv.MAX_AGENT_ITERATIONS || "10"}]: `);
    envVars.MAX_AGENT_ITERATIONS = maxIters || currentEnv.MAX_AGENT_ITERATIONS || "10";

    const envContent = `# ── Telegram ──────────────────────────────────────────
TELEGRAM_BOT_TOKEN=${envVars.TELEGRAM_BOT_TOKEN}
TELEGRAM_ALLOWED_USER_IDS=${envVars.TELEGRAM_ALLOWED_USER_IDS}

# ── Anthropic (Claude) — Level 1 ─────────────────────
ANTHROPIC_API_KEY=${envVars.ANTHROPIC_API_KEY}

# ── OpenAI — Level 3 (Whisper transcription) ─────────
OPENAI_API_KEY=${envVars.OPENAI_API_KEY}

# ── ElevenLabs — Level 3 (Text-to-speech) ────────────
ELEVENLABS_API_KEY=${envVars.ELEVENLABS_API_KEY}

# ── OpenRouter — Optional (multi-model routing) ──────
OPENROUTER_API_KEY=${envVars.OPENROUTER_API_KEY}

# ── Gmail ─────────────────────────────────────────────
GOOGLE_CLIENT_ID=${envVars.GOOGLE_CLIENT_ID || ""}
GOOGLE_CLIENT_SECRET=${envVars.GOOGLE_CLIENT_SECRET || ""}
GOOGLE_REDIRECT_URI=${envVars.GOOGLE_REDIRECT_URI || ""}
GOOGLE_REFRESH_TOKEN=${envVars.GOOGLE_REFRESH_TOKEN || ""}

# ── Groq — Optional (fast inference fallback) ────────
GROQ_API_KEY=${envVars.GROQ_API_KEY || ""}

# ── Model Config ─────────────────────────────────────
PROVIDER=${envVars.PROVIDER}
CLAUDE_MODEL=${envVars.CLAUDE_MODEL}
MAX_AGENT_ITERATIONS=${envVars.MAX_AGENT_ITERATIONS}

# ── Notion ───────────────────────────────────────────
NOTION_API_KEY=${envVars.NOTION_API_KEY || ""}
`;

    fs.writeFileSync(envPath, envContent);
    console.log("\n✅ .env file updated successfully!\n");

    rl.close();

    console.log("🚀 Starting EchoClaw Bot...\n");
    const { spawn } = await import("child_process");
    spawn("npx", ["tsx", "watch", "src/index.ts"], {
        stdio: "inherit",
        shell: true,
        env: process.env,
    });
}

function parseEnvFile(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
            const [key, ...rest] = trimmed.split("=");
            if (key) {
                result[key] = rest.join("=").trim();
            }
        }
    }
    return result;
}

main().catch(console.error);
