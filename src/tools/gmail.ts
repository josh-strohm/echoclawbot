/**
 * tools/gmail.ts — Gmail tools for the agentic loop.
 *
 * Tools:
 *   - gmail_search: Search emails using Gmail search syntax
 *   - gmail_get_message: Read a specific email's content
 *   - gmail_send: Send a new email
 *   - gmail_draft: Create a draft email
 */

import { registerTool } from "./registry.js";
import { getGmail } from "../lib/google.js";
import { logger } from "../logger.js";

const gmail = getGmail();

// ── Search Emails ──────────────────────────────────────────

registerTool({
    name: "gmail_search",
    description:
        "Search the user's Gmail using Gmail search syntax (e.g. 'from:boss', 'is:unread', 'subject:report'). " +
        "Returns a list of message summaries.",
    inputSchema: {
        type: "object" as const,
        properties: {
            query: {
                type: "string",
                description: "The Gmail search query.",
            },
            maxResults: {
                type: "number",
                description: "Max number of messages to return. Default 5.",
            },
        },
        required: ["query"],
    },
    execute: async (input) => {
        const query = input.query as string;
        const maxResults = (input.maxResults as number) || 5;

        try {
            const res = await gmail.users.messages.list({
                userId: "me",
                q: query,
                maxResults,
            });

            const messages = res.data.messages || [];
            if (messages.length === 0) {
                return "No messages found matching that query.";
            }

            // Fetch headers for each message to show a summary
            const summaries = await Promise.all(
                messages.map(async (msg) => {
                    const detail = await gmail.users.messages.get({
                        userId: "me",
                        id: msg.id!,
                        format: "metadata",
                        metadataHeaders: ["Subject", "From", "Date"],
                    });

                    const headers = detail.data.payload?.headers || [];
                    const subject = headers.find((h) => h.name === "Subject")?.value || "(No Subject)";
                    const from = headers.find((h) => h.name === "From")?.value || "(Unknown)";
                    const date = headers.find((h) => h.name === "Date")?.value || "(Unknown)";

                    return { id: msg.id, from, subject, date };
                })
            );

            return JSON.stringify({ count: summaries.length, messages: summaries });
        } catch (err) {
            logger.error("gmail", "Search error", { error: String(err) });
            return `Error searching Gmail: ${String(err)}`;
        }
    },
});

// ── Get Message Content ──────────────────────────────────

registerTool({
    name: "gmail_get_message",
    description: "Read the full content of a specific Gmail message by its ID.",
    inputSchema: {
        type: "object" as const,
        properties: {
            messageId: {
                type: "string",
                description: "The ID of the message to retrieve.",
            },
        },
        required: ["messageId"],
    },
    execute: async (input) => {
        const messageId = input.messageId as string;

        try {
            const res = await gmail.users.messages.get({
                userId: "me",
                id: messageId,
            });

            const payload = res.data.payload;
            let body = "";

            if (payload?.parts) {
                // Multipart message — try to find the plain text part
                const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
                if (textPart?.body?.data) {
                    body = Buffer.from(textPart.body.data, "base64").toString();
                } else {
                    body = "(No plain text part found)";
                }
            } else if (payload?.body?.data) {
                // Single part message
                body = Buffer.from(payload.body.data, "base64").toString();
            }

            const headers = payload?.headers || [];
            const subject = headers.find((h) => h.name === "Subject")?.value;
            const from = headers.find((h) => h.name === "From")?.value;

            return JSON.stringify({ id: messageId, from, subject, body });
        } catch (err) {
            return `Error reading message: ${String(err)}`;
        }
    },
});

// ── Send Email ───────────────────────────────────────────

registerTool({
    name: "gmail_send",
    description: "Send a new email. Requires confirmation for non-self recipients (implied by policy).",
    inputSchema: {
        type: "object" as const,
        properties: {
            to: { type: "string", description: "Email address of the recipient." },
            subject: { type: "string", description: "Subject line." },
            body: { type: "string", description: "The message body." },
        },
        required: ["to", "subject", "body"],
    },
    execute: async (input) => {
        const { to, subject, body } = input as { to: string; subject: string; body: string };

        try {
            const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
            const messageParts = [
                `To: ${to}`,
                "Content-Type: text/plain; charset=utf-8",
                "MIME-Version: 1.0",
                `Subject: ${utf8Subject}`,
                "",
                body,
            ];
            const message = messageParts.join("\n");
            const encodedMessage = Buffer.from(message)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

            const res = await gmail.users.messages.send({
                userId: "me",
                requestBody: { raw: encodedMessage },
            });

            return `Email sent successfully! Message ID: ${res.data.id}`;
        } catch (err) {
            return `Error sending email: ${String(err)}`;
        }
    },
});

// ── Create Draft ─────────────────────────────────────────

registerTool({
    name: "gmail_create_draft",
    description: "Create a draft email in the user's Gmail account.",
    inputSchema: {
        type: "object" as const,
        properties: {
            to: { type: "string", description: "Email address of the recipient." },
            subject: { type: "string", description: "Subject line." },
            body: { type: "string", description: "The message body." },
        },
        required: ["to", "subject", "body"],
    },
    execute: async (input) => {
        const { to, subject, body } = input as { to: string; subject: string; body: string };

        try {
            const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
            const messageParts = [
                `To: ${to}`,
                "Content-Type: text/plain; charset=utf-8",
                "MIME-Version: 1.0",
                `Subject: ${utf8Subject}`,
                "",
                body,
            ];
            const message = messageParts.join("\n");
            const encodedMessage = Buffer.from(message)
                .toString("base64")
                .replace(/\+/g, "-")
                .replace(/\//g, "_")
                .replace(/=+$/, "");

            const res = await gmail.users.drafts.create({
                userId: "me",
                requestBody: {
                    message: {
                        raw: encodedMessage,
                    },
                },
            });

            return `Draft created successfully! Draft ID: ${res.data.id}`;
        } catch (err) {
            return `Error creating draft: ${String(err)}`;
        }
    },
});

