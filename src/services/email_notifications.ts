/**
 * services/email_notifications.ts — Email polling service.
 *
 * Runs a background loop that:
 *   - Checks every 60 seconds for new emails in AgentMail inbox
 *   - Sends Telegram notifications when new emails arrive
 *   - Keeps track of processed emails to avoid duplicates
 */

import type { Bot } from "grammy";
import { AgentMailClient } from "agentmail";
import { AGENTMAIL_API_KEY, AGENTMAIL_INBOX, ALLOWED_USER_IDS } from "../config.js";
import { logger } from "../logger.js";

const CHECK_INTERVAL_MS = 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;
let botInstance: Bot | null = null;
let processedMessageIds = new Set<string>();

export function startEmailNotifications(bot: Bot): void {
    botInstance = bot;
    intervalId = setInterval(checkNewEmails, CHECK_INTERVAL_MS);
    logger.info("email", "Email notification service started (60s interval)");
}

export function stopEmailNotifications(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info("email", "Email notification service stopped");
    }
}

async function checkNewEmails(): Promise<void> {
    if (!botInstance || !AGENTMAIL_API_KEY) return;

    try {
        const client = new AgentMailClient({ apiKey: AGENTMAIL_API_KEY });
        
        const inboxes: any = await client.inboxes.list();
        const inboxArr = Array.isArray(inboxes) ? inboxes : inboxes.inboxes;
        const inbox = inboxArr?.find((i: any) => i.emailAddress === AGENTMAIL_INBOX);
        
        if (!inbox) {
            logger.warn("email", `Inbox ${AGENTMAIL_INBOX} not found`);
            return;
        }

        const messages: any = await client.inboxes.messages.list(inbox.inboxId, { limit: 10 });
        const msgArr = Array.isArray(messages) ? messages : messages.messages;

        for (const message of msgArr) {
            if (processedMessageIds.has(message.messageId)) continue;
            
            processedMessageIds.add(message.messageId);
            
            if (processedMessageIds.size > 100) {
                const arr = Array.from(processedMessageIds);
                processedMessageIds = new Set(arr.slice(-50));
            }

            const text = `📧 *New Email Received!*\n\n` +
                `*From:* ${message.from}\n` +
                `*Subject:* ${message.subject}\n\n` +
                `_Reply with what you'd like me to do with this email_`;

            for (const chatId of ALLOWED_USER_IDS) {
                try {
                    await botInstance!.api.sendMessage(chatId, text, { parse_mode: "Markdown" });
                    logger.info("email", `Forwarded email to chat ${chatId}: ${message.subject}`);
                } catch (err) {
                    logger.error("email", `Failed to forward email to chat ${chatId}`, {
                        error: String(err),
                    });
                }
            }
        }
    } catch (err) {
        logger.error("email", "Error checking emails", { error: String(err) });
    }
}
