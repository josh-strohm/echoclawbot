/**
 * tts.ts — Text-to-speech via ElevenLabs API.
 *
 * Flow:
 *   1. Takes a text string
 *   2. Sends it to ElevenLabs TTS endpoint
 *   3. Returns raw audio bytes (mp3) as a Buffer
 *
 * Uses the REST API directly — no SDK dependency needed.
 * Audio is never saved to disk — streamed in memory only.
 */

import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from "./config.js";
import { logger } from "./logger.js";

// ElevenLabs has a ~5000 char limit per request.
// We truncate to stay safely under it.
const MAX_TTS_CHARS = 4500;

/**
 * Convert text to speech using ElevenLabs.
 *
 * @param text - The text to speak
 * @returns Buffer containing MP3 audio data
 */
export async function textToSpeech(text: string): Promise<Buffer> {
    // Truncate if too long for the API
    let inputText = text;
    if (inputText.length > MAX_TTS_CHARS) {
        inputText = inputText.slice(0, MAX_TTS_CHARS) + "...";
        logger.warn("tts", "Text truncated for TTS", {
            originalLength: text.length,
            truncatedTo: MAX_TTS_CHARS,
        });
    }

    // Strip markdown formatting — TTS should read clean prose
    inputText = stripMarkdown(inputText);

    if (!inputText.trim()) {
        throw new Error("No text to speak after cleanup");
    }

    logger.info("tts", "Requesting speech from ElevenLabs", {
        textLength: inputText.length,
        voiceId: ELEVENLABS_VOICE_ID,
    });

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
        },
        body: JSON.stringify({
            text: inputText,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        logger.error("tts", "ElevenLabs API error", {
            status: response.status,
            body: errorBody.slice(0, 500),
        });
        throw new Error(`ElevenLabs API error: HTTP ${response.status} — ${errorBody.slice(0, 200)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.info("tts", "Speech generated", {
        audioSizeBytes: buffer.length,
    });

    return buffer;
}

/**
 * Strip common markdown formatting so TTS reads cleanly.
 * Removes: bold, italic, code blocks, links, headers, etc.
 */
function stripMarkdown(text: string): string {
    return text
        // Remove code blocks (``` ... ```)
        .replace(/```[\s\S]*?```/g, "")
        // Remove inline code (`...`)
        .replace(/`([^`]*)`/g, "$1")
        // Remove bold (**...**)
        .replace(/\*\*([^*]*)\*\*/g, "$1")
        // Remove italic (*...* or _..._)
        .replace(/\*([^*]*)\*/g, "$1")
        .replace(/_([^_]*)_/g, "$1")
        // Remove headers (# ...)
        .replace(/^#{1,6}\s+/gm, "")
        // Remove links [text](url) → text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        // Remove bullet points
        .replace(/^[\s]*[-*+]\s+/gm, "")
        // Collapse multiple newlines
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
