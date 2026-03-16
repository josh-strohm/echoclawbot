import { Request, Response, NextFunction } from 'express';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = process.env.DASHBOARD_AUTH_TOKEN;
    if (!token) {
        return next();
    }

    const authHeader = req.headers.authorization;
    const queryToken = req.query.token;

    let providedToken = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        providedToken = authHeader.substring(7);
    } else if (queryToken) {
        providedToken = queryToken as string;
    }

    if (providedToken === token) {
        return next();
    }

    res.status(401).json({ error: 'Unauthorized' });
}
