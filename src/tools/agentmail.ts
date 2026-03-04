import { AgentMailClient } from "agentmail";
import { AGENTMAIL_API_KEY, AGENTMAIL_INBOX } from "../config.js";
import { registerTool } from "./registry.js";
import { logger } from "../logger.js";

let client: AgentMailClient | null = null;

function getClient(): AgentMailClient {
    if (!client) {
        if (!AGENTMAIL_API_KEY) {
            throw new Error("AGENTMAIL_API_KEY not configured");
        }
        client = new AgentMailClient({ apiKey: AGENTMAIL_API_KEY });
    }
    return client;
}

registerTool({
    name: "send_email",
    description:
        "Send an email using AgentMail. " +
        "Use this to send emails from your agent's inbox. " +
        "Required: to (email address), subject, and body (text or html).",
    inputSchema: {
        type: "object" as const,
        properties: {
            to: {
                type: "string",
                description: "Recipient email address",
            },
            subject: {
                type: "string",
                description: "Email subject line",
            },
            text: {
                type: "string",
                description: "Plain text body of the email",
            },
            html: {
                type: "string",
                description: "HTML body of the email (optional, use instead of text)",
            },
        },
        required: ["to", "subject", "text"],
    },
    execute: async (input) => {
        const to = input.to as string;
        const subject = input.subject as string;
        const text = input.text as string;
        const html = input.html as string | undefined;

        if (!AGENTMAIL_API_KEY) {
            return JSON.stringify({ success: false, error: "AGENTMAIL_API_KEY not configured" });
        }

        try {
            const mailClient = getClient();
            
            const inboxes: any = await mailClient.inboxes.list();
            const inboxArr = Array.isArray(inboxes) ? inboxes : inboxes.inboxes;
            const inbox = inboxArr?.find((i: any) => i.emailAddress === AGENTMAIL_INBOX);
            
            if (!inbox) {
                return JSON.stringify({ success: false, error: `Inbox ${AGENTMAIL_INBOX} not found` });
            }

            const result = await mailClient.inboxes.messages.send(inbox.inboxId, {
                to,
                subject,
                text,
                html,
            });

            logger.info("agentmail", "Email sent", { to, subject, messageId: result.messageId });

            return JSON.stringify({
                success: true,
                message_id: result.messageId,
                to,
                subject,
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error("agentmail", "Failed to send email", { error: errorMsg });
            return JSON.stringify({ success: false, error: errorMsg });
        }
    },
});

registerTool({
    name: "list_emails",
    description:
        "List recent emails in your AgentMail inbox. " +
        "Use this to check your inbox for new messages. " +
        "Returns the most recent emails with sender, subject, and preview.",
    inputSchema: {
        type: "object" as const,
        properties: {
            limit: {
                type: "number",
                description: "Number of emails to return (default 10)",
            },
            unread_only: {
                type: "boolean",
                description: "Only return unread emails (default false)",
            },
        },
        required: [],
    },
    execute: async (input) => {
        const limit = (input.limit as number) || 10;
        const unreadOnly = (input.unread_only as boolean) || false;

        if (!AGENTMAIL_API_KEY) {
            return JSON.stringify({ success: false, error: "AGENTMAIL_API_KEY not configured" });
        }

        try {
            const mailClient = getClient();
            
            const inboxes: any = await mailClient.inboxes.list();
            const inboxArr = Array.isArray(inboxes) ? inboxes : inboxes.inboxes;
            const inbox = inboxArr?.find((i: any) => i.emailAddress === AGENTMAIL_INBOX);
            
            if (!inbox) {
                return JSON.stringify({ success: false, error: `Inbox ${AGENTMAIL_INBOX} not found` });
            }

            const messages: any = await mailClient.inboxes.messages.list(inbox.inboxId, { limit });
            const msgArr = Array.isArray(messages) ? messages : messages.messages;

            const filtered = unreadOnly 
                ? msgArr.filter((m: any) => m.read !== true) 
                : msgArr;

            return JSON.stringify({
                success: true,
                count: filtered.length,
                emails: filtered.map((m: any) => ({
                    message_id: m.messageId,
                    from: m.from,
                    to: m.to,
                    subject: m.subject,
                    preview: m.extractedText?.substring(0, 100),
                    created_at: m.createdAt,
                })),
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error("agentmail", "Failed to list emails", { error: errorMsg });
            return JSON.stringify({ success: false, error: errorMsg });
        }
    },
});

registerTool({
    name: "read_email",
    description:
        "Read the full content of a specific email by message ID. " +
        "Use this to get the complete text or HTML content of an email.",
    inputSchema: {
        type: "object" as const,
        properties: {
            message_id: {
                type: "string",
                description: "The message ID of the email to read",
            },
        },
        required: ["message_id"],
    },
    execute: async (input) => {
        const messageId = input.message_id as string;

        if (!AGENTMAIL_API_KEY) {
            return JSON.stringify({ success: false, error: "AGENTMAIL_API_KEY not configured" });
        }

        try {
            const mailClient = getClient();
            
            const inboxes: any = await mailClient.inboxes.list();
            const inboxArr = Array.isArray(inboxes) ? inboxes : inboxes.inboxes;
            const inbox = inboxArr?.find((i: any) => i.emailAddress === AGENTMAIL_INBOX);
            
            if (!inbox) {
                return JSON.stringify({ success: false, error: `Inbox ${AGENTMAIL_INBOX} not found` });
            }

            const message: any = await mailClient.inboxes.messages.get(inbox.inboxId, messageId);

            return JSON.stringify({
                success: true,
                message: {
                    message_id: message.messageId,
                    from: message.from,
                    to: message.to,
                    subject: message.subject,
                    text: message.extractedText,
                    html: message.extractedHtml,
                    created_at: message.createdAt,
                },
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error("agentmail", "Failed to read email", { error: errorMsg, messageId });
            return JSON.stringify({ success: false, error: errorMsg });
        }
    },
});

registerTool({
    name: "get_inbox_info",
    description:
        "Get information about your AgentMail inbox, including the email address and status.",
    inputSchema: {
        type: "object" as const,
        properties: {},
    },
    execute: async () => {
        if (!AGENTMAIL_API_KEY) {
            return JSON.stringify({ success: false, error: "AGENTMAIL_API_KEY not configured" });
        }

        try {
            const mailClient = getClient();
            const inboxes: any = await mailClient.inboxes.list();
            const inboxArr = Array.isArray(inboxes) ? inboxes : inboxes.inboxes;
            const inbox = inboxArr?.find((i: any) => i.emailAddress === AGENTMAIL_INBOX);
            
            if (!inbox) {
                return JSON.stringify({ 
                    success: true, 
                    inbox: {
                        email_address: AGENTMAIL_INBOX,
                        status: "not_found",
                        message: "Inbox not found - it may need to be created in the AgentMail console"
                    }
                });
            }

            return JSON.stringify({
                success: true,
                inbox: {
                    inbox_id: inbox.inboxId,
                    email_address: inbox.emailAddress,
                    status: inbox.status,
                    created_at: inbox.createdAt,
                },
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error("agentmail", "Failed to get inbox info", { error: errorMsg });
            return JSON.stringify({ success: false, error: errorMsg });
        }
    },
});
