import { Request, Response, NextFunction } from 'express';

const ipCache = new Map<string, { count: number, resetTime: number }>();
const LIMIT = 100;
const WINDOW_MS = 60 * 1000;

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    let record = ipCache.get(ip);
    if (!record || now > record.resetTime) {
        record = { count: 1, resetTime: now + WINDOW_MS };
        ipCache.set(ip, record);
        return next();
    }

    record.count++;
    if (record.count > LIMIT) {
        return res.status(429).json({ error: 'Too many requests, please try again later.' });
    }

    next();
}
