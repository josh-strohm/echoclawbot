import { Message } from '../../agent/types';
import { LLMClient } from '../../llm/client';
import { markdownStore } from './MarkdownStore';
import { logger } from '../../utils/logger';

interface ReflectionJob {
    messages: Message[];
    queuedAt: number;
}

export class MemoryReflectionSystem {
    private llm: LLMClient;
    private reflectionThreshold: number;
    private lastReflectedAt: number = 0;
    private queue: ReflectionJob[] = [];
    private isProcessing: boolean = false;

    constructor(llm: LLMClient, reflectionThreshold = 20) {
        this.llm = llm;
        this.reflectionThreshold = reflectionThreshold;
    }

    /**
     * Called after every agent response. If the threshold is crossed, snapshot
     * the current messages and push to the queue. Never blocks — returns immediately.
     */
    enqueue(messages: Message[]): void {
        const exchangeCount = messages.filter(
            m => m.role === 'user' || m.role === 'assistant'
        ).length;

        const nextThreshold = this.lastReflectedAt + this.reflectionThreshold;
        if (exchangeCount < nextThreshold) return;

        this.lastReflectedAt = exchangeCount;

        // Snapshot the messages so later mutations don't affect the queued job
        const snapshot = messages.map(m => ({ ...m }));
        this.queue.push({ messages: snapshot, queuedAt: Date.now() });
        logger.info(
            `[MemoryReflection] Queued reflection job (${exchangeCount} messages). ` +
            `Queue depth: ${this.queue.length}`
        );
    }

    /**
     * Drains one job from the queue per heartbeat tick.
     * Safe to call from the cron heartbeat — will no-op if already running or queue is empty.
     */
    async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;
        const job = this.queue.shift()!;

        const ageSeconds = Math.round((Date.now() - job.queuedAt) / 1000);
        logger.info(
            `[MemoryReflection] Processing queued reflection job ` +
            `(queued ${ageSeconds}s ago, ${this.queue.length} remaining).`
        );

        try {
            await this.performReflection(job.messages);
        } catch (e: any) {
            logger.error(`[MemoryReflection] Failed to process reflection job: ${e.message}`);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Returns how many jobs are waiting in the queue.
     */
    get queueDepth(): number {
        return this.queue.length;
    }

    /**
     * Core reflection logic: analyses a message snapshot and writes insights
     * to the durable memory markdown file.
     */
    private async performReflection(messages: Message[]): Promise<void> {
        try {
            const durableMemory = await markdownStore.getDurableMemory();

            const reflectionPrompt: Message[] = [
                {
                    role: 'system',
                    content: `You are the "Reflector" module of an AI agent. Your job is to analyze a conversation and produce clean, mergeable facts for the Durable Memory file.

RULES — FOLLOW EXACTLY:
1. Output ONLY a JSON object. No markdown. No explanation. No preamble.
2. The JSON must have this shape:
   { "updates": [ { "section": "🧠 Learned Facts", "action": "add"|"replace"|"remove", "old": "...", "new": "..." } ] }
3. "action: add" — new fact not present in current memory. Set "old" to "".
4. "action: replace" — existing fact needs updating. Set "old" to the exact current bullet text.
5. "action: remove" — existing fact is now stale or wrong. Set "new" to "".
6. If nothing new was learned, output exactly: { "updates": [] }
7. NEVER include dates, timestamps, reflection headers, or log blocks.
8. NEVER add ephemeral data (today's date, one-time reminders, task statuses).
9. NEVER create new sections. Only add to existing sections.
10. Facts must be stable and Josh-specific — not generic observations.

CURRENT DURABLE MEMORY:
${durableMemory || "(Empty)"}`
                },
                {
                    role: 'user',
                    content: `CONVERSATION TO ANALYZE:\n${this.formatMessagesForAnalysis(messages)}`
                }
            ];

            const response = await this.llm.createChatCompletion(reflectionPrompt);
            const raw = response.content?.trim();

            if (!raw || raw === '{ "updates": [] }') {
                logger.info('[MemoryReflection] No significant updates found.');
                return;
            }

            let updates: { section: string; action: 'add' | 'replace' | 'remove'; old: string; new: string }[] = [];
            try {
                const parsed = JSON.parse(raw);
                updates = parsed.updates || [];
            } catch {
                logger.warn('[MemoryReflection] Could not parse reflection JSON — skipping write.');
                return;
            }

            if (updates.length === 0) {
                logger.info('[MemoryReflection] No significant updates found.');
                return;
            }

            logger.info(`[MemoryReflection] Applying ${updates.length} in-place update(s) to memory.md.`);

            let content = await markdownStore.getDurableMemory();

            for (const update of updates) {
                if (update.action === 'add' && update.new) {
                    // Append the new bullet to the target section
                    const sectionHeader = `## ${update.section}`;
                    if (content.includes(sectionHeader)) {
                        // Find the end of the section (next ## or end of file) and insert before it
                        const sectionIndex = content.indexOf(sectionHeader);
                        const nextSectionMatch = content.indexOf('\n## ', sectionIndex + 1);
                        const insertAt = nextSectionMatch !== -1 ? nextSectionMatch : content.length;
                        const bullet = `\n- ${update.new.replace(/^[-*]\s*/, '')}`;
                        content = content.slice(0, insertAt) + bullet + content.slice(insertAt);
                    }
                } else if (update.action === 'replace' && update.old && update.new) {
                    const oldBullet = update.old.replace(/^[-*]\s*/, '').trim();
                    const newBullet = update.new.replace(/^[-*]\s*/, '').trim();
                    content = content.replace(
                        new RegExp(`^[-*]\\s*${oldBullet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'),
                        `- ${newBullet}`
                    );
                } else if (update.action === 'remove' && update.old) {
                    const oldBullet = update.old.replace(/^[-*]\s*/, '').trim();
                    content = content.replace(
                        new RegExp(`^[-*]\\s*${oldBullet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`, 'm'),
                        ''
                    );
                }
            }

            await markdownStore.updateDurableMemory(content);
        } catch (error: any) {
            logger.error(`[MemoryReflection] Error during reflection: ${error.message}`);
        }
    }

    private formatMessagesForAnalysis(messages: Message[]): string {
        return messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join('\n\n');
    }
}
