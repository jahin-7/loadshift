import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

const db = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock('../db/prisma.js', () => ({ prisma: db }));

process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
process.env.JWT_EXPIRES_IN = '1h';

const { createApp } = await import('../app.js');
const app = createApp();

const baseUser = {
  id: 'user-1',
  email: 'shopowner@example.com',
  shopName: 'City Print Point',
  generatorLitersPerHour: 1.2,
  fuelPricePerLiter: 115,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/auth/signup', () => {
  it('creates a user and returns a token', async () => {
    db.user.findUnique.mockResolvedValue(null);
    db.user.create.mockResolvedValue({ ...baseUser, passwordHash: 'irrelevant' });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'ShopOwner@Example.com', password: 'goodpassword', shopName: 'City Print Point' });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'shopowner@example.com', shopName: 'City Print Point' });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects a duplicate email', async () => {
    db.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: 'x' });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: baseUser.email, password: 'goodpassword', shopName: 'X' });

    expect(res.status).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@b.com', password: 'short', shopName: 'X' });
    expect(res.status).toBe(422);
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'goodpassword', shopName: 'X' });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('logs in with the correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    db.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: baseUser.email, password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 4);
    db.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: baseUser.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email without leaking which field was wrong', async () => {
    db.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever1' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid email or password.');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('requires a bearer token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects a garbage token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/v1/me', () => {
  it('updates generator settings', async () => {
    const { signToken } = await import('../auth/token.js');
    db.user.update.mockResolvedValue({ ...baseUser, generatorLitersPerHour: 2, passwordHash: 'x' });

    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${signToken(baseUser.id)}`)
      .send({ generatorLitersPerHour: 2 });

    expect(res.status).toBe(200);
    expect(res.body.user.generatorLitersPerHour).toBe(2);
  });

  it('rejects a non-positive fuel price', async () => {
    const { signToken } = await import('../auth/token.js');
    const res = await request(app)
      .patch('/api/v1/me')
      .set('Authorization', `Bearer ${signToken(baseUser.id)}`)
      .send({ fuelPricePerLiter: -5 });
    expect(res.status).toBe(422);
  });
});
