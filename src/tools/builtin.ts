import { globalToolRegistry } from './registry';

// Echo Tool
globalToolRegistry.register({
    name: 'echo',
    description: 'Echoes back the input text',
    parameters: {
        type: 'object',
        properties: {
            text: { type: 'string', description: 'The text to echo' }
        },
        required: ['text']
    },
    execute: async (args: { text: string }) => {
        return { result: args.text };
    }
});

// Current Time Tool
globalToolRegistry.register({
    name: 'get_current_time',
    description: 'Get the current time',
    parameters: {
        type: 'object',
        properties: {}, // No parameters required
    },
    execute: async () => {
        return { time: new Date().toISOString() };
    }
});

// Calculator Tool
globalToolRegistry.register({
    name: 'calculator',
    description: 'Evaluates a basic mathematical expression safely',
    parameters: {
        type: 'object',
        properties: {
            expression: { type: 'string', description: 'The mathematical expression to evaluate (e.g., "2 + 2")' }
        },
        required: ['expression']
    },
    execute: async (args: { expression: string }) => {
        try {
            // Using Function is inherently risky in production, but suitable for basic example
            // In a real scenario, use a math evaluation library like mathjs
            const fn = new Function(`return ${args.expression}`);
            return { result: fn() };
        } catch (error: any) {
            return { error: `Failed to evaluate expression: ${error.message}` };
        }
    }
});
