import { Message } from '../agent/types';
import * as fs from 'fs/promises';
import * as path from 'path';
import { markdownStore, memoryWatcher, memoryFlush, searchEngine, DURABLE_MEMORY_FILE } from './file_first';
import { MemoryReflectionSystem } from './file_first/MemoryReflection';
import { LLMClient } from '../llm/client';


export interface MemoryOptions {
    filePath?: string;
    systemContext?: string;
    enableFileFirst?: boolean;
}

export class MemorySystem {
    private messages: Message[] = [];
    private filePath: string;
    private enableFileFirst: boolean;
    private reflection: MemoryReflectionSystem | null = null;


    constructor(options?: MemoryOptions) {
        this.filePath = options?.filePath || path.join(process.cwd(), 'memory.json');
        this.enableFileFirst = options?.enableFileFirst !== false;

        if (options?.systemContext) {
            this.messages.push({ role: 'system', content: options.systemContext });
        }

        if (this.enableFileFirst) {
            this.initFileFirstMemory();
        }
    }

    initReflection(llm: LLMClient) {
        if (this.enableFileFirst) {
            this.reflection = new MemoryReflectionSystem(llm);
        }
    }

    /**
     * Fire-and-forget — snapshots the current messages into the reflection queue.
     * Never awaited; the response path is never blocked.
     */
    enqueueReflection(): void {
        if (this.reflection && this.messages.length > 0) {
            this.reflection.enqueue(this.messages);
        }
    }

    /**
     * Called by the heartbeat to drain one queued reflection job.
     */
    async processReflectionQueue(): Promise<void> {
        if (this.reflection) {
            await this.reflection.processQueue();
        }
    }

    get reflectionQueueDepth(): number {
        return this.reflection?.queueDepth ?? 0;
    }

    private async initFileFirstMemory() {
        try {
            await memoryWatcher.fullReindex();
            memoryWatcher.start();
            console.log('[Memory] File-first memory system initialized');
        } catch (e) {
            console.warn('[Memory] Failed to initialize file-first memory:', e);
        }
    }

    addMessage(msg: Message) {
        this.messages.push(msg);
    }

    setSystemContext(context: string) {
        const existingSystemIndex = this.messages.findIndex(m => m.role === 'system');
        if (existingSystemIndex >= 0) {
            this.messages[existingSystemIndex].content = context;
        } else {
            this.messages.unshift({ role: 'system', content: context });
        }
    }

    getMessages(): Message[] {
        return this.messages;
    }

    /**
     * Returns a windowed view of messages safe to send to the LLM.
     * Always includes the system prompt (index 0) + the last `maxHistory` messages.
     * Prevents oversized requests when conversation history grows large.
     */
    getWindowedMessages(maxHistory: number = 50): Message[] {
        const systemMessages = this.messages.filter(m => m.role === 'system');
        const nonSystemMessages = this.messages.filter(m => m.role !== 'system');
        const windowed = nonSystemMessages.slice(-maxHistory);
        return [...systemMessages, ...windowed];
    }

    async saveToFile(): Promise<void> {
        try {
            await fs.writeFile(this.filePath, JSON.stringify(this.messages, null, 2));
        } catch (e: any) {
            console.error(`Failed to save memory: ${e.message}`);
        }
    }

    async loadFromFile(): Promise<void> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            const loadedMessages = JSON.parse(data);
            if (Array.isArray(loadedMessages)) {
                this.messages = loadedMessages;
            }
        } catch (e) {
            // It's normal if the file does not exist initially
        }
    }

    async loadContextForSession(): Promise<string> {
        if (!this.enableFileFirst) return '';

        const relevantHistory: string[] = [];

        const durableMemory = await markdownStore.getDurableMemory();
        if (durableMemory) {
            relevantHistory.push(`## Durable Memory\n${durableMemory}`);
        }

        const dailyLog = await markdownStore.getDailyLog();
        if (dailyLog) {
            relevantHistory.push(`## Today's Memory Log\n${dailyLog}`);
        }

        if (relevantHistory.length > 0) {
            return relevantHistory.join('\n\n---\n\n');
        }

        return '';
    }

    async triggerMemoryFlush(): Promise<void> {
        if (!this.enableFileFirst) return;
        await memoryFlush.flush();
    }

    async getFlushPrompt(): Promise<string> {
        return memoryFlush.prepareFlushPrompt();
    }

    async searchMemory(query: string, limit = 5) {
        return searchEngine.search(query, { limit });
    }

    clear() {
        this.messages = [];
    }
}
