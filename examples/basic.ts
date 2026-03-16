import * as dotenv from 'dotenv';
dotenv.config();

import { Agent, tool } from '../src/agent/agent';
import { registerFunctionTool } from '../src/tools/registry';

// Method 1: Functional Registration
registerFunctionTool(
    async (args: { location: string }) => {
        console.log(`[Plugin] Fetching weather for ${args.location}...`);
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

// Method 2: Class Method Decorators
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
    // We initialize with minimal config because the REAL "Soul" and "User" 
    // context will now be pulled from your /memory/config/ files.
    const agent = new Agent({
        model: 'gpt-4o', // Recommended for robust tool use
        apiKey: process.env.OPENAI_API_KEY,
        memoryFile: './basic-memory.json'
    });

    /** * IMPORTANT: This call now triggers the bootstrapMemory() logic.
     * It reads soul.md, user.md, and memory.md and injects them into the agent.
     */
    console.log("Reading identity from /memory/config...");
    await agent.loadMemory();

    console.log("=== EchoClaw (OpenClaw-Style) Active ===");

    // TEST 1: Identity Check
    // If set up correctly, the agent should know who it is based on soul.md
    const question1 = "Who are you, and what is your current objective?";
    console.log(`\nUser: ${question1}`);
    const response1 = await agent.run(question1);
    console.log(`\nAgent: ${response1}`);

    // TEST 2: Tool Use Check
    const question2 = "Reverse the word 'EchoClaw' and check the weather in London.";
    console.log(`\nUser: ${question2}`);
    const response2 = await agent.run(question2);
    console.log(`\nAgent: ${response2}`);
}

main().catch(console.error);