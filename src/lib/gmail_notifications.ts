/**
 * lib/gmail_notifications.ts — Real-time Gmail notifications via Pub/Sub.
 *
 * This module:
 *   1. Sets up a Gmail 'watch' on the user's inbox
 *   2. Starts a background pull listener on a Google Cloud Pub/Sub subscription
 *   3. Triggers Telegram notifications when new emails arrive
 */

import { google } from "googleapis";
import { getGmail, getGoogleAuth } from "./google.js";
import { logger } from "../logger.js";
import { Bot } from "grammy";
import { ALLOWED_USER_IDS } from "../config.js";

const pubsub = google.pubsub("v1");
const gmail = getGmail();

// ── Watch Setup ──────────────────────────────────────────

/**
 * Configure Gmail to send notifications to a Pub/Sub topic.
 * User must have created a Topic and Subscription in Google Cloud Console.
 */
export async function setupGmailWatch(topicName: string) {
    try {
        const res = await gmail.users.watch({
            userId: "me",
            requestBody: {
                topicName, // format: projects/[PROJECT_ID]/topics/[TOPIC_NAME]
                labelIds: ["INBOX"],
            },
        });

        logger.info("gmail", "Watch active", {
            historyId: res.data.historyId,
            expiration: res.data.expiration,
        });
    } catch (err) {
        logger.error("gmail", "Failed to setup watch", { error: String(err) });
    }
}

// ── Notification Listener ────────────────────────────────

/**
 * Periodically pulls messages from a Pub/Sub subscription.
 * When a new Gmail event arrives, it fetches the recent history and notifies the user.
 */
export async function startNotificationListener(bot: Bot, subscriptionName: string) {
    logger.info("gmail", `Starting Pub/Sub listener on ${subscriptionName}`);

    // Loop indefinitely
    while (true) {
        try {
            const auth = getGoogleAuth();
            if (!auth) throw new Error("Google Auth not initialized");

            const res = await pubsub.projects.subscriptions.pull({
                subscription: subscriptionName, // format: projects/[PROJECT_ID]/subscriptions/[SUB_NAME]
                requestBody: {
                    maxMessages: 1,
                    returnImmediately: false, // wait for a message (long-poll)
                },
                auth: auth as any,
            });

            const messages = res.data.receivedMessages || [];
            for (const msg of messages) {
                if (msg.message?.data) {
                    const data = JSON.parse(Buffer.from(msg.message.data, "base64").toString());
                    const emailAddress = data.emailAddress;
                    const historyId = data.historyId;

                    logger.info("gmail", "Received notification", { emailAddress, historyId });

                    // Acknowledge the message so we don't receive it again
                    await pubsub.projects.subscriptions.acknowledge({
                        subscription: subscriptionName,
                        requestBody: { ackIds: [msg.ackId!] },
                        auth: auth as any,
                    });

                    // Notify the user over Telegram
                    for (const userId of ALLOWED_USER_IDS) {
                        await bot.api.sendMessage(
                            userId,
                            `📨 *New activity in your Gmail*\n(_${emailAddress}_)\n\nAsk me to "check my latest emails" for details.`,
                            { parse_mode: "Markdown" }
                        );
                    }
                }
            }
        } catch (err) {
            // Don't crash on network errors, just wait and retry
            logger.debug("gmail", "Pub/Sub pull error (ignoring)", { error: String(err) });
            await new Promise((r) => setTimeout(r, 5000));
        }
    }
}
