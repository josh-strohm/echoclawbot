/**
 * logger.ts — Minimal structured logger.
 *
 * Prefixes every line with a timestamp and level.
 * Never logs secrets (enforced by never passing raw env values here).
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function timestamp(): string {
    return new Date().toISOString();
}

import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(process.cwd(), "bot.log");

function log(level: LogLevel, component: string, message: string, data?: Record<string, unknown>): void {
    const prefix = `[${timestamp()}] [${level}] [${component}]`;
    const suffix = data ? ` ${JSON.stringify(data)}` : "";
    const line = `${prefix} ${message}${suffix}`;

    if (level === "ERROR") {
        console.error(line);
    } else if (level === "WARN") {
        console.warn(line);
    } else {
        console.log(line);
    }

    // Also write to file for debugging
    try { appendFileSync(LOG_FILE, line + "\n", "utf8"); } catch { }
}

export const logger = {
    info: (component: string, message: string, data?: Record<string, unknown>) =>
        log("INFO", component, message, data),
    warn: (component: string, message: string, data?: Record<string, unknown>) =>
        log("WARN", component, message, data),
    error: (component: string, message: string, data?: Record<string, unknown>) =>
        log("ERROR", component, message, data),
    debug: (component: string, message: string, data?: Record<string, unknown>) =>
        log("DEBUG", component, message, data),
};
