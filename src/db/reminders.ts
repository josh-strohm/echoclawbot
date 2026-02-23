/**
 * db/reminders.ts — Reminder database operations.
 *
 * All reminder CRUD operations using SQLite.
 * Timezone: Stores UTC, displays in America/New_York.
 */

import { getDb } from "../memory/db.js";

export interface Reminder {
    id: number;
    chat_id: number;
    title: string;
    body: string | null;
    due_at: string;
    recurrence: string | null;
    status: "active" | "snoozed" | "completed" | "dismissed";
    snoozed_until: string | null;
    created_at: string;
    updated_at: string;
}

const TIMEZONE = "America/New_York";

function toNYTime(date: Date): string {
    return date.toLocaleString("en-US", { timeZone: TIMEZONE });
}

function toUTC(date: Date): string {
    return date.toISOString();
}

export function createReminder(
    chatId: number,
    title: string,
    dueAt: Date,
    body?: string,
    recurrence?: string
): Reminder {
    const db = getDb();
    const now = new Date();

    const stmt = db.prepare(`
    INSERT INTO reminders (chat_id, title, body, due_at, recurrence, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `);

    const result = stmt.run(
        chatId,
        title,
        body || null,
        toUTC(dueAt),
        recurrence || null,
        toUTC(now),
        toUTC(now)
    );

    return getReminderById(result.lastInsertRowid as number)!;
}

export function getReminderById(id: number): Reminder | undefined {
    const db = getDb();
    const row = db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Reminder | undefined;
    return row;
}

export function getRemindersByChatId(chatId: number, status?: string): Reminder[] {
    const db = getDb();
    if (status) {
        return db.prepare("SELECT * FROM reminders WHERE chat_id = ? AND status = ? ORDER BY due_at ASC")
            .all(chatId, status) as Reminder[];
    }
    return db.prepare("SELECT * FROM reminders WHERE chat_id = ? ORDER BY due_at ASC")
        .all(chatId) as Reminder[];
}

export function getActiveRemindersDueBefore(date: Date): Reminder[] {
    const db = getDb();
    const now = new Date();
    return db.prepare(`
    SELECT * FROM reminders 
    WHERE status = 'active' 
    AND due_at <= ?
    ORDER BY due_at ASC
  `).all(toUTC(date)) as Reminder[];
}

export function getUpcomingReminders(chatId: number, hours: number = 24): Reminder[] {
    const db = getDb();
    const now = new Date();
    const future = new Date(now.getTime() + hours * 60 * 60 * 1000);
    return db.prepare(`
    SELECT * FROM reminders 
    WHERE chat_id = ? 
    AND status IN ('active', 'snoozed')
    AND due_at <= ?
    ORDER BY due_at ASC
  `).all(chatId, toUTC(future)) as Reminder[];
}

export function updateReminderStatus(id: number, status: Reminder["status"]): boolean {
    const db = getDb();
    const now = new Date();
    const result = db.prepare(`
    UPDATE reminders SET status = ?, updated_at = ? WHERE id = ?
  `).run(status, toUTC(now), id);
    return result.changes > 0;
}

export function snoozeReminder(id: number, until: Date): boolean {
    const db = getDb();
    const now = new Date();
    const result = db.prepare(`
    UPDATE reminders SET status = 'snoozed', snoozed_until = ?, updated_at = ? WHERE id = ?
  `).run(toUTC(until), toUTC(now), id);
    return result.changes > 0;
}

export function updateReminder(
    id: number,
    updates: { title?: string; body?: string; due_at?: Date; recurrence?: string }
): boolean {
    const db = getDb();
    const now = new Date();
    const current = getReminderById(id);
    if (!current) return false;

    const stmt = db.prepare(`
    UPDATE reminders SET 
      title = ?, 
      body = ?, 
      due_at = ?, 
      recurrence = ?, 
      updated_at = ?
    WHERE id = ?
  `);

    const result = stmt.run(
        updates.title ?? current.title,
        updates.body ?? current.body,
        updates.due_at ? toUTC(updates.due_at) : current.due_at,
        updates.recurrence ?? current.recurrence,
        toUTC(now),
        id
    );

    return result.changes > 0;
}

export function deleteReminder(id: number): boolean {
    const db = getDb();
    const result = db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
    return result.changes > 0;
}

export function calculateNextRecurrence(currentDue: Date, recurrence: string): Date | null {
    const next = new Date(currentDue);

    switch (recurrence) {
        case "daily":
            next.setDate(next.getDate() + 1);
            break;
        case "weekly":
            next.setDate(next.getDate() + 7);
            break;
        case "monthly":
            next.setMonth(next.getMonth() + 1);
            break;
        case "weekdays":
            do {
                next.setDate(next.getDate() + 1);
            } while (next.getDay() === 0 || next.getDay() === 6);
            break;
        default:
            return null;
    }

    return next;
}

export function formatReminderForDisplay(reminder: Reminder): string {
    const dueDate = new Date(reminder.due_at);
    const nyTime = toNYTime(dueDate);

    let text = `📌 *${reminder.title}*\n`;
    text += `   Due: ${nyTime}`;

    if (reminder.body) {
        text += `\n   Note: ${reminder.body}`;
    }

    if (reminder.recurrence) {
        const recurrenceText: Record<string, string> = {
            daily: "Daily",
            weekly: "Weekly",
            monthly: "Monthly",
            weekdays: "Weekdays",
        };
        text += `\n   ↻ ${recurrenceText[reminder.recurrence] || reminder.recurrence}`;
    }

    const statusEmoji: Record<string, string> = {
        active: "",
        snoozed: " ⏸️",
        completed: " ✅",
        dismissed: " ❌",
    };
    text += statusEmoji[reminder.status] || "";

    return text;
}

export function getAllActiveChats(): number[] {
    const db = getDb();
    const rows = db.prepare(`
    SELECT DISTINCT chat_id FROM reminders 
    WHERE status IN ('active', 'snoozed')
  `).all() as { chat_id: number }[];
    return rows.map(r => r.chat_id);
}
