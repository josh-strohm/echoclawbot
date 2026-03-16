import { markdownStore, MEMORY_DIR } from './MarkdownStore';
import { memoryIndex } from './MemoryIndex';

export interface FlushCandidate {
    content: string;
    importance: 'critical' | 'high' | 'medium';
    reason: string;
}

export class MemoryFlush {
    private pendingFlush: FlushCandidate[] = [];
    private flushThreshold = 5;

    addCandidate(candidate: FlushCandidate) {
        this.pendingFlush.push(candidate);
        
        if (this.pendingFlush.length >= this.flushThreshold) {
            this.flush();
        }
    }

    async flush(): Promise<void> {
        if (this.pendingFlush.length === 0) return;

        const criticalAndHigh = this.pendingFlush.filter(c => c.importance === 'critical' || c.importance === 'high');
        const medium = this.pendingFlush.filter(c => c.importance === 'medium');

        for (const candidate of criticalAndHigh) {
            await this.persistToMemory(candidate);
        }

        if (criticalAndHigh.length > 0) {
            console.log(`[MemoryFlush] Flushed ${criticalAndHigh.length} important memories to disk`);
        }

        this.pendingFlush = [];
    }

    private async persistToMemory(candidate: FlushCandidate): Promise<void> {
        const content = `[${candidate.importance.toUpperCase()}] ${candidate.content}\n\nReason: ${candidate.reason}`;
        
        await markdownStore.appendToDailyLog(content);
        
        try {
            await memoryIndex.indexFile(
                markdownStore.getDailyLogPath().split(/[\\/]/).pop()!,
                await markdownStore.getDailyLog()
            );
        } catch (e) {
            console.warn('[MemoryFlush] Failed to reindex after flush:', e);
        }
    }

    async prepareFlushPrompt(): Promise<string> {
        const recentMessages = this.pendingFlush.map(c => `- ${c.content} (${c.importance})`).join('\n');
        
        return `
You are about to have your conversation context summarized/compacted. Before that happens, 
identify any important facts, user preferences, or context that should be saved to long-term memory.

IMPORTANT FACTS TO POTENTIALLY SAVE:
${recentMessages || 'No pending candidates - but still review recent conversation for important info to save.'}

Respond with a JSON array of facts to save, in this format:
[
  { "content": "fact to remember", "importance": "critical|high|medium", "reason": "why this matters" }
]

If no facts need saving, respond with: []
`;
    }

    getPendingCount(): number {
        return this.pendingFlush.length;
    }

    clear() {
        this.pendingFlush = [];
    }
}

export const memoryFlush = new MemoryFlush();
