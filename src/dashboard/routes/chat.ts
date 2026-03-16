import { Router } from 'express';

export const chatRouter = Router();

let currentAgent: any = null;

export function setDashboardAgent(agent: any) {
    currentAgent = agent;
}

export function getDashboardAgent(): any {
    return currentAgent;
}

chatRouter.post('/send', async (req, res) => {
    try {
        if (!currentAgent) {
            return res.status(500).json({ error: "Agent not initialized for dashboard." });
        }
        const { message, image } = req.body;
        if (!message && !image) {
            return res.status(400).json({ error: "Message or image is required." });
        }

        // Run against agent context, passing image if present
        const response = await currentAgent.run(message || "Analyzing image...", 5, image);
        res.json({ response });
    } catch (e: any) {
        console.error("[Dashboard Chat Error]", e);
        res.status(500).json({ error: e.message });
    }
});
