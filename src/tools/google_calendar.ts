/**
 * tools/google_calendar.ts — Google Calendar tools for the agentic loop.
 *
 * Tools:
 *   - calendar_list_events: List upcoming events
 *   - calendar_get_event: Get details of a specific event
 *   - calendar_create_event: Create a new calendar event
 *   - calendar_delete_event: Delete a calendar event
 */

import { registerTool } from "./registry.js";
import { getCalendar } from "../lib/google.js";
import { logger } from "../logger.js";

const calendar = getCalendar();

// ── List Events ────────────────────────────────────────────

registerTool({
    name: "calendar_list_events",
    description:
        "List upcoming events from the user's Google Calendar. " +
        "Returns event summaries with times. Defaults to the next 10 events.",
    inputSchema: {
        type: "object" as const,
        properties: {
            maxResults: {
                type: "number",
                description: "Max number of events to return. Default 10.",
            },
            timeMin: {
                type: "string",
                description: "Start of time range (ISO 8601). Defaults to now.",
            },
            timeMax: {
                type: "string",
                description: "End of time range (ISO 8601). Optional.",
            },
            query: {
                type: "string",
                description: "Free text search query to filter events. Optional.",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const maxResults = (input.maxResults as number) || 10;
        const timeMin = (input.timeMin as string) || new Date().toISOString();
        const timeMax = input.timeMax as string | undefined;
        const query = input.query as string | undefined;

        try {
            const res = await calendar.events.list({
                calendarId: "primary",
                timeMin,
                timeMax,
                maxResults,
                singleEvents: true,
                orderBy: "startTime",
                q: query,
            });

            const events = res.data.items || [];
            if (events.length === 0) {
                return "No upcoming events found.";
            }

            const summaries = events.map((event) => ({
                id: event.id,
                summary: event.summary || "(No title)",
                start: event.start?.dateTime || event.start?.date,
                end: event.end?.dateTime || event.end?.date,
                location: event.location || undefined,
                status: event.status,
            }));

            return JSON.stringify({ count: summaries.length, events: summaries });
        } catch (err) {
            logger.error("calendar", "List events error", { error: String(err) });
            return `Error listing calendar events: ${String(err)}`;
        }
    },
});

// ── Get Event Details ──────────────────────────────────────

registerTool({
    name: "calendar_get_event",
    description: "Get full details of a specific Google Calendar event by its ID.",
    inputSchema: {
        type: "object" as const,
        properties: {
            eventId: {
                type: "string",
                description: "The ID of the event to retrieve.",
            },
        },
        required: ["eventId"],
    },
    execute: async (input) => {
        const eventId = input.eventId as string;

        try {
            const res = await calendar.events.get({
                calendarId: "primary",
                eventId,
            });

            const event = res.data;
            return JSON.stringify({
                id: event.id,
                summary: event.summary,
                description: event.description,
                start: event.start?.dateTime || event.start?.date,
                end: event.end?.dateTime || event.end?.date,
                location: event.location,
                attendees: event.attendees?.map((a) => ({
                    email: a.email,
                    responseStatus: a.responseStatus,
                })),
                hangoutLink: event.hangoutLink,
                htmlLink: event.htmlLink,
                status: event.status,
            });
        } catch (err) {
            logger.error("calendar", "Get event error", { error: String(err) });
            return `Error getting event: ${String(err)}`;
        }
    },
});

// ── Create Event ───────────────────────────────────────────

registerTool({
    name: "calendar_create_event",
    description:
        "Create a new event on the user's Google Calendar. " +
        "Supports setting title, start/end times, description, location, and attendees.",
    inputSchema: {
        type: "object" as const,
        properties: {
            summary: {
                type: "string",
                description: "The title of the event.",
            },
            startDateTime: {
                type: "string",
                description: "Start time in ISO 8601 format (e.g. '2025-03-01T10:00:00-05:00'). For all-day events, use date format 'YYYY-MM-DD'.",
            },
            endDateTime: {
                type: "string",
                description: "End time in ISO 8601 format. For all-day events, use date format 'YYYY-MM-DD'.",
            },
            description: {
                type: "string",
                description: "Description/notes for the event. Optional.",
            },
            location: {
                type: "string",
                description: "Location of the event. Optional.",
            },
            attendees: {
                type: "array",
                items: { type: "string" },
                description: "List of attendee email addresses. Optional.",
            },
        },
        required: ["summary", "startDateTime", "endDateTime"],
    },
    execute: async (input) => {
        const summary = input.summary as string;
        const startDateTime = input.startDateTime as string;
        const endDateTime = input.endDateTime as string;
        const description = input.description as string | undefined;
        const location = input.location as string | undefined;
        const attendees = input.attendees as string[] | undefined;

        const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startDateTime);

        const eventBody: any = {
            summary,
            description,
            location,
            start: isAllDay ? { date: startDateTime } : { dateTime: startDateTime },
            end: isAllDay ? { date: endDateTime } : { dateTime: endDateTime },
        };

        if (attendees && attendees.length > 0) {
            eventBody.attendees = attendees.map((email) => ({ email }));
        }

        try {
            const res = await calendar.events.insert({
                calendarId: "primary",
                requestBody: eventBody,
            });

            return `Event created successfully! Event ID: ${res.data.id}, Link: ${res.data.htmlLink}`;
        } catch (err) {
            logger.error("calendar", "Create event error", { error: String(err) });
            return `Error creating event: ${String(err)}`;
        }
    },
});

// ── Delete Event ───────────────────────────────────────────

registerTool({
    name: "calendar_delete_event",
    description: "Delete a specific event from the user's Google Calendar by its ID.",
    inputSchema: {
        type: "object" as const,
        properties: {
            eventId: {
                type: "string",
                description: "The ID of the event to delete.",
            },
        },
        required: ["eventId"],
    },
    execute: async (input) => {
        const eventId = input.eventId as string;

        try {
            await calendar.events.delete({
                calendarId: "primary",
                eventId,
            });

            return `Event ${eventId} deleted successfully.`;
        } catch (err) {
            logger.error("calendar", "Delete event error", { error: String(err) });
            return `Error deleting event: ${String(err)}`;
        }
    },
});
