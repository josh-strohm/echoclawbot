# AI Agent Framework

A foundational AI agent framework built in Node.js with TypeScript that follows a tool-use agent architecture. This framework provides an extensible base for adding custom capabilities using a plugin-like tool system, robust memory management, and an LLM client capable of processing function calls.

## Core Features
1. **Agent Run Loop**: Supports executing multiple iterations of tool calling dynamically via a loop until a final answer is determined.
2. **Extensible Tools System**: Tools can be written as simple functions, or via TypeScript decorators for classes. Uses standard JSON Schema parameters compatible with OpenAI function calling.
3. **Memory Management**: Keeps a rolling history of conversations, and supports persistent long-term memory via JSON file storage.
4. **Built-In Tools**: Included simple `echo`, `get_current_time`, and `calculator` tools out of the box.

## Project Structure
```text
/src
  /agent
    agent.ts        # Main Agent class & run loop
    types.ts        # Core TypeScript definitions (Message, ToolSchema, etc.)
  /tools
    registry.ts     # Global tool registry, decorators, and registration utilities
    builtin.ts      # Built-in tool implementations
  /memory
    memory.ts       # Class managing short and long term context
  /llm
    client.ts       # Interface over the OpenAI SDK
  /utils
    logger.ts       # Basic colored logging functions
/examples
  basic.ts          # Simple usage example demonstrating agent setup and tool running
```

## Setup & Run

### Node Environment
Node.js 18+ and TypeScript 5.x are required.

```bash
# 1. Install dependencies
npm install

# 2. Add your environment variables
# Ensure you copy your OpenAI key into a `.env` file at the project root
echo "OPENAI_API_KEY=your_api_key_here" > .env

# 3. Run the development example
npm run dev
```

### Build for Production
```bash
npm run build
npm start
```

## Creating Custom Tools

TypeScript does not natively support decorating standalone functions, so we support two distinct approaches:

**Approach 1: Using Functional Registrations**
Best for standalone lightweight functions.
```typescript
import { registerFunctionTool } from './src/tools/registry';

registerFunctionTool(
  async (args: { location: string }) => {
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
```

**Approach 2: Using TypeScript Class Method Decorators**
Best for organizing groupings of complex tools.
```typescript
import { tool } from './src/agent/agent';

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
    return { reversed: args.text.split('').reverse().join('') };
  }
}
```

## Using the Agent

```typescript
import { Agent } from './src/agent/agent';

const agent = new Agent({
  model: 'gpt-4o-mini', // Set your LLM preference
  apiKey: process.env.OPENAI_API_KEY, // Default pulls from env automatically
  systemPrompt: "You are a helpful AI assistant. You can use tools to answer questions.",
  memoryFile: './memory.json' // Where to persist long-term state
});

// Load any previous persistent state
await agent.loadMemory();

// Run standard agent loops
const response = await agent.run('What is the weather in New York?');
console.log(response);
```
