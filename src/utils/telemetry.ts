import { sqlite } from '../dashboard/db';

export function logMessage(chatId: string, role: string, content: string) {
    try {
        if (!content) return; // avoid logging empty tool calls implicitly
        sqlite.prepare(`INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)`).run(chatId, role, content);
    } catch (e: any) {
        console.error('[Telemetry] Failed to log message:', e.message);
    }
}

export function logCoreMemory(category: string, content: string, importance: number = 1) {
    try {
        sqlite.prepare(`INSERT INTO core_memory (category, content, importance) VALUES (?, ?, ?)`).run(category, content, importance);
    } catch (e: any) {
        console.error('[Telemetry] Failed to log core memory:', e.message);
    }
}

export async function logCost(service: string, model: string, tokens: number, cost_usd: number) {
    try {
        sqlite.prepare(`INSERT INTO cost_log (service, model, tokens, cost_usd) VALUES (?, ?, ?, ?)`).run(service, model, tokens, cost_usd);
    } catch (e: any) {
        console.error('[Telemetry] Failed to log cost locally:', e.message);
    }


}

export async function logActivity(action: string, details: any, status: 'success' | 'error' | 'pending') {
    try {
        sqlite.prepare(`INSERT INTO activity_log (action, details, status) VALUES (?, ?, ?)`).run(action, JSON.stringify(details || {}), status);
    } catch (e: any) {
        console.error('[Telemetry] Failed to log activity locally:', e.message);
    }


}
