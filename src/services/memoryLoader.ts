import { getCoreMemory } from "../memory/coreMemory.js";
import { getMessages } from "../memory/messages.js";
import { getLatestSummary } from "../memory/summaries.js";
import { MEMORY_MAX_MESSAGES } from "../config.js";
import { searchPineconeMemory } from "./pineconeMemory.js";
import { logger } from "../logger.js";

export interface MemoryContext {
    coreFacts: string;
    recentMessages: string;
    conversationSummary: string;
    semanticResults: string;
}

export async function loadMemoryContext(chatId: string): Promise<MemoryContext> {
    logger.info("memory", "Loading memory context", { chatId });

    // Create a promise that times out after 5 seconds for Pinecone
    const pineconePromise = new Promise<any[]>((resolve) => {
        const timeout = setTimeout(() => {
            logger.warn("memory", "Pinecone search timed out after 5s, using empty results");
            resolve([]);
        }, 5000);
        
        searchPineconeMemory(chatId, "", MEMORY_MAX_MESSAGES)
            .then(result => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch(err => {
                clearTimeout(timeout);
                logger.warn("memory", "Pinecone search failed", { error: String(err) });
                resolve([]);
            });
    });

    const results = await Promise.allSettled([
        // Tier 1: Core memory
        Promise.resolve(getCoreMemory(chatId)),
        
        // Tier 1: Recent messages
        Promise.resolve(getMessages(chatId, MEMORY_MAX_MESSAGES)),
        
        // Tier 1: Latest summary
        Promise.resolve(getLatestSummary(chatId)),
        
        // Tier 2: Semantic search with timeout
        pineconePromise,
    ]);

    // Core facts
    const coreFactsResult = results[0];
    let coreFacts = "";
    if (coreFactsResult.status === "fulfilled") {
        const facts = coreFactsResult.value;
        if (facts.length > 0) {
            coreFacts = "\n\n--- CORE FACTS ---\n" + 
                facts.map(f => `- ${f.category}: ${f.content}`).join("\n") + 
                "\n--- END CORE FACTS ---";
        }
    }

    // Recent messages
    const messagesResult = results[1];
    let recentMessages = "";
    if (messagesResult.status === "fulfilled") {
        const messages = messagesResult.value;
        if (messages.length > 0) {
            recentMessages = "\n\n--- RECENT CONVERSATION ---\n" +
                messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n") +
                "\n--- END RECENT CONVERSATION ---";
        }
    }

    // Conversation summary
    const summaryResult = results[2];
    let conversationSummary = "";
    if (summaryResult.status === "fulfilled" && summaryResult.value) {
        const summary = summaryResult.value;
        conversationSummary = "\n\n--- PAST CONVERSATION SUMMARY ---\n" +
            summary.content +
            "\n--- END PAST CONVERSATION SUMMARY ---";
    }

    // Semantic results
    const semanticResult = results[3];
    let semanticResults = "";
    if (semanticResult.status === "fulfilled") {
        const results_1 = semanticResult.value;
        if (results_1.length > 0) {
            semanticResults = "\n\n--- RELEVANT PAST CONVERSATIONS ---\n" +
                results_1.map(r => `- ${r.content}`).join("\n\n") +
                "\n--- END RELEVANT PAST CONVERSATIONS ---";
        }
    }

    const context: MemoryContext = {
        coreFacts,
        recentMessages,
        conversationSummary,
        semanticResults,
    };

    logger.info("memory", "Memory context loaded", {
        chatId,
        hasCoreFacts: !!coreFacts,
        hasRecentMessages: !!recentMessages,
        hasSummary: !!conversationSummary,
        hasSemantic: !!semanticResults,
    });

    return context;
}

export function buildMemoryContextString(context: MemoryContext): string {
    return context.coreFacts + 
        context.conversationSummary + 
        context.semanticResults + 
        context.recentMessages;
}
