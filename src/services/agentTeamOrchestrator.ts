import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
    ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY,
    CLAUDE_MODEL,
    PROVIDER,
    MAX_CONCURRENT_AGENTS,
    AGENT_TASK_TIMEOUT_MS,
    MAX_TEAM_TOKENS,
} from "../config.js";
import {
    migrateAgentTasks,
    createAgentTask,
    getAgentTask,
    getSubtasks,
    updateTaskStatus,
    cancelAllTasks,
    getPendingOrRunningTasks,
    getCompletedTasks,
    getFailedTasks,
    getMostRecentTeam,
    getMostRecentSubtasks,
    AgentTask,
    SubtaskDefinition,
} from "../db/agentTasks.js";
import { getToolsForAPI, getTool } from "../tools/registry.js";
import { logger } from "../logger.js";
import { buildMemoryContext } from "../memory/store.js";

const AGENT_TEAM_TOOLS = ["spawn_agent_team", "get_team_status", "cancel_agent_team"];

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const openrouter = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 60000,
    maxRetries: 3,
});

const SUBAGENT_SYSTEM_PROMPT = `You are a focused sub-agent working on a specific subtask.

Your role:
- Complete the assigned subtask thoroughly and accurately
- Use available tools to gather information, perform actions, and produce results
- Return a clear, structured result that can be aggregated with other subtask results

Guidelines:
- Stay focused on your specific subtask
- Use tools proactively to accomplish your goal
- If you encounter errors, log them and provide a best-effort result
- Return your final result as a concise summary of what you accomplished

Output format:
Return a JSON object with:
{
  "success": true/false,
  "result": "Your detailed result or findings",
  "errors": ["any errors encountered"]
}`;

const DECOMPOSITION_PROMPT = `You are a task decomposition engine. Your job is to break down complex tasks into smaller, independent subtasks that can be executed in parallel.

Input: A raw task description from the user
Output: Valid JSON array of subtasks

Rules:
1. Break the task into 2-8 logical subtasks
2. Each subtask should be self-contained and independently executable
3. Specify dependencies using subtask TITLES (not IDs) - empty array if independent
4. Priority 1 = highest priority, 5 = lowest
5. Include a final "synthesis" subtask that depends on all work subtasks
6. Each subtask must have a clear, complete description

Output format - return ONLY valid JSON:
{
  "subtasks": [
    {
      "title": "short descriptive title",
      "description": "complete instructions for this subtask",
      "dependencies": ["title of other subtask this depends on"],
      "priority": 1-5
    }
  ]
}`;

const SYNTHESIS_PROMPT = `You are a synthesis engine. Your job is to combine results from multiple subtasks into a unified response.

Input:
- Original task description
- Results from all subtasks

Your job:
1. Review all subtask results
2. Identify key insights, patterns, and connections
3. Synthesize into a coherent, comprehensive response
4. Handle any failures gracefully - note them but don't ignore successful results

Output: A well-structured synthesis that addresses the original task`;

let totalTokensUsed = 0;

function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function getToolsForSubagent(): Anthropic.Tool[] {
    const allTools = getToolsForAPI();
    return allTools.filter((tool) => !AGENT_TEAM_TOOLS.includes(tool.name));
}

async function decomposeTask(taskDescription: string): Promise<SubtaskDefinition[]> {
    logger.info("agentTeam", "Decomposing task", { task: taskDescription.substring(0, 100) });

    const messages: Anthropic.MessageParam[] = [
        { role: "user", content: `Task: ${taskDescription}\n\nReturn the subtask decomposition as JSON only.` },
    ];

    try {
        let result: string;

        if (PROVIDER === "anthropic") {
            const response = await anthropic.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: 4096,
                system: DECOMPOSITION_PROMPT,
                messages,
            });

            const text = response.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("\n");

            result = text;
        } else {
            const openAiTools: OpenAI.Chat.ChatCompletionTool[] = [];

            const response = await openrouter.chat.completions.create({
                model: CLAUDE_MODEL,
                messages: [
                    { role: "system", content: DECOMPOSITION_PROMPT },
                    ...messages as any,
                ],
                tools: openAiTools.length > 0 ? openAiTools : undefined,
            });

            result = response.choices[0].message.content || "";
        }

        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("No valid JSON found in decomposition response");
        }

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.subtasks || !Array.isArray(parsed.subtasks)) {
            throw new Error("Invalid decomposition format");
        }

        logger.info("agentTeam", `Decomposed into ${parsed.subtasks.length} subtasks`);
        return parsed.subtasks as SubtaskDefinition[];
    } catch (error) {
        logger.error("agentTeam", "Task decomposition failed", { error: String(error) });
        throw error;
    }
}

async function runSubAgent(subtask: AgentTask, chatId: string): Promise<string> {
    logger.info("agentTeam", `Running sub-agent for: ${subtask.title}`);

    const tools = getToolsForSubagent();
    const memoryContext = await buildMemoryContext(chatId, subtask.description);
    const systemPrompt = SUBAGENT_SYSTEM_PROMPT + "\n\nSubtask: " + subtask.title + "\n\nDescription: " + subtask.description + memoryContext;

    const messages: Anthropic.MessageParam[] = [
        { role: "user", content: `Complete this subtask:\n\n${subtask.description}` },
    ];

    const maxIterations = 10;
    let iterations = 0;

    try {
        if (PROVIDER === "anthropic") {
            while (iterations < maxIterations) {
                iterations++;
                logger.info("agentTeam", `Sub-agent iteration ${iterations}/${maxIterations}`, { task: subtask.title });

                const response = await anthropic.messages.create({
                    model: CLAUDE_MODEL,
                    max_tokens: 4096,
                    system: systemPrompt,
                    tools: tools.length > 0 ? tools : undefined,
                    messages,
                });

                if (response.stop_reason === "tool_use") {
                    messages.push({ role: "assistant", content: response.content });
                    const toolResults: Anthropic.ToolResultBlockParam[] = [];

                    for (const block of response.content) {
                        if (block.type === "tool_use") {
                            const result = await executeToolForSubagent(block.name, block.input as any, chatId);
                            toolResults.push({
                                type: "tool_result",
                                tool_use_id: block.id,
                                content: result,
                            });
                        }
                    }

                    messages.push({ role: "user", content: toolResults });
                    continue;
                }

                const text = response.content
                    .filter((b): b is Anthropic.TextBlock => b.type === "text")
                    .map((b) => b.text)
                    .join("\n");

                return JSON.stringify({ success: true, result: text, errors: [] });
            }
        } else {
            const openAiTools: OpenAI.Chat.ChatCompletionTool[] = tools.map((t) => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.input_schema as any,
                },
            }));

            const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                { role: "system", content: systemPrompt },
                ...messages as any,
            ];

            while (iterations < maxIterations) {
                iterations++;
                logger.info("agentTeam", `Sub-agent iteration ${iterations}/${maxIterations}`, { task: subtask.title });

                const response = await openrouter.chat.completions.create({
                    model: CLAUDE_MODEL,
                    messages: chatMessages,
                    tools: openAiTools.length > 0 ? openAiTools : undefined,
                });

                const message = response.choices[0].message;

                if (message.tool_calls && message.tool_calls.length > 0) {
                    chatMessages.push(message);

                    for (const toolCall of message.tool_calls) {
                        const args = JSON.parse(toolCall.function.arguments);
                        const result = await executeToolForSubagent(toolCall.function.name, args, chatId);

                        chatMessages.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: result,
                        });
                    }
                    continue;
                }

                return JSON.stringify({ success: true, result: message.content || "", errors: [] });
            }
        }

        return JSON.stringify({ success: false, result: "Max iterations reached", errors: ["Safety limit hit"] });
    } catch (error) {
        logger.error("agentTeam", `Sub-agent failed for ${subtask.title}`, { error: String(error) });
        return JSON.stringify({ success: false, result: "", errors: [String(error)] });
    }
}

async function executeToolForSubagent(name: string, input: any, chatId: string): Promise<string> {
    logger.info("agentTeam", `Sub-agent tool call: ${name}`, { input });
    const tool = getTool(name);
    if (!tool) return `Error: Unknown tool "${name}"`;

    try {
        const inputWithContext = { ...input, _chatId: chatId };
        const result = await tool.execute(inputWithContext);
        return result;
    } catch (err) {
        logger.error("agentTeam", `Sub-agent tool error: ${name}`, { error: String(err) });
        return `Error: ${String(err)}`;
    }
}

async function synthesizeResults(
    originalTask: string,
    subtasks: AgentTask[]
): Promise<string> {
    logger.info("agentTeam", "Synthesizing results from subtasks");

    const subtaskResults = subtasks
        .map((t) => `Subtask: ${t.title}\nResult: ${t.result || "No result"}\nStatus: ${t.status}`)
        .join("\n\n");

    const messages: Anthropic.MessageParam[] = [
        {
            role: "user",
            content: `Original Task: ${originalTask}\n\nSubtask Results:\n${subtaskResults}\n\nPlease synthesize these results into a coherent response.`,
        },
    ];

    try {
        let result: string;

        if (PROVIDER === "anthropic") {
            const response = await anthropic.messages.create({
                model: CLAUDE_MODEL,
                max_tokens: 4096,
                system: SYNTHESIS_PROMPT,
                messages,
            });

            result = response.content
                .filter((b): b is Anthropic.TextBlock => b.type === "text")
                .map((b) => b.text)
                .join("\n");
        } else {
            const response = await openrouter.chat.completions.create({
                model: CLAUDE_MODEL,
                messages: [
                    { role: "system", content: SYNTHESIS_PROMPT },
                    ...messages as any,
                ],
            });

            result = response.choices[0].message.content || "";
        }

        return result;
    } catch (error) {
        logger.error("agentTeam", "Synthesis failed, falling back to raw results", { error: String(error) });

        const completed = subtasks.filter((t) => t.status === "completed");
        const failed = subtasks.filter((t) => t.status === "failed");

        let fallback = `## Results\n\n`;
        for (const task of completed) {
            fallback += `### ${task.title} ✓\n${task.result || "No result"}\n\n`;
        }
        if (failed.length > 0) {
            fallback += `## Failed Tasks\n`;
            for (const task of failed) {
                fallback += `- ${task.title}: ${task.result}\n`;
            }
        }

        return fallback;
    }
}

function resolveDependencies(subtasks: AgentTask[]): Map<string, string[]> {
    const titleToId = new Map<string, string>();
    const deps = new Map<string, string[]>();

    for (const task of subtasks) {
        titleToId.set(task.title, task.id);
    }

    for (const task of subtasks) {
        try {
            const depTitles = JSON.parse(task.dependencies) as string[];
            const resolved = depTitles
                .map((title) => titleToId.get(title))
                .filter((id): id is string => id !== undefined);
            deps.set(task.id, resolved);
        } catch {
            deps.set(task.id, []);
        }
    }

    return deps;
}

export async function spawnAgentTeam(taskDescription: string, chatId: string): Promise<{
    success: boolean;
    parentTaskId: string;
    message: string;
}> {
    migrateAgentTasks();
    totalTokensUsed = 0;

    const parentId = generateUUID();
    logger.info("agentTeam", "Spawning agent team", { parentId, task: taskDescription.substring(0, 50) });

    createAgentTask(parentId, null, "Main Task", taskDescription);

    try {
        const subtaskDefs = await decomposeTask(taskDescription);

        const subtaskIds: Map<string, string> = new Map();

        for (const def of subtaskDefs) {
            const subtaskId = generateUUID();
            subtaskIds.set(def.title, subtaskId);
            createAgentTask(subtaskId, parentId, def.title, def.description, def.dependencies);
        }

        const allSubtasks = getSubtasks(parentId);
        const taskMap = new Map<string, AgentTask>();
        for (const task of allSubtasks) {
            taskMap.set(task.title, task);
        }

        const dependencyMap = resolveDependencies(allSubtasks);
        const completedIds = new Set<string>();
        const failedIds = new Set<string>();

        while (true) {
            const pendingTasks = getPendingOrRunningTasks(parentId);
            if (pendingTasks.length === 0) break;

            const readyTasks: AgentTask[] = [];

            for (const task of pendingTasks) {
                const deps = dependencyMap.get(task.id) || [];
                const depsMet = deps.every((depId) => completedIds.has(depId));
                const depsFailed = deps.some((depId) => failedIds.has(depId));

                if (depsFailed) {
                    updateTaskStatus(task.id, "cancelled", "Dependency failed");
                    failedIds.add(task.id);
                } else if (depsMet && task.status === "pending") {
                    readyTasks.push(task);
                }
            }

            if (readyTasks.length === 0) {
                const stillPending = getPendingOrRunningTasks(parentId);
                if (stillPending.length === 0) break;
                await new Promise((r) => setTimeout(r, 1000));
                continue;
            }

            const toRun = readyTasks.slice(0, MAX_CONCURRENT_AGENTS);

            const promises = toRun.map(async (task) => {
                updateTaskStatus(task.id, "running");

                try {
                    const timeoutMs = AGENT_TASK_TIMEOUT_MS;
                    const result = await Promise.race([
                        runSubAgent(task, chatId),
                        new Promise<string>((_, reject) =>
                            setTimeout(() => reject(new Error("Task timeout")), timeoutMs)
                        ),
                    ]);

                    updateTaskStatus(task.id, "completed", result);
                    completedIds.add(task.id);
                    logger.info("agentTeam", `Subtask completed: ${task.title}`);
                } catch (error) {
                    const errorMsg = String(error);
                    updateTaskStatus(task.id, "failed", errorMsg);
                    failedIds.add(task.id);
                    logger.error("agentTeam", `Subtask failed: ${task.title}`, { error: errorMsg });
                }
            });

            await Promise.allSettled(promises);

            await new Promise((r) => setTimeout(r, 500));
        }

        const finalSubtasks = getSubtasks(parentId);
        const synthesisTask = finalSubtasks.find((t) => t.title.toLowerCase().includes("synthesis"));

        let finalResult: string;
        if (synthesisTask) {
            finalResult = await synthesizeResults(taskDescription, finalSubtasks);
        } else {
            finalResult = await synthesizeResults(taskDescription, finalSubtasks);
        }

        const completed = finalSubtasks.filter((t) => t.status === "completed").length;
        const failed = finalSubtasks.filter((t) => t.status === "failed").length;

        updateTaskStatus(parentId, "completed", finalResult);

        logger.info("agentTeam", `Agent team completed`, { completed, failed, parentId });

        return {
            success: true,
            parentTaskId: parentId,
            message: `Agent team completed: ${completed} succeeded, ${failed} failed.`,
        };
    } catch (error) {
        logger.error("agentTeam", "Agent team failed", { error: String(error), parentId });
        updateTaskStatus(parentId, "failed", String(error));

        return {
            success: false,
            parentTaskId: parentId,
            message: `Failed to spawn agent team: ${String(error)}`,
        };
    }
}

export function getTeamStatus(parentTaskId?: string): {
    success: boolean;
    parentTask?: AgentTask;
    subtasks: AgentTask[];
    summary: string;
} {
    migrateAgentTasks();

    let parent: AgentTask | undefined;

    if (parentTaskId) {
        parent = getAgentTask(parentTaskId);
    } else {
        parent = getMostRecentTeam();
    }

    if (!parent) {
        return {
            success: false,
            subtasks: [],
            summary: "No agent teams found",
        };
    }

    const subtasks = getSubtasks(parent.id);
    const pending = subtasks.filter((t) => t.status === "pending").length;
    const running = subtasks.filter((t) => t.status === "running").length;
    const completed = subtasks.filter((t) => t.status === "completed").length;
    const failed = subtasks.filter((t) => t.status === "failed").length;
    const cancelled = subtasks.filter((t) => t.status === "cancelled").length;

    return {
        success: true,
        parentTask: parent,
        subtasks,
        summary: `Status: ${pending} pending, ${running} running, ${completed} completed, ${failed} failed, ${cancelled} cancelled`,
    };
}

export function cancelTeam(parentTaskId?: string): {
    success: boolean;
    cancelledCount: number;
    message: string;
} {
    migrateAgentTasks();

    let targetId: string | undefined;

    if (parentTaskId) {
        targetId = parentTaskId;
    } else {
        const recent = getMostRecentTeam();
        targetId = recent?.id;
    }

    if (!targetId) {
        return {
            success: false,
            cancelledCount: 0,
            message: "No agent team found to cancel",
        };
    }

    const count = cancelAllTasks(targetId);

    logger.info("agentTeam", "Cancelled agent team", { parentId: targetId, count });

    return {
        success: true,
        cancelledCount: count,
        message: `Cancelled ${count} tasks`,
    };
}
