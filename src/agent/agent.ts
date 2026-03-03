import { LLMClient } from '../llm/client';
import { MemorySystem } from '../memory/memory';
import { ToolRegistry, globalToolRegistry, tool } from '../tools/registry';
import { AgentConfig, Message } from './types';
import { logger } from '../utils/logger';

// Ensure built-in tools are registered
import '../tools/builtin';
import '../tools/memory_tools';
import '../tools/file_tools';
import '../tools/web_search';

export { tool, globalToolRegistry };

export class Agent {
    private llm: LLMClient;
    private memory: MemorySystem;
    private registry: ToolRegistry;

    constructor(config: AgentConfig) {
        this.llm = new LLMClient(config.apiKey, config.model || 'gpt-4o', config.baseURL);
        this.memory = new MemorySystem({
            systemContext: config.systemPrompt,
            filePath: config.memoryFile
        });
        this.registry = globalToolRegistry;
    }

    async loadMemory() {
        await this.memory.loadFromFile();
    }

    async saveMemory() {
        await this.memory.saveToFile();
    }

    getMemory() {
        return this.memory;
    }

    async run(userInput: string, maxIterations = 5): Promise<string> {
        this.memory.addMessage({ role: 'user', content: userInput });

        for (let i = 0; i < maxIterations; i++) {
            const messages = this.memory.getMessages();
            const tools = this.registry.getSchemas();

            logger.info(`Iteration ${i + 1}: Calling LLM...`);
            const response = await this.llm.createChatCompletion(messages, tools);

            // Save the assistant's message to memory
            this.memory.addMessage(response as Message);

            if (response.tool_calls && response.tool_calls.length > 0) {
                for (const toolCall of response.tool_calls) {
                    logger.info(`LLM requested tool: ${toolCall.function.name} with args: ${toolCall.function.arguments}`);
                    try {
                        const args = JSON.parse(toolCall.function.arguments);
                        const result = await this.registry.executeTool(toolCall.function.name, args);

                        this.memory.addMessage({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            name: toolCall.function.name,
                            content: JSON.stringify(result)
                        });
                        logger.info(`Tool ${toolCall.function.name} result: ${JSON.stringify(result)}`);
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
                // No more tool calls, return the response content
                await this.saveMemory();
                return response.content || '';
            }
        }

        return "Max iterations reached without a final answer.";
    }
}
