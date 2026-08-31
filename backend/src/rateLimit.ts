import rateLimit from 'express-rate-limit';

/** Applied to the whole API: coarse defense against accidental or malicious floods. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Applied only to signup/login/Google auth: tight enough to blunt credential
 * stuffing and brute-force guessing without punishing normal use, since a real
 * user rarely needs more than a handful of auth attempts in 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
