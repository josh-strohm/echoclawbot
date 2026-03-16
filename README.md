# EchoClaw Bot — AI Agent Starter Template

A fully functional AI agent framework built with Node.js and TypeScript, featuring a Telegram bot interface, web dashboard, persistent memory with semantic search, and an extensible tool system. Clone it, add your API keys, and start building.

## What's Included

- **Telegram Bot** — Conversational interface via the Grammy framework
- **Mission Control Dashboard** — Express-powered web UI at `localhost:3100` for managing settings, memory, and scheduled tasks
- **LLM Client** — OpenAI SDK pointed at OpenRouter, so you can use any model from any provider
- **Memory System** — SQLite with FTS5 full-text search + OpenAI embeddings for semantic memory recall
- **Tool System** — Extensible plugin architecture with built-in tools for web search, image analysis, speech-to-text, and memory management
- **Task Scheduler** — `node-cron` + SQLite for background jobs and reminders

## Project Structure

```

/src

/agent

agent.ts              # Main agent class & run loop

types.ts              # Core TypeScript definitions

/llm

client.ts             # LLM client (OpenAI SDK → OpenRouter)

/memory

/file_first

MemoryIndex.ts      # Semantic memory with SQLite FTS5 + embeddings

/tools

registry.ts           # Tool registry & registration utilities

web_search.ts         # Tavily-powered web search

image_analysis.ts     # Vision/image analysis via LLM

speech_to_text.ts     # Audio transcription via Groq Whisper

memory_tools.ts       # Memory read/write/search tools

/dashboard

/routes

settings.ts         # API key & config management

memory.ts           # Memory inspection & management

cron_scheduler.ts     # Background task scheduling

/utils

logger.ts             # Logging utilities

/examples

telegram_bot.ts         # Telegram bot entry point

```

## Prerequisites

- **Node.js** 18+
- **TypeScript** 5.x
- A **Telegram Bot Token** (get one from [@BotFather](https://t.me/BotFather))
- At least one LLM API key (OpenAI, OpenRouter, etc.)

## Quick Start

```

# 1. Clone the repo

git clone https://github.com/josh-strohm/echoclawbot.git

cd echoclawbot

# 2. Install dependencies

npm install

# 3. Create your environment file

cp .env.example .env

# 4. Open .env and add your API keys (see Environment Variables below)

# 5. Run in development mode

npm run dev

```

## Environment Variables

Copy `.env.example` to `.env` and fill in your keys:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key (used for embeddings and as fallback LLM) |
| `OPENROUTER_API_KEY` | Optional | OpenRouter key to access models from any provider |
| `TELEGRAM_BOT_TOKEN` | Yes | Bot token from Telegram's @BotFather |
| `ALLOWED_USER_IDS` | Yes | Comma-separated Telegram user IDs allowed to interact with the bot |
| `TAVILY_API_KEY` | Optional | Enables web search tool |
| `GROQ_API_KEY` | Optional | Enables voice message transcription via Groq Whisper |
| `PORT` | Optional | Dashboard port (defaults to `3100`) |

## Build for Production

```

npm run build

npm start

```

## Creating Custom Tools

Register new tools using the functional approach:

```

import { registerFunctionTool } from './src/tools/registry';

registerFunctionTool(

async (args: { location: string }) => {

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

```

Or use TypeScript class method decorators for grouped tools:

```

import { tool } from './src/agent/agent';


name: 'reverse_string',

description: 'Reverses
class Utilities {

@tool({ a given string',

parameters: {

type: 'object',

properties: {

text: { type: 'string', description: 'The text to reverse' }

},

required: ['text']

}

})

static reverseString(args: { text: string }) {

return { reversed: args.text.split('').reverse().join('') };

}

}

```

## Switching LLM Providers

The LLM client uses the OpenAI SDK pointed at OpenRouter by default, which means you can use any model from any provider (OpenAI, Anthropic, Google, xAI, Meta, etc.) by changing the model string in your config. No code changes needed.

## License

MIT
```
