/**
 * memory/embeddings.ts — OpenAI Embeddings Wrapper
 *
 * Wraps the OpenAI API to generate vector embeddings for text.
 * We use text-embedding-3-small which outputs 1536-dimensional vectors.
 */

import OpenAI from "openai";
import { OPENAI_API_KEY } from "../config.js";
import { logger } from "../logger.js";

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * Generate a vector embedding for a given string of text.
 * @param text The input text to embed.
 * @returns A 1536-dimensional float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: text,
            encoding_format: "float",
        });

        logger.info("embeddings", "Generated embedding", { length: text.length });
        return response.data[0].embedding;
    } catch (error) {
        logger.error("embeddings", "Failed to generate embedding", { error: String(error) });
        throw error;
    }
}

/**
 * Generate embeddings for an array of strings in a single batch.
 * @param texts Array of input strings.
 * @returns Array of 1536-dimensional float arrays.
 */
export async function generateEmbeddingsBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: texts,
            encoding_format: "float",
        });

        logger.info("embeddings", `Generated batch of ${texts.length} embeddings`);
        return response.data.map(d => d.embedding);
    } catch (error) {
        logger.error("embeddings", "Failed to generate embedding batch", { error: String(error) });
        throw error;
    }
}
