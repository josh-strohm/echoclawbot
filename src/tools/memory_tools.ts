import { globalToolRegistry } from './registry';
import { MemoryManager } from '../memory/MemoryManager';

let _memoryManager: MemoryManager | null = null;
export function getMemoryManager(): MemoryManager {
    if (!_memoryManager) {
        _memoryManager = new MemoryManager();
    }
    return _memoryManager;
}

// Tool to save long-term memory
globalToolRegistry.register({
    name: 'save_semantic_memory',
    description: 'Save a fact, concept, user preference, or important context to long-term semantic memory (Pinecone). Use this when the user tells you something you should remember for future sessions.',
    parameters: {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'The text content to memorize. Make it clear and standalone.' },
            category: { type: 'string', description: 'A category for this memory (e.g., "user_preference", "fact", "project_details")' }
        },
        required: ['text']
    },
    execute: async (args: { text: string; category?: string }) => {
        try {
            await getMemoryManager().addMemory('long_term', {
                textToEmbed: args.text,
                metadata: { category: args.category || 'general' }
            });
            return { status: 'success', message: 'Memory successfully saved to long-term storage.' };
        } catch (error: any) {
            return { status: 'error', message: `Failed to save memory: ${error.message}` };
        }
    }
});

// Tool to retrieve long-term memory
globalToolRegistry.register({
    name: 'search_semantic_memory',
    description: 'Search long-term semantic memory (Pinecone) for information from past conversations or stored facts. Use this when you need varying context or when the user asks you to recall something.',
    parameters: {
        type: 'object',
        properties: {
            query: { type: 'string', description: 'The semantic query to search for.' }
        },
        required: ['query']
    },
    execute: async (args: { query: string }) => {
        try {
            // MemoryManager retrieveContext handles searching long-term memory via the semanticQuery param
            // We pass an empty string for the userId so it does not filter by user, matching the save operation which defaults to empty string.
            const context = await getMemoryManager().retrieveContext('', '', args.query, 0, []);
            return { status: 'success', matches: context.longTerm };
        } catch (error: any) {
            return { status: 'error', message: `Failed to search memory: ${error.message}` };
        }
    }
});

// Tool to check system and tool status
globalToolRegistry.register({
    name: 'get_system_status',
    description: 'Checks the availability and health of various backend integrations, like Supabase and Pinecone, to help diagnose why certain tools might fail.',
    parameters: {
        type: 'object',
        properties: {}
    },
    execute: async () => {
        const status = {
            sqlite: 'Configured and using local file.',
            supabase: process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY)
                ? 'Configured'
                : 'Missing SUPABASE_URL or Keys in environment.',
            pinecone: process.env.PINECONE_API_KEY && process.env.PINECONE_INDEX
                ? 'Configured'
                : 'Missing PINECONE_API_KEY or PINECONE_INDEX in environment.',
            openaiEmbeddings: process.env.OPENAI_API_KEY ? 'Configured' : 'Missing OPENAI_API_KEY'
        };

        return {
            status: 'success',
            diagnostics: status,
            instructions: 'If any service is "Missing...", inform the user that the related tools will not work until those environment variables are set in the .env file.'
        };
    }
});

// Tool to list all available tools to the agent explicitly
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
