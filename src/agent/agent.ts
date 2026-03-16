import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { LLMClient } from '../llm/client';
import { MemorySystem } from '../memory/memory';
import { ToolRegistry, globalToolRegistry, tool } from '../tools/registry';
import { AgentConfig, Message } from './types';
import { logger } from '../utils/logger';
import { logMessage, logActivity } from '../utils/telemetry';

// Ensure built-in tools are registered
import '../tools/builtin';
import '../tools/memory_tools';
import '../tools/file_tools';
import '../tools/web_search';
import '../tools/dashboard';
import '../tools/tasks';
import '../tools/speech_to_text';
import '../tools/image_analysis';
import '../tools/crm';

export { tool, globalToolRegistry };

export class Agent {
    private llm: LLMClient;
    private memory: MemorySystem;
    private registry: ToolRegistry;
    private config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
        this.llm = new LLMClient(config.apiKey, config.model || 'gpt-4o', config.baseURL);
        this.registry = globalToolRegistry;

        // Initialize memory with a placeholder; bootstrapMemory will overwrite the system context
        this.memory = new MemorySystem({
            systemContext: config.systemPrompt || "You are a helpful assistant.",
            filePath: config.memoryFile
        });

        // Initialize the reflection background process
        this.memory.initReflection(this.llm);
    }

    /**
     * OpenClaw-Style Bootstrap: Reads Markdown files from /memory and /memory/config
     * to build the agent's identity and long-term knowledge base.
     *
     * Startup sequence:
     *   1. soul.md    — personality, values, token discipline
     *   2. user.md    — who Josh is and how he wants to be treated
     *   3. agents.md  — operational rules, memory handling, session behavior
     *   4. memory.md  — durable long-term facts (direct chat context)
     *
     * On-demand only (NOT loaded here):
     *   heartbeat.md, tools.md, identity.md
     */
    async bootstrapMemory() {
        try {
            const memoryDir = path.join(process.cwd(), 'memory');
            const configDir = path.join(memoryDir, 'config');

            const readIfExists = async (filePath: string): Promise<string> =>
                existsSync(filePath) ? await fs.readFile(filePath, 'utf-8') : '';

            // 1. Core startup files — always loaded
            const soul    = await readIfExists(path.join(configDir, 'soul.md'));
            const user    = await readIfExists(path.join(configDir, 'user.md'));
            const agents  = await readIfExists(path.join(configDir, 'agents.md'));
            const durable = await readIfExists(path.join(memoryDir, 'memory.md'));

            // 2. Combine into a master system prompt
            const combinedSystemPrompt = `
${soul}

# USER CONTEXT
${user}

# OPERATIONAL RULES
${agents}

# STORED KNOWLEDGE (DURABLE MEMORY)
${durable}

# ADDITIONAL OPERATIONAL CONTEXT
${this.config.systemPrompt || ""}
            `.trim();

            // 3. Set this as the base context in the Memory System
            this.memory.setSystemContext(combinedSystemPrompt);
            logger.info("Successfully bootstrapped Agent memory from Markdown files.");
        } catch (error) {
            logger.error(`Failed to bootstrap memory files: ${error}`);
        }
    }

    /**
     * Loads an on-demand config file (heartbeat.md, tools.md, identity.md) and
     * injects its content as a system message so the agent has the context for
     * the current request without polluting the permanent system prompt.
     *
     * Usage: await agent.loadOnDemandFile('tools.md')
     */
    async loadOnDemandFile(filename: string): Promise<void> {
        try {
            const filePath = path.join(process.cwd(), 'memory', 'config', filename);
            if (!existsSync(filePath)) {
                logger.warn(`[OnDemand] File not found: ${filename}`);
                return;
            }
            const content = await fs.readFile(filePath, 'utf-8');
            // Inject as a one-shot system message so it's visible to the LLM
            // for this turn but doesn't permanently replace the system prompt
            this.memory.addMessage({
                role: 'system',
                content: `[ON-DEMAND CONTEXT: ${filename}]\n\n${content}`
            });
            logger.info(`[OnDemand] Loaded ${filename} into context.`);
        } catch (error: any) {
            logger.error(`[OnDemand] Failed to load ${filename}: ${error.message}`);
        }
    }

    async loadMemory() {
        await this.memory.loadFromFile();
        // Always refresh the Markdown context when loading
        await this.bootstrapMemory();
    }

    async saveMemory() {
        await this.memory.saveToFile();
    }

    getMemory() {
        return this.memory;
    }

    async run(userInput: string, maxIterations = 5, image?: string): Promise<string> {
        const chatId = `chat_${Date.now()}`;
        logMessage(chatId, 'user', userInput);

        // Load Markdown context if not already loaded
        if (this.memory.getMessages().length === 0) {
            await this.bootstrapMemory();
        }

        this.memory.addMessage({ role: 'user', content: userInput, image } as any);

        for (let i = 0; i < maxIterations; i++) {
            const messages = this.memory.getWindowedMessages(50);
            const tools = this.registry.getSchemas();

            logger.info(`Iteration ${i + 1}: Calling LLM...`);
            const response = await this.llm.createChatCompletion(messages, tools);

            if (response.content) logMessage(chatId, 'assistant', response.content);
            this.memory.addMessage(response as Message);

            if (response.tool_calls && response.tool_calls.length > 0) {
                for (const toolCall of response.tool_calls) {
                    logger.info(`LLM requested tool: ${toolCall.function.name}`);
                    let args: any;
                    try {
                        args = JSON.parse(toolCall.function.arguments);
                        const result = await this.registry.executeTool(toolCall.function.name, args);

                        logActivity(toolCall.function.name, args, 'success');
                        this.memory.addMessage({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: JSON.stringify(result)
                        });
                    } catch (error: any) {
                        logger.error(`Error executing tool ${toolCall.function.name}: ${error.message}`);
                        this.memory.addMessage({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: JSON.stringify({ error: error.message })
                        });
                    }
                }
            } else {
                // Final answer logic
                await this.saveMemory();

                // OpenClaw Post-Processing: Queue reflection for background processing
                // This is fire-and-forget — never blocks the response path
                this.memory.enqueueReflection();

                return response.content || '';
            }
        }

        return "Max iterations reached without a final answer.";
    }
}
