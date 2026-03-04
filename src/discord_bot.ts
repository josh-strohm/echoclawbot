import { Client, Events, GatewayIntentBits, Message, TextChannel } from "discord.js";
import { runAgent } from "./agent.js";
import { transcribeVoice } from "./voice.js";
import { textToSpeech } from "./tts.js";
import { logger } from "./logger.js";
import { DISCORD_BOT_TOKEN, DISCORD_ALLOWED_USER_IDS } from "./config.js";

export function createDiscordBot(): Client {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.GuildVoiceStates,
        ],
    });

    client.once(Events.ClientReady, (readyClient) => {
        logger.info("discord", `Ready! Logged in as ${readyClient.user.tag}`);
    });

    client.on(Events.MessageCreate, async (message: Message) => {
        logger.info("discord", "Message received", { 
            authorId: message.author.id, 
            content: message.content.substring(0, 50),
            channelId: message.channel.id,
            isBot: message.author.bot,
            channelType: message.channel.type
        });

        // Ignore messages from bots (including ourselves)
        if (message.author.bot) return;

        // Security check: only process messages from allowed users
        if (!DISCORD_ALLOWED_USER_IDS.has(message.author.id)) {
            // Optional: log unauthorized attempts silently
            logger.warn("discord", `Blocked message from unauthorized user (ID: ${message.author.id})`);
            return;
        }

        logger.info("discord", "Message passed security check", { authorId: message.author.id });

        const userId = message.author.id;
        const channelId = message.channel.id;

        // Try to send typing indicator (may not work in all channel types)
        try {
            if (message.channel.isTextBased() && 'sendTyping' in message.channel) {
                await (message.channel as any).sendTyping();
            }
        } catch (e) {
            logger.warn("discord", "Could not send typing indicator", { error: String(e) });
        }

        logger.info("discord", "Passed typing indicator");

        try {
            let userMessage = message.content;

            // Handle voice attachments if present
            if (message.attachments.size > 0) {
                const voiceAttachment = message.attachments.find(att =>
                    att.contentType?.startsWith('audio/ogg') ||
                    att.name.endsWith('.ogg') ||
                    att.contentType?.startsWith('audio/') ||
                    att.name.endsWith('.mp3') ||
                    att.name.endsWith('.wav')
                );

                if (voiceAttachment) {
                    logger.info("discord", "Processing voice attachment", { url: voiceAttachment.url });

                        try {
                            const transcript = await transcribeVoice(voiceAttachment.url);
                        if (transcript) {
                            await message.reply(`🎙️ **You said:**\n_"${transcript}"_`);
                            userMessage = transcript;
                        } else {
                            await message.reply("🤔 I couldn't make out what you said in that voice message. Could you try again?");
                            return;
                        }
                    } catch (e) {
                        logger.error("discord", "Transcription failed", { error: String(e) });
                        await message.reply("⚠️ Couldn't transcribe your voice message. Try typing instead?");
                        return;
                    }
                }
            }

            if (!userMessage.trim()) {
                // If the message is completely empty (e.g. just an image), nothing to process.
                return;
            }

            logger.info("discord", "Processing incoming message", {
                userId,
                channelId,
                messageLength: userMessage.length,
            });

            // Use the Discord User ID (or channel ID) as the chat context
            // Prepend "discord_" to ensure it doesn't collide with Telegram chat IDs if using the same storage
            const sessionId = `discord_${channelId}`;

            logger.info("discord", "Running agent", { sessionId });

            // Run the agent loop
            const response = await runAgent(sessionId, userMessage);

            logger.info("discord", "Agent completed", { sessionId, responseLength: response.length });

            // Handle Discord's 2000 character limit using standard chunks
            if (response.length <= 2000) {
                await message.reply(response);
            } else {
                const chunks = splitMessage(response, 2000);
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            }

            // (Optional) if Voice TTS is wanted:
            // This is complex on Discord without joining a VC. A simpler approach is to upload an audio file.
            // If the user's message was a voice note, or maybe via a specific command:
            /*
            try {
                const audioBuffer = await textToSpeech(response);
                await message.reply({
                    files: [{
                        attachment: audioBuffer,
                        name: 'reply.mp3'
                    }]
                });
            } catch (ttsErr) {
                logger.warn("discord", "TTS failed", { error: String(ttsErr) });
            }
            */

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : "";
            logger.error("discord", "Error processing message", { error: errorMsg, stack });
            await message.reply("⚠️ Something went wrong processing your request: " + errorMsg);
        }
    });

    client.on(Events.Error, (err) => {
        logger.error("discord", "Client error", { error: err.message });
    });

    return client;
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
