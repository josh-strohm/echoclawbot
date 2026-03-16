import { OpenAI } from 'openai';
import { Message, ToolSchema } from '../agent/types';
import { logCost } from '../utils/telemetry';

const RETRYABLE_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'UND_ERR_SOCKET']);
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function isRetryable(err: any): boolean {
    if (RETRYABLE_CODES.has(err?.code)) return true;
    if (err?.type === 'system' && RETRYABLE_CODES.has(err?.errno)) return true;
    // Retry on 429 (rate limit) and 5xx server errors
    const status = err?.status ?? err?.response?.status;
    if (status === 429 || (status >= 500 && status < 600)) return true;
    return false;
}

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export class LLMClient {
    private client: OpenAI;
    public model: string;
    public provider: string;

    constructor(apiKey?: string, model: string = 'gpt-4o', baseURL?: string) {
        this.client = new OpenAI({ apiKey, baseURL });
        this.model = model;
        if (baseURL?.includes('openrouter')) {
            this.provider = 'openrouter';
        } else if (baseURL?.includes('x.ai')) {
            this.provider = 'xai';
        } else {
            this.provider = 'openai';
        }
    }

    async createChatCompletion(messages: Message[], tools?: ToolSchema[]) {
        // We map our Message interface strictly to OpenAI's required format for safety
        const formattedMessages = messages.map(msg => {
            const formatted: any = { role: msg.role };

            // Handle Multi-modal content (Vision)
            if (msg.role === 'user' && (msg as any).image) {
                formatted.content = [
                    { type: 'text', text: msg.content || '' },
                    {
                        type: 'image_url',
                        image_url: { url: (msg as any).image }
                    }
                ];
            } else if (msg.content !== undefined) {
                formatted.content = msg.content;
            }

            if (msg.name) formatted.name = msg.name;
            if (msg.tool_calls) formatted.tool_calls = msg.tool_calls;
            if (msg.tool_call_id) formatted.tool_call_id = msg.tool_call_id;
            return formatted;
        });

        const hasTools = tools && tools.length > 0;

        // Build request body — never include tools or tool_choice keys at all when not used,
        // as some providers (xAI beta) reject unknown/null fields
        const requestBody: any = {
            model: this.model,
            messages: formattedMessages,
        };
        if (hasTools) {
            requestBody.tools = tools;
            requestBody.tool_choice = 'auto';
        }

        console.log(`[LLMClient] --> ${this.provider}/${this.model} (${formattedMessages.length} messages, ${hasTools ? tools!.length + ' tools' : 'no tools'})`);

        let lastError: any;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await this.client.chat.completions.create(requestBody);

                // Basic cost estimation
                const tokens = response.usage?.total_tokens || 0;
                const cost_usd = tokens * 0.000005;
                logCost(this.provider, this.model, tokens, cost_usd);

                const msg = response.choices[0].message;
                console.log(`[LLMClient] <-- ${this.provider}/${this.model} (${response.usage?.total_tokens ?? '?'} tokens, finish: ${response.choices[0].finish_reason})`);
                return msg;
            } catch (err: any) {
                lastError = err;
                if (isRetryable(err) && attempt < MAX_RETRIES) {
                    const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 500ms, 1000ms, 2000ms
                    console.warn(`[LLMClient] Attempt ${attempt} failed (${err.code ?? err.status ?? err.message}). Retrying in ${delay}ms...`);
                    await sleep(delay);
                } else {
                    throw err;
                }
            }
        }
        throw lastError;
    }
}
