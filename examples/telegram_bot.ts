import * as dotenv from 'dotenv';
dotenv.config();

import { Bot, InputFile } from 'grammy';
import { Agent } from '../src/agent/agent';
import { startDashboard } from '../src/dashboard/server';
import { setDashboardAgent } from '../src/dashboard/routes/chat';
import { transcribeAudio } from '../src/tools/speech_to_text';

// start local mission control dashboard
startDashboard();

// Ensure custom functions log properly via plugin tool setups if applicable
import { registerFunctionTool } from '../src/tools/registry';

// Reusing the get_weather tool for demonstration
registerFunctionTool(
    async (args: { location: string }) => {
        console.log(`[Plugin] Fetching weather for ${args.location}...`);
        return { temperature: 72, conditions: 'sunny' };
    },
    {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
            type: 'object',
            properties: {
                location: { type: 'string', description: 'City name' }
            },
            required: ['location']
        }
    }
);

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required in .env');
}

const allowedUserIdsStr = process.env.TELEGRAM_ALLOWED_USER_IDS || '';
const allowedUserIds = allowedUserIdsStr
    .split(',')
    .map(id => parseInt(id.trim(), 10))
    .filter(id => !isNaN(id));

if (allowedUserIds.length === 0) {
    console.warn("WARNING: No TELEGRAM_ALLOWED_USER_IDS specified. The bot will not respond to any users.");
} else {
    console.log(`Allowed Telegram User IDs: ${allowedUserIds.join(', ')}`);
}

const bot = new Bot(token);

// Initialize agent
const agent = new Agent({
    model: 'x-ai/grok-4.20-beta', // xAI Grok via OpenRouter
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    systemPrompt: "You are an AI assistant connected to a Telegram bot, equipped with tools. Your primary goal is to answer user questions directly, clearly, and concisely. Always strive to provide valuable and practical information. When responding, avoid sounding like a generic AI; instead, use natural, approachable language. Focus on delivering insights that are relevant and informed by the most current real-world context available to you. IMPORTANT: You must always be token aware in every response and task that you handle. Keep your output highly optimized and avoid generating unnecessarily long responses.",
    memoryFile: './telegram-memory.json'
});

// Bind agent instance to dashboard for Direct Control Chat
setDashboardAgent(agent);

// Load previous memory if it exists. Note that this memory is shared across all Telegram users in this basic implementation.
agent.loadMemory().catch(e => console.error("Failed to load memory:", e.message));

// Global error handler — prevents Grammy from crashing the process on network errors
bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`[BotError] Update ${ctx.update.update_id} failed:`, err.error);

    // Attempt to notify the user, but don't throw if that also fails
    ctx.reply("Sorry, something went wrong. Please try again.").catch((sendErr: any) => {
        console.error(`[BotError] Failed to send error reply:`, sendErr.message);
    });
});

// Middleware for authorization
bot.use(async (ctx, next) => {
    if (ctx.from && allowedUserIds.includes(ctx.from.id)) {
        await next();
    } else {
        console.log(`[Security] Unauthorized access attempt from user: ${ctx.from?.username} (ID: ${ctx.from?.id})`);
    }
});

// Handle incoming text messages
bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    console.log(`\n[Telegram] User (${ctx.from?.username || ctx.from?.id}): ${text}`);

    // Show typing status in Telegram
    await ctx.replyWithChatAction('typing');

    try {
        const response = await agent.run(text);
        console.log(`[Telegram] Agent: ${response}`);
        if (response && response.trim() !== '') {
            await ctx.reply(response).catch((e: any) => {
                console.error(`[Telegram] Failed to send reply:`, e.message);
            });
        } else {
            console.log("[Telegram] Warning: Agent returned an empty response. Suppressing reply to prevent Telegram crash.");
            await ctx.reply("System: The agent completed its thought process but returned an empty text response.").catch((e: any) => {
                console.error(`[Telegram] Failed to send empty-response notice:`, e.message);
            });
        }
    } catch (e: any) {
        console.error("Error processing message:", e);
        ctx.reply("Sorry, I encountered an error while processing your request.").catch((sendErr: any) => {
            console.error(`[Telegram] Failed to send error reply:`, sendErr.message);
        });
    }
});

// Handle incoming voice messages
bot.on('message:voice', async (ctx) => {
    console.log(`\n[Telegram] Voice message from user (${ctx.from?.username || ctx.from?.id})`);

    await ctx.replyWithChatAction('typing');

    try {
        const voice = ctx.message.voice;
        const file = await ctx.api.getFile(voice.file_id);

        if (!file.file_path) {
            await ctx.reply("Could not access voice file.");
            return;
        }

        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        const audioResponse = await fetch(fileUrl);
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

        const base64Audio = audioBuffer.toString('base64');

        console.log(`[Telegram] Transcribing voice message...`);

        const transcription = await transcribeAudio(audioBuffer, 'voice.ogg');
        const transcribedText = transcription.text;

        console.log(`[Telegram] Transcribed: ${transcribedText}`);
        await ctx.reply(`🎤 Transcribed: "${transcribedText}"`);

        await ctx.replyWithChatAction('typing');

        const response = await agent.run(transcribedText);
        console.log(`[Telegram] Agent: ${response}`);
        if (response && response.trim() !== '') {
            await ctx.reply(response);
        } else {
            console.log("[Telegram] Warning: Agent returned an empty response. Suppressing reply to prevent Telegram crash.");
            await ctx.reply("System: The agent completed its thought process but returned an empty text response.");
        }
    } catch (e: any) {
        console.error("Error processing voice message:", e);
        await ctx.reply("Sorry, I encountered an error while processing your voice message. Make sure GROQ_API_KEY is configured.");
    }
});

console.log("Starting Telegram Bot...");
bot.start({
    onStart: (botInfo) => {
        console.log(`Bot successfully initialized as @${botInfo.username}`);
        console.log("Ready to receive messages!");
    }
});

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

export async function sendTelegramMessage(chatId: number, message: string) {
    try {
        await bot.api.sendMessage(chatId, message);
        console.log(`[Telegram] Sent message to ${chatId}`);
    } catch (e: any) {
        console.error(`[Telegram] Failed to send message: ${e.message}`);
    }
}

export function getAllowedUserIds(): number[] {
    return allowedUserIds;
}

// Background Task Poller Loop
import { sqlite } from '../src/dashboard/db';
setInterval(async () => {
    try {
        const tasks = sqlite.prepare("SELECT * FROM tasks WHERE status = 'Todo' LIMIT 1").all() as any[];
        for (const task of tasks) {
            console.log(`\n[Agent Loop] Found pending task ${task.id}: ${task.title}`);
            // Mark as in progress to avoid double execution mapping
            sqlite.prepare("UPDATE tasks SET status = 'In Progress' WHERE id = ?").run(task.id);

            try {
                const prompt = `BACKGROUND TASK NOTIFICATION:\nYou have been automatically assigned a new task from the Kanban board.\nTask ID: ${task.id}\nTitle: ${task.title}\nDescription: ${task.description}\n\nPlease perform this task immediately. When you are finished, use your update_task tool to set the status to 'Done' and include detailed progress_notes documenting what you accomplished.`;
                await agent.run(prompt);
                console.log(`[Agent Loop] Successfully executed agent run for task ${task.id}`);
            } catch (e: any) {
                console.error(`[Agent Loop] Execution failed for task ${task.id}:`, e.message);
                sqlite.prepare("UPDATE tasks SET status = 'Failed', progress_notes = ? WHERE id = ?").run(e.message, task.id);
            }
        }
    } catch (e: any) {
        console.error("[Task Poller Error]", e.message);
    }
}, 20000); // Poll every 20s
