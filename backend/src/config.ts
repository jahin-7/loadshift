import { z } from 'zod';

const schema = z.object({
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be set and at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().default(4100),
  FRONTEND_ORIGIN: z.string().default('http://localhost:5173'),
  GOOGLE_CLIENT_ID: z.string().optional(),
});

export const config = schema.parse(process.env);
