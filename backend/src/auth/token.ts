import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): string {
  const payload = jwt.verify(token, config.JWT_SECRET);
  if (typeof payload === 'string' || typeof payload.sub !== 'string') {
    throw new Error('Invalid token payload');
  }
  return payload.sub;
}
