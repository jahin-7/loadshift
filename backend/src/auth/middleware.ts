import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from './token.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token.' });
    return;
  }
  try {
    req.userId = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
