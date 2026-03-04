/**
 * agent.ts — The agentic tool loop.
 *
 * Support for multiple providers:
 *   - Anthropic (Direct)
 *   - OpenRouter (OpenAI-compatible)
 *
 * Flow:
 *   1. User sends a message
 *   2. Load relevant memories + build context
 *   3. Call the selected provider with tools
 *   4. Execute tools iteratively
 *   5. Return final response
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
    ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY,
    CLAUDE_MODEL,
    MAX_AGENT_ITERATIONS,
    PROVIDER,
} from "./config.js";
import { getToolsForAPI, getTool } from "./tools/registry.js";
import { buildMemoryContext } from "./memory/store.js";
import { synthesizeMemory } from "./memory/synthesizer.js";
import { logger } from "./logger.js";
import { loadMemoryContext, buildMemoryContextString } from "./services/memoryLoader.js";
import { processConversationBackground } from "./services/memoryProcessor.js";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const openrouter = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 60000,
    maxRetries: 3,
    defaultHeaders: {
        "HTTP-Referer": "https://github.com/joshstrohm/echoclawbot",
        "X-Title": "EchoClaw Bot",
    },
});

const BASE_SYSTEM_PROMPT = `You are EchoClaw Bot — a personal AI assistant running as a Telegram bot.

CRITICAL - TOOL AWARENESS:
- You ALWAYS have access to tools. NEVER tell the user you don't have a tool or can't do something if a tool exists that can help.
- Available tools are listed below in the "Available tools" section and also passed programmatically to this conversation.
- When a user asks for something that matches a tool's purpose (like creating a reminder, listing reminders, getting the time, using memory, etc.), you MUST use the appropriate tool.
- NEVER say "I don't have that tool" or "I can't do that" - if the tool exists, use it.
- Key tools you have access to:
  - create_reminder, list_reminders, get_reminder, update_reminder, snooze_reminder, complete_reminder, dismiss_reminder, delete_reminder, parse_reminder_time (for reminders)
  - remember, recall (for memory)
  - get_current_time (for time)
  - notion_get_page, notion_create_page, notion_update_page, notion_query_database, notion_list_databases (for Notion)
- If you're unsure what a tool does, use it anyway - errors are recoverable.

Key behaviors:
- You are helpful, concise, and direct.
- You have access to tools. Use them when they'd help answer the user's question.
- If a question can be answered from your knowledge, just answer it — don't call tools unnecessarily.
- Keep responses appropriate for Telegram — use markdown formatting sparingly (bold, italic, code blocks).
- You remember that you're running locally on the user's machine. Be mindful of this context.
- If you're unsure about something, say so honestly rather than guessing.

Memory system:
- You have persistent long-term memory via tools. Use them proactively.
- CRITICAL: When the user shares a fact, preference, or project detail, you MUST call the "remember" tool. Simply saying "I'll remember that" is NOT sufficient; you must actually invoke the tool to store it.
- Use "recall" to search your memories when you need more context about the user's past requests, preferred tech stack, or personal details.
- Proactively remember things like the user's name, job, preferences, projects, and custom rules.
- Don't announce every save — just do it naturally. If the user says "I prefer React", call \`remember\` in the same turn you acknowledge it.
- Your long-term memory is semantically indexed. Searching for "tech" will find facts about "Javascript" or "Python".
- If the context provided in "SEMANTIC MEMORIES" is insufficient, use the "recall" tool with a specific query to dig deeper.
- You are running as a Telegram bot. Keep responses clean.

Agent Teams (Advanced):
- For complex, multi-part tasks, you can use the "spawn_agent_team" tool to decompose the task into subtasks and execute them in parallel using sub-agents.
- This is useful for: research tasks requiring multiple searches, complex projects with independent components, tasks that benefit from parallel execution.
- After spawning a team, use "get_team_status" to check progress.
- If needed, use "cancel_agent_team" to stop a running team.
- Only use agent teams for genuinely complex tasks — don't overcomplicate simple requests.

File Management:
- You have access to file management tools to read, write, list, search, and organize files on the user's computer.
- All file operations are sandboxed to specific allowed directories for security.
- Use "file_get_allowed_dirs" to see which directories you can access.
- When users ask to create, modify, move, copy, or delete files, use the appropriate tool.
- For destructive operations (write, delete, move, copy), the user should confirm first unless their intent is clear from context.
- Deleting directories always requires explicit confirmation.

Email (AgentMail):
- You have your own dedicated email inbox: echoclaw.bot@agentmail.to
- Use "send_email" to send emails from your inbox — you can send emails to anyone.
- Use "list_emails" to check your inbox for new messages.
- Use "read_email" to read the full content of a specific email.
- Use "get_inbox_info" to see your inbox status.
- IMPORTANT: The user will send you periodic messages via email. You should proactively check your inbox using "list_emails" when you haven't heard from the user in a while, or when you want to see if there are new messages.
- When you check emails, always mark them as read after reading (the API handles this automatically).

Local Documents (QMD):
- You can search through the user's local documents using QMD (Query Markup Documents).
- Use "qmd_search" to find information in the user's Documents and Desktop folders.
- Use "qmd_get" to read the full content of a document.
- Use "qmd_list_collections" to see available document collections.
- This is useful for: finding meeting notes, project documentation, reference materials, or any markdown files the user has saved.
- The search supports semantic (meaning-based) and keyword modes.

Web Browsing (agent-browser):
- You can browse the internet using the browser automation tools.
- ALWAYS use these tools when the user asks you to look up something online, visit a website, or interact with a web page.
- Workflow: 
  1. Use "browser_navigate" to open a URL and get a snapshot of interactive elements
  2. The snapshot shows elements with refs like @e1, @e2, @e3 - these are clickable/fillable
  3. Use "browser_click" to click buttons/links (e.g., browser_click {ref: "@e2"})
  4. Use "browser_fill" to fill input fields (e.g., browser_fill {ref: "@e3", text: "search query"})
  5. Use "browser_get_text" to read text from elements
  6. Use "browser_screenshot" to take a visual screenshot
  7. Use "browser_scroll" to scroll up/down
  8. Use "browser_close" when done to free resources
- Examples:
  - "Search Google for X" -> browser_navigate to google.com, fill search, click results
  - "Check the weather" -> browser_navigate to weather.com
  - "Login to X" -> browser_navigate, fill credentials, click login
`;

function getDynamicToolInstructions(): string {
    const tools = getToolsForAPI();
    if (tools.length === 0) return "\n\n⚠️ No tools currently available.";

    let instructions = "\n\n📋 AVAILABLE TOOLS (YOU MUST USE THESE WHEN NEEDED):\n";
    for (const tool of tools) {
        instructions += `\n• ${tool.name}: ${tool.description}`;
    }
    instructions += "\n\nIMPORTANT: Use the tools listed above whenever the user's request matches a tool's purpose. Do NOT decline to use a tool if one is available.";
    return instructions;
}


const conversationHistory = new Map<string, any[]>();
const MAX_HISTORY_LENGTH = 50;

function getHistory(chatId: string): any[] {
    if (!conversationHistory.has(chatId)) {
        conversationHistory.set(chatId, []);
    }
    return conversationHistory.get(chatId)!;
}

function trimHistory(chatId: string): void {
    const history = getHistory(chatId);
    if (history.length > MAX_HISTORY_LENGTH) {
        conversationHistory.set(chatId, history.slice(-MAX_HISTORY_LENGTH));
    }
}

const synthesisCounters = new Map<string, number>();

function checkAndRunSynthesis(chatId: string, userMessage: string): void {
    const count = (synthesisCounters.get(chatId) || 0) + 1;
    synthesisCounters.set(chatId, count);

    if (count >= 5) {
        synthesisCounters.set(chatId, 0);
        const history = getHistory(chatId);

        const recentChunk = history.slice(-15).map(m => ({
            role: m.role || "unknown",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        }));

        logger.info("agent", "Triggering background memory synthesis", { chatId });

        synthesizeMemory(chatId, recentChunk, userMessage).catch(err => {
            logger.error("agent", "Synthesis background task failed", { error: String(err) });
        });
    }
}

export async function runAgent(chatId: string, userMessage: string): Promise<string> {
    const history = getHistory(chatId);

    const tools = getToolsForAPI();
    
    // Use new three-tier memory system with error handling
    let memoryContextString = "";
    try {
        const memoryContext = await loadMemoryContext(chatId);
        memoryContextString = buildMemoryContextString(memoryContext);
    } catch (memErr) {
        logger.error("agent", "Failed to load memory context", { error: String(memErr) });
        // Continue without memory context
    }
    
    const systemPrompt = BASE_SYSTEM_PROMPT + getDynamicToolInstructions() + memoryContextString;

    logger.info("agent", `Using provider: ${PROVIDER}`, { model: CLAUDE_MODEL });

    history.push({ role: "user", content: userMessage });
    trimHistory(chatId);

    let response: string;

    if (PROVIDER === "anthropic") {
        response = await runAnthropicAgent(chatId, userMessage, history, tools, systemPrompt);
    } else {
        response = await runOpenRouterAgent(chatId, userMessage, history, tools, systemPrompt);
    }

    // Save messages and trigger background tasks
    try {
        processConversationBackground(chatId, userMessage, response);
    } catch (bgErr) {
        logger.error("agent", "Background processing failed", { error: String(bgErr) });
    }

    return response;
}

async function runAnthropicAgent(
    chatId: string,
    userMessage: string,
    history: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string
): Promise<string> {
    const messages: Anthropic.MessageParam[] = [...history];
    let iterations = 0;

    while (iterations < MAX_AGENT_ITERATIONS) {
        iterations++;
        logger.info("agent", `Anthropic Iter ${iterations}/${MAX_AGENT_ITERATIONS}`, { chatId });

        try {
            const response = await anthropic.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: 4096,
                system: systemPrompt,
                tools: tools.length > 0 ? tools : undefined,
                messages,
            });

            if (response.stop_reason === "tool_use") {
                messages.push({ role: "assistant", content: response.content });
                const toolResults: Anthropic.ToolResultBlockParam[] = [];

                for (const block of response.content) {
                    if (block.type === "tool_use") {
                        const result = await executeTool(block.name, block.input as any, chatId);
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: block.id,
                            content: result,
                        });
                    }
                }

                messages.push({ role: "user", content: toolResults });
                continue;
            }

            const text = response.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("\n");

            history.push({ role: "assistant", content: text });
            trimHistory(chatId);
            return text;
        } catch (err) {
            logger.error("agent", "Anthropic API error", { error: String(err) });
            return `⚠️ Anthropic Error: ${String(err)}`;
        }
    }
    return `⚠️ Safety limit hit. Reached ${MAX_AGENT_ITERATIONS} iterations without getting a response.`;
}

async function runOpenRouterAgent(
    chatId: string,
    userMessage: string,
    history: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string
): Promise<string> {
    const openAiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
        type: "function",
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema as any,
        },
    }));

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
        ...history,
    ];

    let iterations = 0;
    while (iterations < MAX_AGENT_ITERATIONS) {
        iterations++;
        logger.info("agent", `OpenRouter Iter ${iterations}/${MAX_AGENT_ITERATIONS}`, {
            chatId,
            messageCount: messages.length,
            lastRole: messages[messages.length - 1].role
        });

        try {
            const response = await openrouter.chat.completions.create({
                model: CLAUDE_MODEL,
                messages,
                tools: openAiTools.length > 0 ? openAiTools : undefined,
            });

            const message = response.choices[0].message;

            if (message.tool_calls && message.tool_calls.length > 0) {
                messages.push(message);

                for (const toolCall of message.tool_calls) {
                    let args;
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                    } catch (parseErr) {
                        logger.error("agent", `Failed to parse tool arguments for ${toolCall.function.name}`, {
                            arguments: toolCall.function.arguments,
                            error: String(parseErr)
                        });
                        const result = `Error: Invalid JSON in tool arguments: ${toolCall.function.arguments}`;
                        messages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: result,
                        } as any);
                        continue;
                    }

                    const result = await executeTool(toolCall.function.name, args, chatId);

                    messages.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        content: result,
                    } as any);
                }
                continue;
            }

            const text = message.content || "(No response)";
            history.push({ role: "assistant", content: text });
            trimHistory(chatId);
            return text;
        } catch (err: any) {
            logger.error("agent", "OpenRouter API error", {
                error: err.message,
                stack: err.stack,
                status: err.status,
                data: err.data
            });
            return `⚠️ OpenRouter Error: ${err.message}${err.status ? ` (Status ${err.status})` : ""}`;
        }
    }
    return `⚠️ Safety limit hit. Reached ${MAX_AGENT_ITERATIONS} iterations without getting a response.`;
}

async function executeTool(name: string, input: any, chatId: string): Promise<string> {
    logger.info("agent", `Tool call: ${name}`, { input });
    const tool = getTool(name);
    if (!tool) return `Error: Unknown tool "${name}"`;

    try {
        const inputWithContext = { ...input, _chatId: chatId };
        const result = await tool.execute(inputWithContext);
        logger.info("agent", `Tool result for ${name}`, { length: result.length });
        return result;
    } catch (err) {
        logger.error("agent", `Tool error: ${name}`, { error: String(err) });
        return `Error: ${String(err)}`;
    }
}
