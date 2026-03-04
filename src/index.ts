/**
 * index.ts — Entry point for EchoClaw Bot.
 *
 * Boots in order:
 *   1. Load .env
 *   2. Validate config (crashes fast if bad)
 *   3. Register all tools
 *   4. Create and start the Telegram bot (long-polling)
 *
 * No web server. No exposed ports. No HTTP endpoints.
 */
import "dotenv/config";

// Config is validated on import (will crash if env vars are missing)
import { ALLOWED_USER_IDS, CLAUDE_MODEL, DISCORD_BOT_TOKEN, DISCORD_ALLOWED_USER_IDS, MAX_AGENT_ITERATIONS } from "./config.js";

// Register all tools (side-effect imports)
import "./tools/index.js";

import { createBot } from "./bot.js";
import { createDiscordBot } from "./discord_bot.js";
import { getToolCount } from "./tools/registry.js";
import { initDatabase, closeDatabase } from "./memory/db.js";
import { GOOGLE_PUBSUB_TOPIC, GOOGLE_PUBSUB_SUBSCRIPTION } from "./config.js";
import { hasGoogleConfig } from "./lib/google.js";
import { setupGmailWatch, startNotificationListener } from "./lib/gmail_notifications.js";
import { logger } from "./logger.js";
import { startReminderNotifications, stopReminderNotifications } from "./services/reminder_notifications.js";
import { startEmailNotifications, stopEmailNotifications } from "./services/email_notifications.js";

async function main(): Promise<void> {
    // Initialize local SQLite database (includes vector storage)
    initDatabase();

    const bot = createBot();

    // Start reminder notifications
    startReminderNotifications(bot);

    // Start email polling notifications
    startEmailNotifications(bot);

    // Start Gmail notifications if configured
    if (hasGoogleConfig() && GOOGLE_PUBSUB_TOPIC && GOOGLE_PUBSUB_SUBSCRIPTION) {
        setupGmailWatch(GOOGLE_PUBSUB_TOPIC);
        // This runs in the background (no await)
        startNotificationListener(bot, GOOGLE_PUBSUB_SUBSCRIPTION).catch((err) => {
            logger.error("main", "Gmail notification listener crashed", { error: String(err) });
        });
    }

    logger.info("main", "──────────────────────────────────────");
    logger.info("main", "🤖 EchoClaw Bot starting up...");
    logger.info("main", `   Model:      ${CLAUDE_MODEL}`);
    logger.info("main", `   Max iters:  ${MAX_AGENT_ITERATIONS}`);
    logger.info("main", `   Tools:      ${getToolCount()} registered`);
    logger.info("main", `   Whitelist:  ${ALLOWED_USER_IDS.size} user(s)`);
    logger.info("main", "──────────────────────────────────────");

    let discordClient: ReturnType<typeof createDiscordBot> | null = null;

    // Start Discord bot if configured
    if (DISCORD_BOT_TOKEN && DISCORD_ALLOWED_USER_IDS.size > 0) {
        discordClient = createDiscordBot();
        await discordClient.login(DISCORD_BOT_TOKEN);
        logger.info("main", "💬 Discord bot started");
    } else {
        logger.info("main", "⚠️ Discord bot not configured (missing TOKEN or USER_IDS)");
    }

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info("main", `${signal} received — shutting down...`);
        stopReminderNotifications();
        stopEmailNotifications();
        bot.stop();
        if (discordClient) {
            discordClient.destroy();
        }
        closeDatabase();
        process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Start long-polling (no web server!)
    logger.info("main", "🚀 Bot is live — listening via long-polling...");
    await bot.start();
}

main().catch((err) => {
    logger.error("main", "Fatal startup error", {
        error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
});