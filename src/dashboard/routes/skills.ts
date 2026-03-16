import { Router } from 'express';
import { globalToolRegistry } from '../../tools/registry';

export const skillsRouter = Router();

skillsRouter.get('/', (req, res) => {
    try {
        const schemas = globalToolRegistry.getSchemas();
        res.json(schemas);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});
