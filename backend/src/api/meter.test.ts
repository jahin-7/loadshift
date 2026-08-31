import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const db = {
  meterReading: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
};

vi.mock('../db/prisma.js', () => ({ prisma: db }));

process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
process.env.JWT_EXPIRES_IN = '1h';

const { createApp } = await import('../app.js');
const { signToken } = await import('../auth/token.js');
const app = createApp();

const userId = 'user-1';
const authHeader = { Authorization: `Bearer ${signToken(userId)}` };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/v1/meter', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/v1/meter').send({ date: '2026-01-01', readingKwh: 100 });
    expect(res.status).toBe(401);
  });

  it('rejects a malformed date', async () => {
    const res = await request(app)
      .post('/api/v1/meter')
      .set(authHeader)
      .send({ date: '01/01/2026', readingKwh: 100 });
    expect(res.status).toBe(422);
  });

  it('rejects a negative reading', async () => {
    const res = await request(app)
      .post('/api/v1/meter')
      .set(authHeader)
      .send({ date: '2026-01-01', readingKwh: -5 });
    expect(res.status).toBe(422);
  });

  it('creates a reading', async () => {
    db.meterReading.create.mockResolvedValue({
      id: 'reading-1',
      date: new Date('2026-01-01T00:00:00.000Z'),
      readingKwh: 1200,
      note: null,
    });
    const res = await request(app)
      .post('/api/v1/meter')
      .set(authHeader)
      .send({ date: '2026-01-01', readingKwh: 1200 });
    expect(res.status).toBe(201);
    expect(res.body.reading).toMatchObject({ date: '2026-01-01', readingKwh: 1200 });
  });
});

describe('GET /api/v1/meter', () => {
  it('lists readings sorted by date, formatted as YYYY-MM-DD', async () => {
    db.meterReading.findMany.mockResolvedValue([
      { id: 'a', date: new Date('2026-01-01T00:00:00.000Z'), readingKwh: 1000, note: null },
      { id: 'b', date: new Date('2026-02-01T00:00:00.000Z'), readingKwh: 1150, note: 'after repair' },
    ]);
    const res = await request(app).get('/api/v1/meter').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.readings).toHaveLength(2);
    expect(res.body.readings[1].date).toBe('2026-02-01');
  });
});

describe('DELETE /api/v1/meter/:id', () => {
  it('returns 404 for a reading owned by someone else', async () => {
    db.meterReading.findUnique.mockResolvedValue({ id: 'r1', userId: 'someone-else' });
    const res = await request(app).delete('/api/v1/meter/r1').set(authHeader);
    expect(res.status).toBe(404);
  });

  it('deletes an owned reading', async () => {
    db.meterReading.findUnique.mockResolvedValue({ id: 'r1', userId });
    db.meterReading.delete.mockResolvedValue({});
    const res = await request(app).delete('/api/v1/meter/r1').set(authHeader);
    expect(res.status).toBe(204);
  });
});
