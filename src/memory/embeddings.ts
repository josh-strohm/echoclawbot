/**
 * memory/embeddings.ts — Ollama Embeddings Wrapper
 *
 * Uses local Ollama API for generating vector embeddings.
 * Supports all-minilm model for fast embeddings.
 */

import { logger } from "../logger.js";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_EMBED_MODEL || "all-minilm";

async function ollamaRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`${OLLAMA_HOST}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const response = await ollamaRequest<{ embeddings: number[][] }>("/api/embed", {
            model: OLLAMA_MODEL,
            input: text,
        });

        logger.info("embeddings", "Generated embedding via Ollama", { length: text.length, model: OLLAMA_MODEL });
        return response.embeddings[0];
    } catch (error) {
        logger.error("embeddings", "Failed to generate embedding", { error: String(error) });
        throw error;
    }
}

export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
        const response = await ollamaRequest<{ embeddings: number[][] }>("/api/embed", {
            model: OLLAMA_MODEL,
            input: texts,
        });

        logger.info("embeddings", `Generated batch of ${texts.length} embeddings via Ollama`, { model: OLLAMA_MODEL });
        return response.embeddings;
    } catch (error) {
        logger.error("embeddings", "Failed to generate embedding batch", { error: String(error) });
        throw error;
    }
}
