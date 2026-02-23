/**
 * tools/reminders.ts — Reminder tools for the agentic loop.
 *
 * Tools for creating, listing, editing, snoozing, completing, dismissing, and deleting reminders.
 * The LLM parses natural language and maps to these tool calls.
 */

import { registerTool } from "./registry.js";
import {
    createReminder,
    getReminderById,
    getRemindersByChatId,
    updateReminder,
    snoozeReminder,
    updateReminderStatus,
    deleteReminder,
    formatReminderForDisplay,
    Reminder,
} from "../db/reminders.js";
import { logger } from "../logger.js";

function parseRelativeTime(input: string): Date {
    const now = new Date();
    const lower = input.toLowerCase();

    if (lower.includes("tomorrow")) {
        now.setDate(now.getDate() + 1);
    }

    const timeMatch = input.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
        const hours = parseInt(timeMatch[1], 10);
        const minutes = parseInt(timeMatch[2], 10);
        now.setHours(hours, minutes, 0, 0);
    } else if (lower.includes("am") || lower.includes("pm")) {
        const ampmMatch = input.match(/(\d{1,2})\s*(am|pm)/i);
        if (ampmMatch) {
            let hours = parseInt(ampmMatch[1], 10);
            if (ampmMatch[2].toLowerCase() === "pm" && hours !== 12) hours += 12;
            if (ampmMatch[2].toLowerCase() === "am" && hours === 12) hours = 0;
            now.setHours(hours, 0, 0, 0);
        }
    }

    if (lower.includes("tomorrow") && !timeMatch && !lower.includes("am") && !lower.includes("pm")) {
        now.setHours(9, 0, 0, 0);
    }

    return now;
}

function parseDurationToMs(duration: string): number {
    const lower = duration.toLowerCase();
    const numMatch = lower.match(/(\d+)/);
    if (!numMatch) return 60 * 60 * 1000;

    const num = parseInt(numMatch[1], 10);

    if (lower.includes("minute") || lower.includes("min")) {
        return num * 60 * 1000;
    }
    if (lower.includes("hour") || lower.includes("hr")) {
        return num * 60 * 60 * 1000;
    }
    if (lower.includes("day")) {
        return num * 24 * 60 * 60 * 1000;
    }

    return 60 * 60 * 1000;
}

registerTool({
    name: "create_reminder",
    description:
        "Create a new reminder. Use this when the user wants to set a reminder. " +
        "Parse natural language like 'Remind me to call the accountant tomorrow at 10am' into structured parameters. " +
        "Always confirm the parsed details back to the user for verification.",
    inputSchema: {
        type: "object" as const,
        properties: {
            title: {
                type: "string",
                description: "The title/what to remember (e.g., 'Call the accountant')",
            },
            due_at: {
                type: "string",
                description: "ISO 8601 datetime string (UTC) when the reminder is due",
            },
            body: {
                type: "string",
                description: "Optional additional notes or details",
            },
            recurrence: {
                type: "string",
                enum: ["daily", "weekly", "monthly", "weekdays"],
                description: "Optional recurrence pattern",
            },
        },
        required: ["title", "due_at"],
    },
    execute: async (input) => {
        const chatId = (input as Record<string, unknown>)._chatId as number || 0;
        const title = input.title as string;
        const dueAtStr = input.due_at as string;
        const body = input.body as string | undefined;
        const recurrence = input.recurrence as string | undefined;

        const dueAt = new Date(dueAtStr);
        if (isNaN(dueAt.getTime())) {
            return JSON.stringify({
                success: false,
                error: "Invalid due_at date format. Use ISO 8601 (e.g., 2024-01-15T10:00:00Z)",
            });
        }

        try {
            const reminder = createReminder(chatId, title, dueAt, body, recurrence);
            logger.info("reminders", `Created reminder ${reminder.id}: ${title}`, { chatId });

            const display = formatReminderForDisplay(reminder);
            return JSON.stringify({
                success: true,
                reminder: {
                    id: reminder.id,
                    title: reminder.title,
                    due_at: reminder.due_at,
                    body: reminder.body,
                    recurrence: reminder.recurrence,
                },
                display,
                message: "Reminder created. " + (recurrence ? `Will repeat ${recurrence}.` : ""),
            });
        } catch (err) {
            logger.error("reminders", "Failed to create reminder", { error: String(err) });
            return JSON.stringify({ success: false, error: "Failed to create reminder" });
        }
    },
});

registerTool({
    name: "list_reminders",
    description:
        "List all reminders for the user. Use this to show active, snoozed, completed, or all reminders. " +
        "Default shows all active reminders.",
    inputSchema: {
        type: "object" as const,
        properties: {
            status: {
                type: "string",
                enum: ["active", "snoozed", "completed", "dismissed", "all"],
                description: "Filter by status. Default: 'active'",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const chatId = (input as Record<string, unknown>)._chatId as number || 0;
        const status = (input.status as string) || "active";

        const reminders = status === "all"
            ? getRemindersByChatId(chatId)
            : getRemindersByChatId(chatId, status === "all" ? undefined : status);

        if (reminders.length === 0) {
            return JSON.stringify({
                count: 0,
                reminders: [],
                message: status === "all"
                    ? "No reminders found."
                    : `No ${status} reminders.`,
            });
        }

        const display = reminders.map(r => formatReminderForDisplay(r)).join("\n\n");

        return JSON.stringify({
            count: reminders.length,
            reminders: reminders.map(r => ({
                id: r.id,
                title: r.title,
                due_at: r.due_at,
                body: r.body,
                recurrence: r.recurrence,
                status: r.status,
            })),
            display,
        });
    },
});

registerTool({
    name: "get_reminder",
    description: "Get a specific reminder by its ID. Use this to view full details of a reminder.",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "number",
                description: "The reminder ID",
            },
        },
        required: ["id"],
    },
    execute: async (input) => {
        const id = input.id as number;
        const reminder = getReminderById(id);

        if (!reminder) {
            return JSON.stringify({ success: false, error: `Reminder ${id} not found` });
        }

        const display = formatReminderForDisplay(reminder);
        return JSON.stringify({
            reminder: {
                id: reminder.id,
                title: reminder.title,
                body: reminder.body,
                due_at: reminder.due_at,
                recurrence: reminder.recurrence,
                status: reminder.status,
                snoozed_until: reminder.snoozed_until,
                created_at: reminder.created_at,
            },
            display,
        });
    },
});

registerTool({
    name: "update_reminder",
    description:
        "Update an existing reminder's title, body, due time, or recurrence. " +
        "Use this when the user wants to modify a reminder.",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "number",
                description: "The reminder ID to update",
            },
            title: {
                type: "string",
                description: "New title",
            },
            body: {
                type: "string",
                description: "New body/notes",
            },
            due_at: {
                type: "string",
                description: "New due time (ISO 8601 datetime string in UTC)",
            },
            recurrence: {
                type: "string",
                enum: ["daily", "weekly", "monthly", "weekdays", ""],
                description: "New recurrence pattern (empty string to remove)",
            },
        },
        required: ["id"],
    },
    execute: async (input) => {
        const id = input.id as number;
        const updates: {
            title?: string;
            body?: string;
            due_at?: Date;
            recurrence?: string;
        } = {};

        if (input.title !== undefined) updates.title = input.title as string;
        if (input.body !== undefined) updates.body = input.body as string;
        if (input.due_at !== undefined) updates.due_at = new Date(input.due_at as string);
        if (input.recurrence !== undefined) updates.recurrence = input.recurrence === "" ? undefined : input.recurrence as string;

        const success = updateReminder(id, updates);

        if (!success) {
            return JSON.stringify({ success: false, error: `Reminder ${id} not found or update failed` });
        }

        const reminder = getReminderById(id);
        logger.info("reminders", `Updated reminder ${id}`);

        return JSON.stringify({
            success: true,
            reminder: {
                id: reminder?.id,
                title: reminder?.title,
                body: reminder?.body,
                due_at: reminder?.due_at,
                recurrence: reminder?.recurrence,
            },
            display: reminder ? formatReminderForDisplay(reminder) : "",
            message: "Reminder updated.",
        });
    },
});

registerTool({
    name: "snooze_reminder",
    description:
        "Snooze a reminder for a specified duration. " +
        "Use this when the user says 'snooze that for 2 hours' or similar. " +
        "The duration can be in minutes, hours, or days.",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "number",
                description: "The reminder ID to snooze",
            },
            duration: {
                type: "string",
                description: "Duration to snooze (e.g., '30 minutes', '2 hours', '1 day')",
            },
        },
        required: ["id", "duration"],
    },
    execute: async (input) => {
        const id = input.id as number;
        const duration = input.duration as string;

        const ms = parseDurationToMs(duration);
        const until = new Date(Date.now() + ms);

        const success = snoozeReminder(id, until);

        if (!success) {
            return JSON.stringify({ success: false, error: `Reminder ${id} not found or snooze failed` });
        }

        const reminder = getReminderById(id);
        logger.info("reminders", `Snoozed reminder ${id} until ${until.toISOString()}`);

        const newDue = reminder ? formatReminderForDisplay(reminder) : "";
        return JSON.stringify({
            success: true,
            reminder: {
                id: reminder?.id,
                status: "snoozed",
                due_at: reminder?.due_at,
            },
            display: newDue,
            message: `Snoozed for ${duration}. New due: ${until.toLocaleString("en-US", { timeZone: "America/New_York" })}`,
        });
    },
});

registerTool({
    name: "complete_reminder",
    description:
        "Mark a reminder as completed. Use this when the user confirms they've done the task " +
        "or wants to mark it as done.",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "number",
                description: "The reminder ID to complete",
            },
        },
        required: ["id"],
    },
    execute: async (input) => {
        const id = input.id as number;
        const success = updateReminderStatus(id, "completed");

        if (!success) {
            return JSON.stringify({ success: false, error: `Reminder ${id} not found` });
        }

        logger.info("reminders", `Completed reminder ${id}`);
        return JSON.stringify({
            success: true,
            message: "Reminder marked as completed ✅",
        });
    },
});

registerTool({
    name: "dismiss_reminder",
    description:
        "Dismiss a reminder without completing it. Use this when the user wants to cancel a reminder " +
        "but keep it in history (e.g., 'don't remind me about that').",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "number",
                description: "The reminder ID to dismiss",
            },
        },
        required: ["id"],
    },
    execute: async (input) => {
        const id = input.id as number;
        const success = updateReminderStatus(id, "dismissed");

        if (!success) {
            return JSON.stringify({ success: false, error: `Reminder ${id} not found` });
        }

        logger.info("reminders", `Dismissed reminder ${id}`);
        return JSON.stringify({
            success: true,
            message: "Reminder dismissed ❌",
        });
    },
});

registerTool({
    name: "delete_reminder",
    description:
        "Permanently delete a reminder. Use this when the user wants to remove a reminder entirely.",
    inputSchema: {
        type: "object" as const,
        properties: {
            id: {
                type: "number",
                description: "The reminder ID to delete",
            },
        },
        required: ["id"],
    },
    execute: async (input) => {
        const id = input.id as number;
        const success = deleteReminder(id);

        if (!success) {
            return JSON.stringify({ success: false, error: `Reminder ${id} not found` });
        }

        logger.info("reminders", `Deleted reminder ${id}`);
        return JSON.stringify({
            success: true,
            message: "Reminder permanently deleted.",
        });
    },
});

registerTool({
    name: "parse_reminder_time",
    description:
        "Parse natural language time description into a UTC ISO 8601 datetime. " +
        "Use this as a helper to convert user input like 'tomorrow at 10am' or 'next Monday at 3pm' " +
        "into a format the create_reminder tool can use.",
    inputSchema: {
        type: "object" as const,
        properties: {
            time_description: {
                type: "string",
                description: "Natural language time (e.g., 'tomorrow at 10am', 'next Monday at 3pm', 'in 2 hours')",
            },
        },
        required: ["time_description"],
    },
    execute: async (input) => {
        const desc = input.time_description as string;
        const parsed = parseRelativeTime(desc);

        return JSON.stringify({
            description: desc,
            parsed: parsed.toISOString(),
            display: parsed.toLocaleString("en-US", { timeZone: "America/New_York" }),
        });
    },
});
