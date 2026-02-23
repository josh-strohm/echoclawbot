/**
 * services/reminder_notifications.ts — Reminder notification service.
 *
 * Runs a background loop that:
 *   - Checks every 60 seconds for due reminders
 *   - Sends Telegram notifications when reminders are due
 *   - Handles recurring reminders (schedules next occurrence)
 *   - Provides heartbeat with upcoming reminders
 */

import type { Bot } from "grammy";
import {
    getActiveRemindersDueBefore,
    getUpcomingReminders,
    updateReminderStatus,
    createReminder,
    calculateNextRecurrence,
    formatReminderForDisplay,
    Reminder,
} from "../db/reminders.js";
import { logger } from "../logger.js";

const CHECK_INTERVAL_MS = 60 * 1000;
let intervalId: ReturnType<typeof setInterval> | null = null;
let botInstance: Bot | null = null;

export function startReminderNotifications(bot: Bot): void {
    botInstance = bot;
    intervalId = setInterval(checkDueReminders, CHECK_INTERVAL_MS);
    logger.info("reminders", "Reminder notification service started (60s interval)");
}

export function stopReminderNotifications(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        logger.info("reminders", "Reminder notification service stopped");
    }
}

async function checkDueReminders(): Promise<void> {
    if (!botInstance) return;

    const now = new Date();
    const dueReminders = getActiveRemindersDueBefore(now);

    if (dueReminders.length === 0) return;

    logger.info("reminders", `Found ${dueReminders.length} due reminders`);

    for (const reminder of dueReminders) {
        await sendReminderNotification(reminder);

        if (reminder.recurrence) {
            const nextDue = calculateNextRecurrence(new Date(reminder.due_at), reminder.recurrence);
            if (nextDue) {
                createReminder(
                    reminder.chat_id,
                    reminder.title,
                    nextDue,
                    reminder.body || undefined,
                    reminder.recurrence
                );
                logger.info("reminders", `Created next recurring reminder: ${nextDue.toISOString()}`);
            }
        }

        updateReminderStatus(reminder.id, "completed");
    }
}

async function sendReminderNotification(reminder: Reminder): Promise<void> {
    if (!botInstance) return;

    try {
        const text = `🔔 *Reminder Due!*\n\n${formatReminderForDisplay(reminder)}`;
        await botInstance.api.sendMessage(reminder.chat_id, text, { parse_mode: "Markdown" });
        logger.info("reminders", `Sent notification for reminder ${reminder.id} to chat ${reminder.chat_id}`);
    } catch (err) {
        logger.error("reminders", `Failed to send notification for reminder ${reminder.id}`, {
            error: String(err),
        });
    }
}

export async function getHeartbeatSummary(chatId: number): Promise<string> {
    const upcoming = getUpcomingReminders(chatId, 24);

    if (upcoming.length === 0) {
        return "No upcoming reminders in the next 24 hours.";
    }

    let summary = `📅 *Upcoming Reminders (next 24h)*\n\n`;
    for (const reminder of upcoming) {
        summary += formatReminderForDisplay(reminder) + "\n\n";
    }

    return summary.trim();
}

export async function sendDailyHeartbeat(bot: Bot): Promise<void> {
    const chats = [...new Set((await getUpcomingReminders(0, 24)).map(r => r.chat_id))];

    for (const chatId of chats) {
        const summary = await getHeartbeatSummary(chatId);
        if (summary !== "No upcoming reminders in the next 24 hours.") {
            try {
                await bot.api.sendMessage(chatId, summary, { parse_mode: "Markdown" });
            } catch (err) {
                logger.error("reminders", `Failed to send heartbeat to chat ${chatId}`, {
                    error: String(err),
                });
            }
        }
    }
}
