/**
 * config.ts — Single source of truth for all configuration.
 *
 * Reads from process.env (loaded by dotenv in index.ts).
 * Validates at startup — crashes fast if anything is missing.
 */

function required(key: string): string {
    const value = process.env[key];
    if (!value) {
        console.error(`❌ Missing required env var: ${key}`);
        console.error(`   Copy .env.example to .env and fill in your values.`);
        process.exit(1);
    }
    return value;
}

function optional(key: string, fallback: string): string {
    return process.env[key] || fallback;
}

// ── Telegram ──────────────────────────────────────────────
export const TELEGRAM_BOT_TOKEN = required("TELEGRAM_BOT_TOKEN");

export const ALLOWED_USER_IDS: Set<number> = new Set(
    required("TELEGRAM_ALLOWED_USER_IDS")
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id))
);

if (ALLOWED_USER_IDS.size === 0) {
    console.error("❌ TELEGRAM_ALLOWED_USER_IDS must contain at least one valid numeric ID.");
    process.exit(1);
}

// ── Anthropic ─────────────────────────────────────────────
export const ANTHROPIC_API_KEY = required("ANTHROPIC_API_KEY");
export const CLAUDE_MODEL = optional("CLAUDE_MODEL", "claude-sonnet-4-20250514");

// ── OpenAI (Whisper) ──────────────────────────────────────
export const OPENAI_API_KEY = required("OPENAI_API_KEY");

// ── ElevenLabs (TTS) ──────────────────────────────────────
export const ELEVENLABS_API_KEY = required("ELEVENLABS_API_KEY");
// Default voice: "Rachel" — change via env or pick from https://api.elevenlabs.io/v1/voices
export const ELEVENLABS_VOICE_ID = optional("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM");

// ── OpenRouter ────────────────────────────────────────────
export const OPENROUTER_API_KEY = required("OPENROUTER_API_KEY");

// ── Gmail ─────────────────────────────────────────────────
export const GOOGLE_CLIENT_ID = optional("GOOGLE_CLIENT_ID", "");
export const GOOGLE_CLIENT_SECRET = optional("GOOGLE_CLIENT_SECRET", "");
export const GOOGLE_REDIRECT_URI = optional("GOOGLE_REDIRECT_URI", "");
export const GOOGLE_REFRESH_TOKEN = optional("GOOGLE_REFRESH_TOKEN", "");

// Format: projects/[PROJECT_ID]/topics/[TOPIC_NAME]
export const GOOGLE_PUBSUB_TOPIC = optional("GOOGLE_PUBSUB_TOPIC", "");
// Format: projects/[PROJECT_ID]/subscriptions/[SUB_NAME]
export const GOOGLE_PUBSUB_SUBSCRIPTION = optional("GOOGLE_PUBSUB_SUBSCRIPTION", "");

// ── Agent Loop ────────────────────────────────────────────
export const PROVIDER = optional("PROVIDER", "anthropic") as "anthropic" | "openrouter";

export const MAX_AGENT_ITERATIONS = parseInt(
    optional("MAX_AGENT_ITERATIONS", "10"),
    10
);


