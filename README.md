# 🤖 EchoClaw Bot

A lean, secure, fully-understood agentic AI assistant. Telegram + tools + skills that can be added.

**Not** a fork of anything — built from scratch so every line is understood.

## Bot Download & Install
Click the green 'code' button and download zip, or initialize the git repository on your local machine.
Extract the zip file contents to a drirectory of your choice.

## Getting Your Tokens

### Telegram Bot Token
1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Look for the Bot Token
4. Store it in a safe place, you'll  need in shortly.

### Your Telegram User ID
1. Message [@userinfobot](https://t.me/userinfobot) on Telegram
2. It will reply with your numeric user ID
3. Store it in a safe place, you'll  need in shortly.

### Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key
3. Store it in a safe place, you'll  need in shortly.

### OpenAI API Key
1. Go to https://platform.openai.com
2. Create an API key
3. Store it in a safe place, you'll  need in shortly.

### OpenRouter API Key
1. Go to https://openrouter.ai
2. Create an API key
3. Store it in a safe place, you'll  need in shortly.

### ElevenLabs API Key
1. Go to https://elevenlabs.io/api
2. Create an API key
3. Store it in a safe place, you'll  need in shortly.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run in dev mode (hot-reload)
npm run dev

# 3. Add Telegram Bot token when terminal requests it (Get from @BotFater), then do the same for your other API keys as they're requested in the terminal.
```

## Architecture

```
src/
├── index.ts          # Entry point — boots everything
├── config.ts         # Env validation, typed config
├── logger.ts         # Structured logging
├── bot.ts            # Telegram bot (grammY, long-polling)
├── agent.ts          # Agentic tool loop (Claude)
└── tools/
    ├── registry.ts   # Tool registry (auto-exposes to LLM)
    ├── index.ts      # Tool loader (imports all tools)
    └── get_current_time.ts  # Level 1 tool
```

## Security Model

- **User ID whitelist** — only your Telegram ID(s) get responses
- **No web server** — long-polling only, no exposed ports
- **Secrets in `.env` only** — never hardcoded, never logged
- **Agent loop safety limit** — max iterations prevent runaway tool calls

## Build Levels

- [x] **Level 1** — Telegram + Claude + agent loop + `get_current_time`
- [ ] **Level 2** — Persistent memory (SQLite + FTS5)
- [ ] **Level 3** — Voice (Whisper in, ElevenLabs out)
- [ ] **Level 4** — Tools + MCP bridge
- [ ] **Level 5** — Proactive heartbeat
