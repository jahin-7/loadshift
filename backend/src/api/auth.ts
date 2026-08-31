import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { signToken } from '../auth/token.js';
import { requireAuth } from '../auth/middleware.js';
import { ApiError } from './errors.js';
import { config } from '../config.js';
import { formatTime, parseTime } from '../engine/time.js';
import { authLimiter } from '../rateLimit.js';
import type { User } from '@prisma/client';

const router = Router();
const googleClient = config.GOOGLE_CLIENT_ID ? new OAuth2Client(config.GOOGLE_CLIENT_ID) : null;

const signupSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters.'),
  shopName: z.string().trim().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    shopName: user.shopName,
    hasPassword: user.passwordHash !== null,
    generatorLitersPerHour: user.generatorLitersPerHour,
    fuelPricePerLiter: user.fuelPricePerLiter,
    hasGenerator: user.hasGenerator,
    hasSolar: user.hasSolar,
    solarStart: user.solarStartMinutes === null ? null : formatTime(user.solarStartMinutes),
    solarEnd: user.solarEndMinutes === null ? null : formatTime(user.solarEndMinutes),
  };
}

router.post('/auth/signup', authLimiter, async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? 'Invalid signup data.');
  const { email, password, shopName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new ApiError(409, 'An account with that email already exists.');

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({ data: { email, passwordHash, shopName } });

  const token = signToken(user.id);
  res.status(201).json({ token, user: toPublicUser(user) });
});

router.post('/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Email and password are required.');
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) throw new ApiError(401, 'Invalid email or password.');

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) throw new ApiError(401, 'Invalid email or password.');

  const token = signToken(user.id);
  res.json({ token, user: toPublicUser(user) });
});

const googleSchema = z.object({ credential: z.string().min(10) });

router.post('/auth/google', authLimiter, async (req, res) => {
  if (!googleClient) throw new ApiError(503, 'Google sign-in is not configured on this server.');
  const parsed = googleSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Missing Google credential.');

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: config.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw new ApiError(401, 'Invalid Google credential.');
  }
  if (!payload?.sub || !payload.email) throw new ApiError(401, 'Google credential is missing required fields.');

  const email = payload.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    user = existingByEmail
      ? await prisma.user.update({ where: { id: existingByEmail.id }, data: { googleId: payload.sub } })
      : await prisma.user.create({
          data: { email, googleId: payload.sub, shopName: payload.name ?? email.split('@')[0] ?? 'My shop' },
        });
  }

  const token = signToken(user.id);
  res.json({ token, user: toPublicUser(user) });
});

router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) throw new ApiError(401, 'User no longer exists.');
  res.json({ user: toPublicUser(user) });
});

const settingsSchema = z.object({
  shopName: z.string().trim().min(1).max(120).optional(),
  generatorLitersPerHour: z.number().positive().max(50).optional(),
  fuelPricePerLiter: z.number().positive().max(10000).optional(),
  hasGenerator: z.boolean().optional(),
  hasSolar: z.boolean().optional(),
  solarStart: z
    .string()
    .refine((v) => {
      try {
        parseTime(v);
        return true;
      } catch {
        return false;
      }
    }, 'Must be an HH:MM time.')
    .optional(),
  solarEnd: z
    .string()
    .refine((v) => {
      try {
        parseTime(v);
        return true;
      } catch {
        return false;
      }
    }, 'Must be an HH:MM time.')
    .optional(),
});

router.patch('/me', requireAuth, async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? 'Invalid settings.');
  const { solarStart, solarEnd, ...rest } = parsed.data;

  const user = await prisma.user.update({
    where: { id: req.userId! },
    data: {
      ...rest,
      ...(solarStart !== undefined ? { solarStartMinutes: parseTime(solarStart) } : {}),
      ...(solarEnd !== undefined ? { solarEndMinutes: parseTime(solarEnd) } : {}),
    },
  });
  res.json({ user: toPublicUser(user) });
});

export default router;
