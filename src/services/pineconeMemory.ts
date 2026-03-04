import {
    PINECONE_API_KEY,
    PINECONE_INDEX,
    MEMORY_SIMILARITY_THRESHOLD,
    MEMORY_TOP_K,
} from "../config.js";
import { logger } from "../logger.js";

const PINECONE_HOST = PINECONE_INDEX?.startsWith("https://")
    ? PINECONE_INDEX
    : PINECONE_INDEX?.includes(".")
        ? `https://${PINECONE_INDEX}`
        : `https://${PINECONE_INDEX}.svc.pinecone.io`;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

export interface PineconeResult {
    id: string;
    score: number;
    content: string;
    namespace: string;
}

let pineconeInitialized = false;

function isPineconeConfigured(): boolean {
    return !!(PINECONE_API_KEY && PINECONE_INDEX);
}

function isEmbeddingConfigured(): boolean {
    if (!OPENAI_API_KEY) {
        logger.warn("pinecone", "OPENAI_API_KEY not set — embeddings disabled");
        return false;
    }
    return true;
}

async function getEmbedding(text: string): Promise<number[]> {
    if (!isEmbeddingConfigured()) {
        throw new Error("OPENAI_API_KEY not configured");
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
                model: "text-embedding-3-small",
                input: text,
                dimensions: 1024,
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Embedding API failed: ${response.status} — ${errorBody}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    } catch (error: any) {
        if (error.name === 'AbortError') {
            logger.error("pinecone", "Embedding request timed out", { textLength: text.length });
            throw new Error("Embedding request timed out");
        }
        logger.error("pinecone", "Failed to get embedding", { error: String(error) });
        throw error;
    }
}

export async function initializePinecone(): Promise<boolean> {
    if (pineconeInitialized) return true;

    if (!isPineconeConfigured()) {
        logger.info("pinecone", "Pinecone not configured, skipping initialization");
        return false;
    }

    try {
        const response = await fetch(`${PINECONE_HOST}/describe_index_stats`, {
            method: "POST",
            headers: {
                "Api-Key": PINECONE_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
        });

        if (!response.ok) {
            throw new Error(`Pinecone connection failed: ${response.status}`);
        }

        pineconeInitialized = true;
        logger.info("pinecone", "Connected to Pinecone", { host: PINECONE_HOST });
        return true;
    } catch (error) {
        logger.error("pinecone", "Failed to initialize Pinecone", { error: String(error) });
        return false;
    }
}

export async function upsertToPinecone(
    namespace: string,
    id: string,
    content: string,
    metadata?: Record<string, string>
): Promise<boolean> {
    if (!isPineconeConfigured()) {
        logger.debug("pinecone", "Pinecone not configured, skipping upsert");
        return false;
    }

    try {
        const embedding = await getEmbedding(content);
        await initializePinecone();

        const response = await fetch(`${PINECONE_HOST}/vectors/upsert`, {
            method: "POST",
            headers: {
                "Api-Key": PINECONE_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                vectors: [{
                    id,
                    values: embedding,
                    metadata: {
                        content,
                        ...metadata,
                    },
                }],
                namespace,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Upsert failed: ${response.status} — ${errorBody}`);
        }

        logger.debug("pinecone", "Upserted to Pinecone", { namespace, id });
        return true;
    } catch (error) {
        logger.error("pinecone", "Failed to upsert", { error: String(error), namespace, id });
        return false;
    }
}

export async function searchPineconeMemory(
    chatId: string,
    query: string,
    topK: number = MEMORY_TOP_K
): Promise<PineconeResult[]> {
    if (!isPineconeConfigured()) {
        return [];
    }

    try {
        const embedding = await getEmbedding(query || "recent conversation");

        await initializePinecone();

        const response = await fetch(`${PINECONE_HOST}/query`, {
            method: "POST",
            headers: {
                "Api-Key": PINECONE_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                vector: embedding,
                topK: topK * 2,
                namespace: "conversations",
                filter: {
                    chatId: { $eq: chatId },
                },
                includeMetadata: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`Query failed: ${response.status}`);
        }

        const data = await response.json();

        const results: PineconeResult[] = (data.matches || [])
            .filter((m: any) => m.score >= MEMORY_SIMILARITY_THRESHOLD)
            .slice(0, topK)
            .map((m: any) => ({
                id: m.id,
                score: m.score,
                content: m.metadata?.content || "",
                namespace: "conversations",
            }));

        logger.info("pinecone", "Search completed", {
            chatId,
            query: query.substring(0, 50),
            resultsCount: results.length,
        });

        return results;
    } catch (error) {
        logger.error("pinecone", "Search failed", { error: String(error), chatId });
        return [];
    }
}

export async function ingestToKnowledge(
    id: string,
    content: string,
    metadata?: Record<string, string>
): Promise<boolean> {
    if (!isPineconeConfigured()) {
        return false;
    }

    const chunkSize = 1000;
    const overlap = 150;
    const chunks: string[] = [];

    for (let i = 0; i < content.length; i += chunkSize - overlap) {
        chunks.push(content.slice(i, i + chunkSize));
    }

    const success = await Promise.all(
        chunks.map((chunk, idx) =>
            upsertToPinecone("knowledge", `${id}_${idx}`, chunk, metadata)
        )
    );

    return success.every((s) => s);
}

export async function searchKnowledge(
    query: string,
    topK: number = MEMORY_TOP_K
): Promise<PineconeResult[]> {
    if (!isPineconeConfigured()) {
        return [];
    }

    try {
        const embedding = await getEmbedding(query);

        await initializePinecone();

        const response = await fetch(`${PINECONE_HOST}/query`, {
            method: "POST",
            headers: {
                "Api-Key": PINECONE_API_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                vector: embedding,
                topK,
                namespace: "knowledge",
                includeMetadata: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`Query failed: ${response.status}`);
        }

        const data = await response.json();

        const results: PineconeResult[] = (data.matches || [])
            .filter((m: any) => m.score >= MEMORY_SIMILARITY_THRESHOLD)
            .map((m: any) => ({
                id: m.id,
                score: m.score,
                content: m.metadata?.content || "",
                namespace: "knowledge",
            }));

        return results;
    } catch (error) {
        logger.error("pinecone", "Knowledge search failed", { error: String(error) });
        return [];
    }
}