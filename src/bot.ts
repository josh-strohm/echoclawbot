/**
 * bot.ts — Telegram bot setup (grammY).
 *
 * Security model:
 *   - Long-polling only (no webhook, no web server, no exposed ports)
 *   - User ID whitelist — messages from unknown users are silently dropped
 *   - No secrets in logs
 */

import { Bot, InputFile } from "grammy";
import { TELEGRAM_BOT_TOKEN, ALLOWED_USER_IDS } from "./config.js";
import { runAgent } from "./agent.js";
import { transcribeVoice } from "./voice.js";
import { textToSpeech } from "./tts.js";
import { logger } from "./logger.js";

export function createBot(): Bot {
    const bot = new Bot(TELEGRAM_BOT_TOKEN);

    // ── Security gate: whitelist check ─────────────────────
    bot.use(async (ctx, next) => {
        const userId = ctx.from?.id;

        if (!userId || !ALLOWED_USER_IDS.has(userId)) {
            // Silently ignore. Don't respond, don't log user details.
            logger.warn("bot", "Blocked message from unauthorized user", {
                chatId: ctx.chat?.id,
            });
            return; // drop the message
        }

        await next();
    });

    // ── /start command ─────────────────────────────────────
    bot.command("start", async (ctx) => {
        await ctx.reply(
            "🤖 *EchoClaw Bot online.*\n\n" +
            "I'm your personal AI assistant. Send me a message and I'll do my best to help.\n\n" +
            "Try: _What time is it in Tokyo?_",
            { parse_mode: "Markdown" }
        );
    });

    // ── /ping command (health check) ───────────────────────
    bot.command("ping", async (ctx) => {
        await ctx.reply("🏓 Pong! I'm alive.");
    });

    // ── Handle all text messages ───────────────────────────
    bot.on("message:text", async (ctx) => {
        const chatId = ctx.chat.id;
        const userMessage = ctx.message.text;

        logger.info("bot", "Incoming message", {
            chatId,
            messageLength: userMessage.length,
        });

        // Show "typing..." indicator
        await ctx.replyWithChatAction("typing");

        try {
            const response = await runAgent(String(chatId), userMessage);

            // Telegram has a 4096 char limit per message
            if (response.length <= 4096) {
                await ctx.reply(response, { parse_mode: "Markdown" }).catch(async () => {
                    // If Markdown parsing fails, send as plain text
                    await ctx.reply(response);
                });
            } else {
                // Split into chunks for long responses
                const chunks = splitMessage(response, 4096);
                for (const chunk of chunks) {
                    await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(async () => {
                        await ctx.reply(chunk);
                    });
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("bot", "Error processing message", { error: errorMsg });
            await ctx.reply("⚠️ Something went wrong. Please try again.");
        }
    });

    // ── Handle voice messages ─────────────────────────────
    bot.on(["message:voice", "message:audio"], async (ctx) => {
        const chatId = ctx.chat.id;
        const fileId = ctx.message.voice?.file_id || ctx.message.audio?.file_id;

        if (!fileId) {
            await ctx.reply("⚠️ Couldn't read that voice message. Try again?");
            return;
        }

        logger.info("bot", "Incoming voice message", {
            chatId,
            duration: ctx.message.voice?.duration || ctx.message.audio?.duration,
        });

        // Show "typing..." while we transcribe
        await ctx.replyWithChatAction("typing");

        try {
            // Step 1: Transcribe
            const transcript = await transcribeVoice(fileId);

            if (!transcript) {
                await ctx.reply("🤔 I couldn't make out what you said. Could you try again?");
                return;
            }

            // Step 2: Echo back what they said
            await ctx.reply(`🎙️ *You said:*\n_"${transcript}"_`, {
                parse_mode: "Markdown",
            }).catch(async () => {
                await ctx.reply(`🎙️ You said:\n"${transcript}"`);
            });

            // Step 3: Feed the transcript to the agent for a reply
            await ctx.replyWithChatAction("typing");
            const response = await runAgent(String(chatId), transcript);

            // Step 4: Generate voice reply via ElevenLabs
            await ctx.replyWithChatAction("record_voice");
            try {
                const audioBuffer = await textToSpeech(response);
                await ctx.replyWithVoice(new InputFile(audioBuffer, "reply.mp3"));
            } catch (ttsErr) {
                const ttsMsg = ttsErr instanceof Error ? ttsErr.message : String(ttsErr);
                logger.warn("bot", "TTS failed, falling back to text", { error: ttsMsg });
            }

            // Step 5: Also send the text reply (so they can read it too)
            if (response.length <= 4096) {
                await ctx.reply(response, { parse_mode: "Markdown" }).catch(async () => {
                    await ctx.reply(response);
                });
            } else {
                const chunks = splitMessage(response, 4096);
                for (const chunk of chunks) {
                    await ctx.reply(chunk, { parse_mode: "Markdown" }).catch(async () => {
                        await ctx.reply(chunk);
                    });
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error("bot", "Error processing voice message", { error: errorMsg });
            await ctx.reply("⚠️ Couldn't process your voice message. Please try again.");
        }
    });

    // ── Error handler ──────────────────────────────────────
    bot.catch((err) => {
        logger.error("bot", "Unhandled bot error", {
            error: err.message,
        });
    });

    return bot;
}

// ── Helpers ────────────────────────────────────────────────

function splitMessage(text: string, maxLength: number): string[] {
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        // Try to split at a newline
        let splitIndex = remaining.lastIndexOf("\n", maxLength);
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            // Fall back to splitting at a space
            splitIndex = remaining.lastIndexOf(" ", maxLength);
        }
        if (splitIndex === -1 || splitIndex < maxLength / 2) {
            // Hard split
            splitIndex = maxLength;
        }

        chunks.push(remaining.slice(0, splitIndex));
        remaining = remaining.slice(splitIndex).trimStart();
    }

    return chunks;
}
