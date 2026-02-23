/**
 * memory/synthesizer.ts — Background Semantic Memory Synthesizer
 *
 * Runs periodically to analyze recent conversation history, extracting new facts,
 * updating existing ones, and discarding obsolete ones, storing the results in the local vector store.
 */

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
    ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY,
    CLAUDE_MODEL,
    PROVIDER
} from "../config.js";
import { logger } from "../logger.js";
import { upsertFact, deleteFacts, searchSemanticFacts } from "./vector_memory.js";
import crypto from "crypto";

// Initialize clients
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const openrouter = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

const SYNTHESIZER_PROMPT = `You are the Semantic Memory Synthesizer for an AI assistant.
Your job is to read a recent snippet of conversation and extract long-term, semantic facts about the user.

A fact should be a concise, standalone statement about the user's preferences, life, projects, rules, or identity.
Do NOT store transient conversation details (e.g., "The user asked for a weather update yesterday").
Do NOT duplicate facts that already exist. If a new fact supersedes an old one (e.g., user changed their favorite color), you should output a command to update/replace the old fact.

You will be provided with:
1. EXISTING FACTS: The semantic facts currently retrieved from long-term memory that might be relevant.
2. RECENT CONVERSATION: The latest back-and-forth messages.

Respond ONLY with a valid JSON object matching this schema:
{
  "new_facts": [
    { "content": "The user's dog is named Barnaby", "importance": 0.8 },
    ...
  ],
  "update_facts": [
    { "id": "existing-fact-id-123", "content": "The user's favorite color is now Teal", "importance": 0.5 },
    ...
  ],
  "delete_facts": [
    "existing-fact-id-456",
    ...
  ]
}

If no new facts are found and no updates are needed, return empty arrays.`;

export async function synthesizeMemory(chatId: number, recentMessages: { role: string; content: string }[], currentContext: string): Promise<void> {
    logger.info("synthesizer", `Starting background synthesis for chat ${chatId}`);

    try {
        // Prepare the conversation payload
        const transcript = recentMessages.map(m => `[${m.role.toUpperCase()}]: ${m.content}`).join("\n");

        // Retrieve some context to see if there are existing facts we are talking about
        // Since we don't know the exact query, we can summarize the transcript's topics or just pass the last user message to search.
        const lastUserMsg = recentMessages.filter(m => m.role === "user").pop();

        let existingFactsStr = "No existing facts provided.";
        let relevantFacts: any[] = [];

        if (lastUserMsg) {
            relevantFacts = await searchSemanticFacts(chatId, lastUserMsg.content, 10);
            if (relevantFacts.length > 0) {
                existingFactsStr = relevantFacts.map(f => `ID: ${f.id} | Content: ${f.content}`).join("\n");
            }
        }

        const prompt = `<existing_facts>\n${existingFactsStr}\n</existing_facts>\n\n<recent_conversation>\n${transcript}\n</recent_conversation>`;

        let content = "";

        if (PROVIDER === "anthropic") {
            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1000,
                system: SYNTHESIZER_PROMPT,
                messages: [{ role: "user", content: prompt }],
            });
            content = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text || "{}";
        } else {
            const response = await openrouter.chat.completions.create({
                model: "anthropic/claude-3-haiku",
                messages: [
                    { role: "system", content: SYNTHESIZER_PROMPT },
                    { role: "user", content: prompt }
                ],
                max_tokens: 1000,
            });
            content = response.choices[0].message.content || "{}";
        }

        // Parse JSON
        // Sometimes LLMs wrap JSON in markdown markdown blocks
        const jsonStr = content.replace(/```json/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonStr);

        let changesMade = 0;

        // 1. Add new facts
        if (Array.isArray(parsed.new_facts)) {
            for (const f of parsed.new_facts) {
                const id = `fact_${crypto.randomUUID()}`;
                await upsertFact(id, chatId, f.content, f.importance);
                changesMade++;
            }
        }

        // 2. Update existing facts
        if (Array.isArray(parsed.update_facts)) {
            for (const f of parsed.update_facts) {
                if (f.id && f.content) {
                    await upsertFact(f.id, chatId, f.content, f.importance || 0.5);
                    changesMade++;
                }
            }
        }

        // 3. Delete obsolete facts
        if (Array.isArray(parsed.delete_facts) && parsed.delete_facts.length > 0) {
            await deleteFacts(parsed.delete_facts);
            changesMade += parsed.delete_facts.length;
        }

        logger.info("synthesizer", `Synthesis complete. Made ${changesMade} changes to long-term memory.`);

    } catch (err) {
        logger.error("synthesizer", "Background synthesis failed", { error: String(err) });
    }
}
