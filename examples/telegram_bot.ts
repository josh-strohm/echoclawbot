import * as dotenv from 'dotenv';
dotenv.config();

import { Bot } from 'grammy';
import { Agent } from '../src/agent/agent';

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
    model: 'minimax/minimax-m2.5', // OpenRouter model
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    systemPrompt: "You are an AI assistant connected to a Telegram bot, equipped with tools. Your primary goal is to answer user questions directly, clearly, and concisely. Always strive to provide valuable and practical information. When responding, avoid sounding like a generic AI; instead, use natural, approachable language. Focus on delivering insights that are relevant and informed by the most current real-world context available to you. IMPORTANT: You must always be token aware in every response and task that you handle. Keep your output highly optimized and avoid generating unnecessarily long responses.",
    memoryFile: './telegram-memory.json'
});

// Load previous memory if it exists. Note that this memory is shared across all Telegram users in this basic implementation.
agent.loadMemory().catch(e => console.error("Failed to load memory:", e.message));

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
        await ctx.reply(response);
    } catch (e: any) {
        console.error("Error processing message:", e);
        await ctx.reply("Sorry, I encountered an error while processing your request.");
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
