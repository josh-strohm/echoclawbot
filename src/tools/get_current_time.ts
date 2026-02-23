/**
 * tools/get_current_time.ts — Level 1 starter tool.
 *
 * Returns the current date/time in the specified timezone.
 * Simple, safe, no side effects — perfect for testing the agent loop.
 */

import { registerTool } from "./registry.js";

registerTool({
    name: "get_current_time",
    description:
        "Returns the current date and time. Optionally accepts a timezone (e.g. 'America/New_York'). " +
        "Use this when the user asks what time it is, or when you need the current timestamp.",
    inputSchema: {
        type: "object" as const,
        properties: {
            timezone: {
                type: "string",
                description:
                    "IANA timezone name (e.g. 'America/New_York', 'Europe/London'). Defaults to the system timezone.",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const timezone = (input.timezone as string) || undefined;

        try {
            const now = new Date();
            const formatted = now.toLocaleString("en-US", {
                timeZone: timezone,
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
            });

            return JSON.stringify({
                formatted,
                iso: now.toISOString(),
                unix: Math.floor(now.getTime() / 1000),
                timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
        } catch {
            return JSON.stringify({
                error: `Invalid timezone: "${timezone}". Use IANA format like "America/New_York".`,
            });
        }
    },
});
