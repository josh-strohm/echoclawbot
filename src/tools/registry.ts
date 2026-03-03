import { ToolContext, ToolSchema } from '../agent/types';
import { logger } from '../utils/logger';

export class ToolRegistry {
    private tools: Map<string, ToolContext> = new Map();

    register(tool: ToolContext) {
        if (this.tools.has(tool.name)) {
            logger.warn(`Tool ${tool.name} is already registered. Overwriting.`);
        }
        this.tools.set(tool.name, tool);
    }

    getTool(name: string): ToolContext | undefined {
        return this.tools.get(name);
    }

    getSchemas(): ToolSchema[] {
        return Array.from(this.tools.values()).map((t) => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
            },
        }));
    }

    async executeTool(name: string, args: any): Promise<any> {
        const tool = this.tools.get(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }
        return tool.execute(args);
    }
}

// Global registry instance
export const globalToolRegistry = new ToolRegistry();

/**
 * Class method decorator for registering a tool.
 * Requires "experimentalDecorators: true" in tsconfig.
 */
export function tool(config: { name: string; description: string; parameters: any }) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        globalToolRegistry.register({
            name: config.name,
            description: config.description,
            parameters: config.parameters,
            execute: async (args: any) => {
                // When registered statically, we invoke the original method
                return originalMethod.call(target, args);
            },
        });
    };
}

/**
 * Functional registration for standard functions.
 */
export function registerFunctionTool(
    func: (args: any) => any,
    config: { name: string; description: string; parameters: any }
) {
    globalToolRegistry.register({
        name: config.name,
        description: config.description,
        parameters: config.parameters,
        execute: async (args: any) => func(args),
    });
}
