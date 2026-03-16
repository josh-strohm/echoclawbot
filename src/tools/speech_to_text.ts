import { globalToolRegistry } from './registry';
import 'dotenv/config';

interface TranscriptionResult {
    text: string;
    language?: string;
    duration?: number;
}

async function transcribeAudio(audioBuffer: Buffer, filename: string): Promise<TranscriptionResult> {
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not configured');
    }

    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/webm' });
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    return {
        text: data.text,
    };
}

globalToolRegistry.register({
    name: 'speech_to_text',
    description: 'Transcribes spoken audio into text using Groq Whisper API. Accepts audio data and returns the transcribed text.',
    parameters: {
        type: 'object',
        properties: {
            audioData: {
                type: 'string',
                description: 'Base64 encoded audio data to transcribe.'
            },
            filename: {
                type: 'string',
                description: 'The filename for the audio (e.g., "audio.ogg").',
                default: 'audio.ogg'
            }
        },
        required: ['audioData']
    },
    execute: async (args: { audioData: string; filename?: string }) => {
        try {
            const audioBuffer = Buffer.from(args.audioData, 'base64');
            const result = await transcribeAudio(audioBuffer, args.filename || 'audio.ogg');
            return {
                status: 'success',
                text: result.text,
                language: result.language,
                duration: result.duration
            };
        } catch (error: any) {
            return {
                status: 'error',
                message: error.message
            };
        }
    }
});

export { transcribeAudio };
