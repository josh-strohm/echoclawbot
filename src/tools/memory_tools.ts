import { globalToolRegistry } from './registry';
import { searchEngine, markdownStore, memoryFlush, memoryWatcher, SearchOptions } from '../memory/file_first';

globalToolRegistry.register({
    name: 'memory_search',
    description: 'Performs a hybrid search (vector + keyword) across all Markdown memory files. Returns relevant snippets with scores. Use this to recall information from past conversations or stored facts.',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'The search query to find relevant memories.' },
            matchType: { type: 'string', enum: ['keyword', 'vector', 'hybrid'], description: 'Search method: keyword (BM25), vector (semantic), or hybrid (combined). Default: hybrid.' },
            limit: { type: 'number', description: 'Maximum number of results to return.', default: 5 }
        },
        required: ['query']
    },
    execute: async (args: { query: string; matchType?: 'keyword' | 'vector' | 'hybrid'; limit?: number }) => {
        try {
            const options: SearchOptions = {
                matchType: args.matchType || 'hybrid',
                limit: args.limit || 5
            };
            const results = await searchEngine.search(args.query, options);

            return {
                status: 'success',
                query: args.query,
                matchType: options.matchType,
                count: results.length,
                results: results.map(r => ({
                    file: r.file,
                    snippet: r.chunk.substring(0, 300) + (r.chunk.length > 300 ? '...' : ''),
                    lineStart: r.lineStart,
                    lineEnd: r.lineEnd,
                    score: r.score.toFixed(3),
                    matchType: r.matchType
                }))
            };
        } catch (error: any) {
            return { status: 'error', message: `Search failed: ${error.message}` };
        }
    }
});

globalToolRegistry.register({
    name: 'memory_get',
    description: 'Reads the contents of a specific Markdown memory file or a range of lines from it. Use this to get full context from memory files.',
    parameters: {
        type: 'object',
        properties: {
            file: { type: 'string', description: 'The filename to read (e.g., "MEMORY.md" or "2024-01-15.md").' },
            startLine: { type: 'number', description: 'Optional line number to start reading from.' },
            endLine: { type: 'number', description: 'Optional line number to stop reading at.' }
        },
        required: ['file']
    },
    execute: async (args: { file: string; startLine?: number; endLine?: number }) => {
        try {
            let content: string;

            if (args.file === 'daily') {
                content = await markdownStore.getDailyLog();
            } else if (args.file === 'durable') {
                content = await markdownStore.getDurableMemory();
            } else {
                content = await markdownStore.getFileLines(args.file, args.startLine, args.endLine);
            }

            return {
                status: 'success',
                file: args.file,
                content: content || '(empty or not found)',
                lineCount: content.split('\n').length
            };
        } catch (error: any) {
            return { status: 'error', message: `Failed to read file: ${error.message}` };
        }
    }
});

globalToolRegistry.register({
    name: 'memory_write',
    description: 'Appends new facts to the daily log or updates MEMORY.md. Use this to save important facts, user preferences, or context that should be remembered long-term.',
    parameters: {
        type: 'object',
        properties: {
            target: { type: 'string', enum: ['daily', 'durable'], description: 'Where to write: "daily" for today\'s log, "durable" for MEMORY.md' },
            content: { type: 'string', description: 'The content to write.' },
            importance: { type: 'string', enum: ['critical', 'high', 'medium'], description: 'Importance level for memory flush tracking.', default: 'medium' }
        },
        required: ['target', 'content']
    },
    execute: async (args: { target: 'daily' | 'durable'; content: string; importance?: 'critical' | 'high' | 'medium' }) => {
        try {
            if (args.target === 'daily') {
                await markdownStore.appendToDailyLog(args.content);
                memoryFlush.addCandidate({
                    content: args.content,
                    importance: args.importance || 'medium',
                    reason: 'Written to daily log'
                });
            } else {
                await markdownStore.appendToDurableMemory(args.content);
            }

            await memoryWatcher.fullReindex();

            return { status: 'success', message: `Content written to ${args.target} memory.` };
        } catch (error: any) {
            return { status: 'error', message: `Failed to write memory: ${error.message}` };
        }
    }
});

globalToolRegistry.register({
    name: 'memory_flush',
    description: 'Triggers an immediate flush of pending memory candidates to disk. Use this before context compaction to ensure important facts are saved.',
    parameters: {
        type: 'object',
        properties: {}
    },
    execute: async () => {
        try {
            await memoryFlush.flush();
            return { status: 'success', message: 'Memory flush completed.' };
        } catch (error: any) {
            return { status: 'error', message: `Flush failed: ${error.message}` };
        }
    }
});

globalToolRegistry.register({
    name: 'memory_reindex',
    description: 'Forces a full reindex of all Markdown memory files. Use this if search results seem stale or after manually editing memory files.',
    parameters: {
        type: 'object',
        properties: {}
    },
    execute: async () => {
        try {
            await memoryWatcher.fullReindex();
            return { status: 'success', message: 'Reindex completed.' };
        } catch (error: any) {
            return { status: 'error', message: `Reindex failed: ${error.message}` };
        }
    }
});

globalToolRegistry.register({
    name: 'get_system_status',
    description: 'Checks the availability and health of various backend integrations and memory systems, letting the agent be self-aware of its current architecture.',
    parameters: {
        type: 'object',
        properties: {}
    },
    execute: async () => {
        const status = {
            architecture: 'Local-First File-First OpenClaw clone',
            sqlite: 'Configured and actively used for metrics, FTS5 searching, and local vector indexing.',
            supabase: 'Not configured (Removed by User).',
            pinecone: 'Not configured (Removed by User).',
            openaiEmbeddings: process.env.OPENAI_API_KEY ? 'Configured' : 'Missing OPENAI_API_KEY',
            fileFirstMemory: 'Active - Markdown + SQLite FTS5 + Vector'
        };

        return {
            status: 'success',
            diagnostics: status,
            instructions: 'You operate completely locally through SQLite and markdown files now. Supabase and Pinecone have been permanently removed to follow the OpenClaw philosophy.'
        };
    }
});

globalToolRegistry.register({
    name: 'list_available_tools',
    description: 'Get a list of all currently registered tools and their descriptions. Use this when the user asks what you can do or what tools you have.',
    parameters: {
        type: 'object',
        properties: {}
    },
    execute: async () => {
        const schemas = globalToolRegistry.getSchemas();
        const availableTools = schemas.map(s => ({
            name: s.function.name,
            description: s.function.description
        }));
        return { tools: availableTools };
    }
});
