import { Message } from '../agent/types';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MemoryOptions {
    filePath?: string;
    systemContext?: string;
}

export class MemorySystem {
    private messages: Message[] = [];
    private filePath: string;

    constructor(options?: MemoryOptions) {
        this.filePath = options?.filePath || path.join(process.cwd(), 'memory.json');
        if (options?.systemContext) {
            this.messages.push({ role: 'system', content: options.systemContext });
        }
    }

    addMessage(msg: Message) {
        this.messages.push(msg);
    }

    getMessages(): Message[] {
        return this.messages;
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

    clear() {
        this.messages = [];
    }
}
