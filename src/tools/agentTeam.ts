import { registerTool } from "./registry.js";
import { spawnAgentTeam, getTeamStatus, cancelTeam } from "../services/agentTeamOrchestrator.js";

registerTool({
    name: "spawn_agent_team",
    description:
        "Decompose a complex task into subtasks and spawn parallel sub-agents to execute them. " +
        "Use this when the user gives you a large, complex task that would benefit from being broken down " +
        "and processed in parallel by multiple agents. " +
        "Returns a parent task ID and status. Use get_team_status to monitor progress.",
    inputSchema: {
        type: "object" as const,
        properties: {
            task_description: {
                type: "string",
                description:
                    "The complex task to decompose and execute. Be specific about what the end goal is.",
            },
        },
        required: ["task_description"],
    },
    execute: async (input) => {
        const taskDescription = input.task_description as string;
        const chatId = (input as Record<string, unknown>)._chatId as string || "0";

        try {
            const result = await spawnAgentTeam(taskDescription, chatId);
            return JSON.stringify(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return JSON.stringify({
                success: false,
                message: `Error spawning agent team: ${errorMessage}`,
            });
        }
    },
});

registerTool({
    name: "get_team_status",
    description:
        "Check the status of an agent team task. " +
        "Returns detailed status of all subtasks including pending, running, completed, failed, and cancelled counts. " +
        "If no parent_task_id is provided, returns status of the most recent team.",
    inputSchema: {
        type: "object" as const,
        properties: {
            parent_task_id: {
                type: "string",
                description: "The parent task ID from spawn_agent_team (optional, defaults to most recent)",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const parentTaskId = input.parent_task_id as string | undefined;

        try {
            const result = getTeamStatus(parentTaskId);
            return JSON.stringify(result, null, 2);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return JSON.stringify({
                success: false,
                message: `Error getting team status: ${errorMessage}`,
            });
        }
    },
});

registerTool({
    name: "cancel_agent_team",
    description:
        "Cancel a running agent team and all its pending/running subtasks. " +
        "Use this when you need to stop an agent team that is taking too long or is no longer needed. " +
        "If no parent_task_id is provided, cancels the most recent team.",
    inputSchema: {
        type: "object" as const,
        properties: {
            parent_task_id: {
                type: "string",
                description: "The parent task ID from spawn_agent_team (optional, defaults to most recent)",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const parentTaskId = input.parent_task_id as string | undefined;

        try {
            const result = cancelTeam(parentTaskId);
            return JSON.stringify(result);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return JSON.stringify({
                success: false,
                message: `Error cancelling agent team: ${errorMessage}`,
            });
        }
    },
});
