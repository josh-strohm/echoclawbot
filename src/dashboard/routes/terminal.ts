import { Router } from 'express';
import { exec } from 'child_process';
import * as os from 'os';

export const terminalRouter = Router();

terminalRouter.post('/run', (req, res) => {
    const cmd = req.body.command as string || '';

    // Danger Zone: Direct execution layer for full dashboard app control 
    // Uses the agent's root workspace, or the overall process path
    const targetCwd = process.env.AGENT_WORKSPACE || process.cwd();

    exec(cmd, { cwd: targetCwd }, (error, stdout, stderr) => {
        if (error) {
            return res.json({ output: stderr || error.message, error: true });
        }
        res.json({ output: stdout || stderr || 'Success', error: false });
    });
});
