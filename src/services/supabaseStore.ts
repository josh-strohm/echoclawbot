import { SUPABASE_URL, SUPABASE_KEY } from "../config.js";
import { logger } from "../logger.js";

export interface DataStoreRow {
    id: string;
    key: string;
    value: string;
    data_type: "text" | "number" | "json";
    created_at: string;
    updated_at: string;
}

export interface ActivityLogRow {
    id: string;
    action: string;
    details: string;
    status: string;
    timestamp: string;
}

export interface CostLogRow {
    id: string;
    service: string;
    model: string;
    tokens: number;
    cost_usd: number;
    timestamp: string;
}

function isSupabaseConfigured(): boolean {
    return !!(SUPABASE_URL && SUPABASE_KEY);
}

async function supabaseRequest(
    table: string,
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    body?: any
): Promise<any> {
    if (!isSupabaseConfigured()) {
        throw new Error("Supabase not configured");
    }

    const url = `${SUPABASE_URL}/rest/v1/${table}`;

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
    };

    // Tell Supabase to return the created/updated row as JSON
    if (method === "POST") {
        headers["Prefer"] = "return=representation";
    } else if (method === "PATCH") {
        headers["Prefer"] = "return=representation";
    }

    const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
        throw new Error(`Supabase request failed: ${response.status}`);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// ── Data Store ─────────────────────────────────────────────

export async function saveData(
    key: string,
    value: any,
    dataType: "text" | "number" | "json" = "text"
): Promise<DataStoreRow> {
    if (!isSupabaseConfigured()) {
        logger.warn("supabase", "Supabase not configured, skipping save");
        return { id: "", key, value: "", data_type: dataType, created_at: "", updated_at: "" };
    }

    const now = new Date().toISOString();
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);
    const type = typeof value === "number" ? "number" : typeof value === "object" ? "json" : "text";

    try {
        // Try to update existing row with matching key
        const result = await supabaseRequest(
            `data_store?key=eq.${encodeURIComponent(key)}`,
            "PATCH",
            { value: stringValue, data_type: type, updated_at: now }
        );

        // If PATCH returned rows, the update worked
        if (result && Array.isArray(result) && result.length > 0) {
            logger.info("supabase", "Updated data", { key, type });
            return result[0];
        }

        // No existing row — insert a new one
        const insertResult = await supabaseRequest("data_store", "POST", {
            id: generateUUID(),
            key,
            value: stringValue,
            data_type: type,
            created_at: now,
            updated_at: now,
        });

        logger.info("supabase", "Saved data", { key, type });
        return Array.isArray(insertResult) ? insertResult[0] : insertResult;
    } catch (error) {
        logger.error("supabase", "Save data failed", { error: String(error) });
        return { id: "", key, value: stringValue, data_type: type, created_at: now, updated_at: now };
    }
}

export async function queryData(key?: string, dataType?: string): Promise<DataStoreRow[]> {
    if (!isSupabaseConfigured()) {
        return [];
    }

    try {
        const query = key
            ? `?key=eq.${encodeURIComponent(key)}`
            : dataType
                ? `?data_type=eq.${encodeURIComponent(dataType)}`
                : "";
        const result = await supabaseRequest(`data_store${query}`, "GET");
        return result || [];
    } catch (error) {
        logger.error("supabase", "Query data failed", { error: String(error) });
        return [];
    }
}

export async function deleteData(key: string): Promise<boolean> {
    if (!isSupabaseConfigured()) {
        return false;
    }

    try {
        await supabaseRequest(`data_store?key=eq.${encodeURIComponent(key)}`, "DELETE");
        logger.info("supabase", "Deleted data", { key });
        return true;
    } catch (error) {
        logger.error("supabase", "Delete data failed", { error: String(error) });
        return false;
    }
}

// ── Activity Log ───────────────────────────────────────────

export async function logActivity(
    action: string,
    details: string,
    status: string = "success"
): Promise<void> {
    if (!isSupabaseConfigured()) {
        return;
    }

    try {
        await supabaseRequest("activity_log", "POST", {
            id: generateUUID(),
            action,
            details,
            status,
            timestamp: new Date().toISOString(),
        });

        logger.debug("supabase", "Logged activity", { action, status });
    } catch (error) {
        logger.error("supabase", "Log activity failed", { error: String(error) });
    }
}

export async function getActivityLog(limit: number = 50): Promise<ActivityLogRow[]> {
    if (!isSupabaseConfigured()) {
        return [];
    }

    try {
        const result = await supabaseRequest(
            `activity_log?order=timestamp.desc&limit=${limit}`,
            "GET"
        );
        return result || [];
    } catch (error) {
        logger.error("supabase", "Get activity log failed", { error: String(error) });
        return [];
    }
}

// ── Cost Log ───────────────────────────────────────────────

export async function logCost(
    service: string,
    model: string,
    tokens: number,
    costUsd: number
): Promise<void> {
    if (!isSupabaseConfigured()) {
        return;
    }

    try {
        await supabaseRequest("cost_log", "POST", {
            id: generateUUID(),
            service,
            model,
            tokens,
            cost_usd: costUsd,
            timestamp: new Date().toISOString(),
        });

        logger.debug("supabase", "Logged cost", { service, model, tokens, costUsd });
    } catch (error) {
        logger.error("supabase", "Log cost failed", { error: String(error) });
    }
}

export async function getCostLog(limit: number = 50): Promise<CostLogRow[]> {
    if (!isSupabaseConfigured()) {
        return [];
    }

    try {
        const result = await supabaseRequest(
            `cost_log?order=timestamp.desc&limit=${limit}`,
            "GET"
        );
        return result || [];
    } catch (error) {
        logger.error("supabase", "Get cost log failed", { error: String(error) });
        return [];
    }
}

export async function getTotalCost(): Promise<number> {
    if (!isSupabaseConfigured()) {
        return 0;
    }

    try {
        const result = await supabaseRequest("cost_log?select=cost_usd", "GET");
        return (result || []).reduce(
            (sum: number, row: { cost_usd: number }) => sum + (row.cost_usd || 0),
            0
        );
    } catch {
        return 0;
    }
}