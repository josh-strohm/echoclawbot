import fs from 'fs';
import path from 'path';
import { globalToolRegistry } from './registry';
import { OpenAI } from 'openai';
import 'dotenv/config';

async function analyzeImage(prompt: string, imageUrl?: string, imagePath?: string): Promise<string> {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not configured');
    }

    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    let finalImageUrl = imageUrl;
    
    if (imagePath) {
        let cleanPath = imagePath;
        if (cleanPath.startsWith('file:///')) {
            cleanPath = cleanPath.replace('file:///', '');
        } else if (cleanPath.startsWith('file://')) {
            cleanPath = cleanPath.replace('file://', '');
        }
        
        const WORKSPACE_ENV = process.env.AGENT_WORKSPACE || './agent_workspace';
        const BASE_DIR = path.resolve(process.cwd(), WORKSPACE_ENV);
        
        const sanitizedInput = cleanPath.replace(/^[\\/]+/, "");
        const resolvedPath = path.resolve(BASE_DIR, path.normalize(sanitizedInput));
        
        if (!resolvedPath.startsWith(BASE_DIR)) {
            throw new Error(`Access denied. Path is outside the designated workspace sandbox.`);
        }

        if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File not found: ${resolvedPath.replace(/\\/g, '/')} (resolved from workspace)`);
        }
        
        const ext = path.extname(resolvedPath).toLowerCase() || '.png';
        const mimeType = ext === '.jpeg' || ext === '.jpg' 
            ? 'image/jpeg' 
            : ext === '.png' ? 'image/png' 
            : ext === '.webp' ? 'image/webp' 
            : ext === '.gif' ? 'image/gif' 
            : 'image/jpeg';
            
        const base64Image = fs.readFileSync(resolvedPath).toString('base64');
        finalImageUrl = `data:${mimeType};base64,${base64Image}`;
    }
    
    if (!finalImageUrl) {
        throw new Error('Either imageUrl or imagePath must be provided.');
    }

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt || 'Describe this image in detail.' },
                    {
                        type: 'image_url',
                        image_url: {
                            url: finalImageUrl,
                        },
                    },
                ],
            },
        ],
        max_tokens: 1000,
    });

    return response.choices[0].message.content || '';
}

globalToolRegistry.register({
    name: 'analyze_image',
    description: 'Analyzes an image and answers questions about it or describes it. Can take a public image URL or a local file path.',
    parameters: {
        type: 'object',
        properties: {
            prompt: {
                type: 'string',
                description: 'The prompt or question about the image. Default: "Describe this image in detail."',
                default: 'Describe this image in detail.'
            },
            imageUrl: {
                type: 'string',
                description: 'Public URL of the image to analyze.'
            },
            imagePath: {
                type: 'string',
                description: 'Local file path of the image to analyze, relative to the workspace root.'
            }
        },
        required: []
    },
    execute: async (args: { prompt?: string; imageUrl?: string; imagePath?: string }) => {
        try {
            if (!args.imageUrl && !args.imagePath) {
                return {
                    status: 'error',
                    message: 'Must provide either imageUrl or imagePath'
                };
            }
            const result = await analyzeImage(args.prompt || 'Describe this image in detail.', args.imageUrl, args.imagePath);
            return {
                status: 'success',
                analysis: result
            };
        } catch (error: any) {
            return {
                status: 'error',
                message: error.message
            };
        }
    }
});

export { analyzeImage };
