import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
    ANTHROPIC_API_KEY,
    OPENROUTER_API_KEY,
    CLAUDE_MODEL,
    PROVIDER,
} from "../config.js";
import { saveCoreMemory } from "../memory/coreMemory.js";
import { logger } from "../logger.js";

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const openrouter = new OpenAI({
    apiKey: OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
});

const FACT_EXTRACTION_PROMPT = `You are a fact extraction engine. Your job is to scan conversations and extract durable facts about the user.

Analyze the conversation below and extract:
1. User's name or nickname
2. User's location/timezone
3. User's job or profession
4. User's preferences (food, hobbies, tech stack, etc.)
5. Important dates or events
6. Any other durable information worth remembering

Return ONLY valid JSON in this format:
{
  "facts": [
    {
      "category": "name|location|job|preference|date|other",
      "content": "The specific fact",
      "importance": 0.1-1.0
    }
  ]
}

If no new facts are found, return {"facts": []}`;

export async function extractFacts(chatId: string, messages: { role: string; content: string }[]): Promise<void> {
    if (messages.length === 0) return;

    try {
        const conversation = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
        
        let result: string;

        if (PROVIDER === "anthropic") {
            const response = await anthropic.messages.create({
                model: "claude-3-haiku-20240307",
                max_tokens: 1024,
                system: FACT_EXTRACTION_PROMPT,
                messages: [{ role: "user", content: conversation }],
            });

            result = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text || "{}";
        } else {
            const response = await openrouter.chat.completions.create({
                model: "anthropic/claude-3-haiku",
                messages: [
                    { role: "system", content: FACT_EXTRACTION_PROMPT },
                    { role: "user", content: conversation }
                ],
                max_tokens: 1024,
            });

            result = response.choices[0].message.content || "{}";
        }

        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.debug("memory", "No valid JSON in fact extraction");
            return;
        }

        const parsed = JSON.parse(jsonMatch[0]);
        
        if (!parsed.facts || !Array.isArray(parsed.facts)) {
            return;
        }

        for (const fact of parsed.facts) {
            if (fact.content && fact.category) {
                saveCoreMemory(chatId, fact.content, fact.category, fact.importance || 0.5);
            }
        }

        logger.info("memory", "Extracted facts", { chatId, count: parsed.facts.length });
    } catch (error) {
        logger.error("memory", "Fact extraction failed", { error: String(error), chatId });
    }
}

export function extractFactsBackground(chatId: string, messages: { role: string; content: string }[]): void {
    extractFacts(chatId, messages).catch(err => {
        logger.error("memory", "Background fact extraction failed", { error: String(err), chatId });
    });
}
