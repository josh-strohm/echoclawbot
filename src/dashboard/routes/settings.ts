import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const settingsRouter = Router();

const envPath = path.resolve(process.cwd(), '.env');

function readEnv(): Record<string, string> {
    const vars: Record<string, string> = {};
    if (!fs.existsSync(envPath)) return vars;
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            vars[match[1].trim()] = match[2].trim();
        }
    });
    return vars;
}

function writeEnv(updates: Record<string, string>) {
    let content = '';
    if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
    }

    // update or append
    for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            content += `\n${key}=${value}`;
        }
    }

    fs.writeFileSync(envPath, content.trim() + '\n', 'utf-8');
}

settingsRouter.get('/keys', (req, res) => {
    const env = readEnv();
    res.json({
        OPEN_AI_KEY: env['OPENAI_API_KEY'] || '',
        OPENROUTER_API_KEY: env['OPENROUTER_API_KEY'] || '',
        GOOGLE_API_KEY: env['GOOGLE_API_KEY'] || '',
        ANTHROPIC_API_KEY: env['ANTHROPIC_API_KEY'] || ''
    });
});

settingsRouter.post('/keys', (req, res) => {
    const { openai, openrouter, google, anthropic } = req.body;
    const updates: Record<string, string> = {};
    if (openai !== undefined) updates['OPENAI_API_KEY'] = openai;
    if (openrouter !== undefined) updates['OPENROUTER_API_KEY'] = openrouter;
    if (google !== undefined) updates['GOOGLE_API_KEY'] = google;
    if (anthropic !== undefined) updates['ANTHROPIC_API_KEY'] = anthropic;

    writeEnv(updates);
    res.json({ success: true });
});
