import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

export const MEMORY_DIR = path.resolve(process.cwd(), 'memory');
export const DAILY_LOG_PREFIX = 'memory/';
export const DAILY_LOG_EXT = '.md';
export const DURABLE_MEMORY_FILE = 'MEMORY.md';

export class MarkdownStore {
    constructor() {
        this.ensureMemoryDir();
    }

    private async ensureMemoryDir() {
        try {
            await fs.mkdir(MEMORY_DIR, { recursive: true });
        } catch (e) {}
    }

    getDailyLogPath(date?: Date): string {
        const d = date || new Date();
        const dateStr = d.toISOString().split('T')[0];
        return path.join(MEMORY_DIR, `${dateStr}.md`);
    }

    getDurableMemoryPath(): string {
        return path.join(MEMORY_DIR, DURABLE_MEMORY_FILE);
    }

    async getDailyLog(date?: Date): Promise<string> {
        const filePath = this.getDailyLogPath(date);
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch {
            return '';
        }
    }

    async appendToDailyLog(content: string, date?: Date): Promise<void> {
        const filePath = this.getDailyLogPath(date);
        const timestamp = new Date().toISOString();
        const entry = `\n## ${timestamp}\n\n${content}\n`;

        await this.ensureMemoryDir();
        
        const exists = fsSync.existsSync(filePath);
        const header = exists ? '' : `# Daily Memory Log - ${date?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}\n\n`;
        
        await fs.appendFile(filePath, header + entry, 'utf-8');
    }

    async getDurableMemory(): Promise<string> {
        const filePath = this.getDurableMemoryPath();
        try {
            return await fs.readFile(filePath, 'utf-8');
        } catch {
            return '';
        }
    }

    async updateDurableMemory(content: string): Promise<void> {
        const filePath = this.getDurableMemoryPath();
        await this.ensureMemoryDir();
        await fs.writeFile(filePath, content, 'utf-8');
    }

    async appendToDurableMemory(content: string): Promise<void> {
        const filePath = this.getDurableMemoryPath();
        await this.ensureMemoryDir();
        
        const exists = fsSync.existsSync(filePath);
        const header = exists ? '' : `# Durable Memory\n\nThis file contains curated, long-term facts about the user, project rules, and important context.\n\n---\n\n`;
        
        await fs.appendFile(filePath, header + content + '\n\n---\n\n', 'utf-8');
    }

    async getFileContent(filePath: string): Promise<string> {
        const fullPath = path.join(MEMORY_DIR, filePath);
        try {
            return await fs.readFile(fullPath, 'utf-8');
        } catch {
            return '';
        }
    }

    async getFileLines(filePath: string, startLine?: number, endLine?: number): Promise<string> {
        const content = await this.getFileContent(filePath);
        const lines = content.split('\n');
        
        if (startLine === undefined && endLine === undefined) {
            return content;
        }
        
        const start = startLine || 1;
        const end = endLine || lines.length;
        return lines.slice(start - 1, end).join('\n');
    }

    async listMemoryFiles(): Promise<string[]> {
        await this.ensureMemoryDir();
        const entries = await fs.readdir(MEMORY_DIR, { withFileTypes: true });
        return entries
            .filter(e => e.isFile() && e.name.endsWith('.md'))
            .map(e => e.name);
    }

    async getAllMarkdownContent(): Promise<{ file: string; content: string }[]> {
        const files = await this.listMemoryFiles();
        const results: { file: string; content: string }[] = [];
        
        for (const file of files) {
            const content = await this.getFileContent(file);
            results.push({ file, content });
        }
        
        return results;
    }
}

export const markdownStore = new MarkdownStore();
