import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
    ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY,
    CLAUDE_MODEL,
    PROVIDER,
    MEMORY_COMPACTION_THRESHOLD,
} from "../config.js";
import { getAllMessagesForCompaction, deleteMessages, saveMessage, getMessageCount } from "../memory/messages.js";
import { saveSummary } from "../memory/summaries.js";
import { logger } from "../logger.js";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const openrouter = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

const SUMMARIZATION_PROMPT = `You are a conversation summarization engine. Your job is to create a concise summary of a conversation while preserving key information.

Create a summary that captures:
1. Main topics discussed
2. Key decisions or conclusions
3. Important facts or preferences mentioned
4. Any tasks or follow-ups

Keep the summary under 500 words but include all important details.`;

export async function compactMessages(chatId: string): Promise<boolean> {
    const messageCount = getMessageCount(chatId);
    
    if (messageCount < MEMORY_COMPACTION_THRESHOLD) {
        return false;
    }

    try {
        const allMessages = getAllMessagesForCompaction(chatId);
        
        if (allMessages.length < MEMORY_COMPACTION_THRESHOLD) {
            return false;
        }

        // Keep the most recent messages
        const messagesToKeep = allMessages.slice(-20);
        const messagesToSummarize = allMessages.slice(0, -20);

        if (messagesToSummarize.length === 0) {
            return false;
        }

        const conversation = messagesToSummarize
            .map(m => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n\n");

        let summary: string;

        if (PROVIDER === "anthropic") {
            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                system: SUMMARIZATION_PROMPT,
                messages: [{ role: "user", content: conversation }],
            });

            summary = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text || "";
        } else {
            const response = await openrouter.chat.completions.create({
                model: "anthropic/claude-3-haiku",
                messages: [
                    { role: "system", content: SUMMARIZATION_PROMPT },
                    { role: "user", content: conversation }
                ],
                max_tokens: 1024,
            });

            summary = response.choices[0].message.content || "";
        }

        if (summary) {
            // Save the summary
            saveSummary(chatId, summary, messagesToSummarize.length);
            
            // Delete the summarized messages
            deleteMessages(chatId, 20);
            
            // Re-add the kept messages
            for (const msg of messagesToKeep) {
                saveMessage(chatId, msg.role, msg.content);
            }

            logger.info("memory", "Compacted messages", { 
                chatId, 
                summarizedCount: messagesToSummarize.length,
                keptCount: messagesToKeep.length 
            });
            
            return true;
        }

        return false;
    } catch (error) {
        logger.error("memory", "Message compaction failed", { error: String(error), chatId });
        return false;
    }
}

export function compactMessagesBackground(chatId: string): void {
    compactMessages(chatId).catch(err => {
        logger.error("memory", "Background compaction failed", { error: String(err), chatId });
    });
}
