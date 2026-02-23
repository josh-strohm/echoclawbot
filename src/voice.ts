/**
 * voice.ts — Voice message transcription via OpenAI Whisper.
 *
 * Flow:
 *   1. Telegram gives us a file_id for the voice message
 *   2. We download the .ogg file via Telegram's getFile API
 *   3. We send it to OpenAI Whisper for transcription
 *   4. Return the transcript text
 *
 * No audio is stored on disk — everything streams through memory.
 */

import OpenAI from "openai";
import { OPENAI_API_KEY, TELEGRAM_BOT_TOKEN } from "./config.js";
import { logger } from "./logger.js";

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/**
 * Download a file from Telegram's servers by file_id.
 * Returns the file as a Buffer + the file path from Telegram.
 */
async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; filePath: string }> {
    // Step 1: Get the file path from Telegram
    const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfoRes = await fetch(fileInfoUrl);
    const fileInfo = (await fileInfoRes.json()) as {
        ok: boolean;
        result?: { file_path?: string };
    };

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
        throw new Error("Failed to get file info from Telegram");
    }

    const filePath = fileInfo.result.file_path;

    // Step 2: Download the actual file
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileRes = await fetch(fileUrl);

    if (!fileRes.ok) {
        throw new Error(`Failed to download file: HTTP ${fileRes.status}`);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.info("voice", "Downloaded voice file", {
        filePath,
        sizeBytes: buffer.length,
    });

    return { buffer, filePath };
}

/**
 * Transcribe a voice message using OpenAI Whisper.
 *
 * @param fileId - Telegram file_id for the voice message
 * @returns The transcribed text
 */
export async function transcribeVoice(fileId: string): Promise<string> {
    // Download the voice file from Telegram
    const { buffer, filePath } = await downloadTelegramFile(fileId);

    // Determine file extension (Telegram voice messages are usually .oga or .ogg)
    const extension = filePath.split(".").pop() || "ogg";
    const fileName = `voice.${extension}`;

    // Create a File object from the buffer for the OpenAI API
    // Use Uint8Array to avoid Buffer/BlobPart type mismatch
    const uint8 = new Uint8Array(buffer);
    const file = new File([uint8], fileName, {
        type: extension === "oga" ? "audio/ogg" : `audio/${extension}`,
    });

    logger.info("voice", "Sending to Whisper for transcription", {
        fileName,
        sizeBytes: buffer.length,
    });

    // Call Whisper
    const transcription = await openai.audio.transcriptions.create({
        model: "whisper-1",
        file,
        response_format: "text",
    });

    const text = typeof transcription === "string"
        ? transcription.trim()
        : (transcription as unknown as { text: string }).text?.trim() || "";

    logger.info("voice", "Transcription complete", {
        textLength: text.length,
    });

    return text;
}
