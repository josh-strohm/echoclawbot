import * as fs from 'fs';
import * as path from 'path';
import { MEMORY_DIR } from './MarkdownStore';
import { memoryIndex } from './MemoryIndex';
import { markdownStore } from './MarkdownStore';

export class MemoryWatcher {
    private watcher: fs.FSWatcher | null = null;
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private readonly DEBOUNCE_MS = 1000;
    private lastIndexedTime: Date = new Date(0);
    private isIntervalCheckRunning: boolean = false;

    start() {
        console.log('[MemoryWatcher] Starting file watcher...');
        this.watchDirectory(MEMORY_DIR);

        setInterval(() => {
            this.checkForChanges();
        }, 30000);
    }

    private watchDirectory(dir: string) {
        try {
            this.watcher = fs.watch(dir, { recursive: true }, (eventType, filename) => {
                if (filename && filename.endsWith('.md')) {
                    this.handleFileChange(filename);
                }
            });
        } catch (e) {
            console.warn('[MemoryWatcher] Failed to watch directory:', e);
        }
    }

    private handleFileChange(filename: string) {
        const existing = this.debounceTimers.get(filename);
        if (existing) {
            clearTimeout(existing);
        }

        const timer = setTimeout(() => {
            this.reindexFile(filename);
            this.debounceTimers.delete(filename);
        }, this.DEBOUNCE_MS);

        this.debounceTimers.set(filename, timer);
    }

    private async checkForChanges() {
        if (this.isIntervalCheckRunning) return;
        this.isIntervalCheckRunning = true;
        try {
            const files = await markdownStore.listMemoryFiles();
            const indexTime = this.getLastIndexedTime();

            for (const file of files) {
                const filePath = path.join(MEMORY_DIR, file);
                const stats = fs.statSync(filePath);

                if (stats.mtime > indexTime) {
                    await this.reindexFile(file);
                }
            }
        } catch (e) {
        } finally {
            this.isIntervalCheckRunning = false;
        }
    }

    private getLastIndexedTime(): Date {
        return this.lastIndexedTime;
    }

    async reindexFile(filename: string) {
        try {
            const content = await markdownStore.getFileContent(filename);
            await memoryIndex.indexFile(filename, content);
            this.lastIndexedTime = new Date();
            console.log(`[MemoryWatcher] Reindexed: ${filename}`);
        } catch (e: any) {
            console.error(`[MemoryWatcher] Failed to reindex ${filename}:`, e.message);
        }
    }

    async fullReindex() {
        console.log('[MemoryWatcher] Performing full reindex...');
        const files = await markdownStore.getAllMarkdownContent();
        await memoryIndex.reindexAll(files);
        this.lastIndexedTime = new Date();
        console.log(`[MemoryWatcher] Reindexed ${files.length} files`);
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        this.debounceTimers.forEach(t => clearTimeout(t));
        this.debounceTimers.clear();
    }
}

export const memoryWatcher = new MemoryWatcher();
