/**
 * tools/registry.ts — Tool registry for the agentic loop.
 *
 * Each tool has:
 *   - name: unique identifier (matches what Claude sees)
 *   - description: what it does (sent to Claude)
 *   - inputSchema: JSON Schema for parameters
 *   - execute: the actual function that runs
 *
 * Tools are registered here and auto-exposed to the LLM.
 */

import type Anthropic from "@anthropic-ai/sdk";

export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: Anthropic.Tool["input_schema"];
    execute: (input: Record<string, unknown>) => Promise<string>;
}

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
    if (tools.has(tool.name)) {
        throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    tools.set(tool.name, tool);
}

/** Get a tool by name (for execution). */
export function getTool(name: string): ToolDefinition | undefined {
    return tools.get(name);
}

/** Get all tools formatted for the Anthropic API. */
export function getToolsForAPI(): Anthropic.Tool[] {
    return Array.from(tools.values()).map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
    }));
}

/** Get the count of registered tools. */
export function getToolCount(): number {
    return tools.size;
}
