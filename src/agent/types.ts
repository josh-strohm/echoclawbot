export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    name?: string;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
}

export interface ToolSchema {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: any;
    };
}

export interface ToolContext {
    name: string;
    description: string;
    parameters: any;
    execute: (args: any) => Promise<any> | any;
}

export interface AgentConfig {
    model?: string;
    apiKey?: string;
    baseURL?: string;
    systemPrompt?: string;
    memoryFile?: string;
}
