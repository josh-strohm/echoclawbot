import { OpenAI } from 'openai';
import { Message, ToolSchema } from '../agent/types';

export class LLMClient {
    private client: OpenAI;
    public model: string;

    constructor(apiKey?: string, model: string = 'gpt-4o', baseURL?: string) {
        this.client = new OpenAI({ apiKey, baseURL });
        this.model = model;
    }

    async createChatCompletion(messages: Message[], tools?: ToolSchema[]) {
        // We map our Message interface strictly to OpenAI's required format for safety
        const formattedMessages = messages.map(msg => {
            const formatted: any = { role: msg.role };
            if (msg.content !== undefined) formatted.content = msg.content;
            if (msg.name) formatted.name = msg.name;
            if (msg.tool_calls) formatted.tool_calls = msg.tool_calls;
            if (msg.tool_call_id) formatted.tool_call_id = msg.tool_call_id;
            return formatted;
        });

        const response = await this.client.chat.completions.create({
            model: this.model,
            messages: formattedMessages as any,
            ...(tools && tools.length > 0 ? { tools } : {}),
            tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        });

        return response.choices[0].message;
    }
}
