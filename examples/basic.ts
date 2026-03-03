import * as dotenv from 'dotenv';
dotenv.config();

import { Agent, tool } from '../src/agent/agent';
import { registerFunctionTool } from '../src/tools/registry';

// Method 1: Functional Registration (since standard TS doesn't support applying decorators to raw functions)
registerFunctionTool(
    async (args: { location: string }) => {
        console.log(`[Plugin] Fetching weather for ${args.location}...`);
        // Simulated API call
        return { temperature: 72, conditions: 'sunny' };
    },
    {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
            type: 'object',
            properties: {
                location: { type: 'string', description: 'City name' }
            },
            required: ['location']
        }
    }
);

// Method 2: Class Method Decorators (Standard TS syntax for decorators)
class Utilities {
    @tool({
        name: 'reverse_string',
        description: 'Reverses a given string',
        parameters: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'The text to reverse' }
            },
            required: ['text']
        }
    })
    static reverseString(args: { text: string }) {
        console.log(`[Plugin] Reversing string: ${args.text}`);
        return { reversed: args.text.split('').reverse().join('') };
    }
}

async function main() {
    const agent = new Agent({
        model: 'minimax/minimax-m2.5', // OpenRouter model
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        systemPrompt: "You are a helpful AI assistant. You can use tools to answer questions.",
        memoryFile: './basic-memory.json'
    });

    // Load previous memory if it exists
    await agent.loadMemory();

    console.log("=== AI Agent Framework Example ===");
    const question1 = "What is the weather in New York?";
    console.log(`\nUser: ${question1}`);
    const response1 = await agent.run(question1);
    console.log(`\nAgent: ${response1}`);

    const question2 = "Please reverse the word 'framework' and calculate 123 * 456.";
    console.log(`\nUser: ${question2}`);
    const response2 = await agent.run(question2);
    console.log(`\nAgent: ${response2}`);
}

main().catch(console.error);
