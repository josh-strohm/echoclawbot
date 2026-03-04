import { saveMessage, getMessageCount } from "../memory/messages.js";
import { extractFactsBackground } from "./factExtractor.js";
import { compactMessagesBackground } from "./compaction.js";
import { upsertToPinecone } from "./pineconeMemory.js";
import { logActivity } from "./supabaseStore.js";
import { MEMORY_COMPACTION_THRESHOLD } from "../config.js";
import { logger } from "../logger.js";
import { getCoreMemory } from "../memory/coreMemory.js";

function generateMessageId(chatId: string, role: string): string {
    const timestamp = Date.now();
    return `${chatId}_${role}_${timestamp}`;
}

export function saveConversationMessage(chatId: string, role: string, content: string): void {
    saveMessage(chatId, role, content);
    logger.debug("memory", "Saved message", { chatId, role, contentLength: content.length });
}

export function processConversationBackground(chatId: string, userMessage: string, assistantMessage: string): void {
    // Save messages
    saveMessage(chatId, "user", userMessage);
    saveMessage(chatId, "assistant", assistantMessage);

    const messageCount = getMessageCount(chatId);

    // Extract facts (fire and forget)
    const recentMessages = [
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantMessage },
    ];
    extractFactsBackground(chatId, recentMessages);

    // Embed to Pinecone (fire and forget)
    const exchangeId = generateMessageId(chatId, "exchange");
    const exchangeContent = `User: ${userMessage}\nAssistant: ${assistantMessage}`;
    upsertToPinecone("conversations", exchangeId, exchangeContent, { chatId, timestamp: new Date().toISOString() }).catch(err => {
        logger.warn("memory", "Failed to embed to Pinecone", { error: String(err) });
    });

    // Log activity to Supabase (fire and forget)
    logActivity("conversation", `Chat: ${chatId}, Messages: ${messageCount}`, "success").catch(err => {
        logger.warn("supabase", "Failed to log activity", { error: String(err) });
    });

    // Trigger compaction if needed (fire and forget)
    if (messageCount >= MEMORY_COMPACTION_THRESHOLD) {
        compactMessagesBackground(chatId);
    }

    logger.info("memory", "Background processing triggered", { chatId, messageCount });
}

export { getCoreMemory };
