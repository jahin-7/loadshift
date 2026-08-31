import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const db = {
  user: { findUnique: vi.fn() },
  plan: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  cut: { deleteMany: vi.fn() },
  job: { update: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
};

vi.mock('../db/prisma.js', () => ({ prisma: db }));

process.env.JWT_SECRET = 'test-secret-at-least-16-chars';
process.env.JWT_EXPIRES_IN = '1h';

const { createApp } = await import('../app.js');
const { signToken } = await import('../auth/token.js');
const app = createApp();

const userId = 'user-1';
const authHeader = { Authorization: `Bearer ${signToken(userId)}` };

const userFixture = {
  id: userId,
  email: 'shopowner@example.com',
  shopName: 'City Print Point',
  generatorLitersPerHour: 1.2,
  fuelPricePerLiter: 115,
};

function planFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'plan-1',
    userId,
    label: 'Tuesday',
    shopOpenMinutes: 540,
    shopCloseMinutes: 600,
    generatorLitersPerHour: 1.2,
    fuelPricePerLiter: 115,
    feasible: true,
    totalGeneratorMinutes: 0,
    totalGeneratorCost: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    cuts: [],
    jobs: [
      {
        id: 'job-1',
        planId: 'plan-1',
        name: 'A0 banner',
        minutes: 30,
        power: 'grid',
        scheduledStart: 540,
        scheduledEnd: 570,
        actualPower: 'grid',
        sequence: 0,
        unscheduled: false,
        manuallyPlaced: false,
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('POST /api/v1/plans', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/v1/plans').send({});
    expect(res.status).toBe(401);
  });

  it('rejects invalid body', async () => {
    const res = await request(app)
      .post('/api/v1/plans')
      .set(authHeader)
      .send({ label: '', shopOpen: '09:00', shopClose: '20:00', cuts: [], jobs: [] });
    expect(res.status).toBe(422);
  });

  it('creates a plan and returns the auto-computed schedule', async () => {
    db.user.findUnique.mockResolvedValue(userFixture);
    db.plan.create.mockResolvedValue(planFixture({ feasible: null, totalGeneratorMinutes: null, totalGeneratorCost: null }));
    db.job.update.mockResolvedValue({});
    db.plan.update.mockResolvedValue({});
    db.plan.findUnique.mockResolvedValue(planFixture());

    const res = await request(app)
      .post('/api/v1/plans')
      .set(authHeader)
      .send({
        label: 'Tuesday',
        shopOpen: '09:00',
        shopClose: '10:00',
        cuts: [],
        jobs: [{ name: 'A0 banner', minutes: 30, power: 'grid' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.plan.feasible).toBe(true);
    expect(res.body.plan.jobs[0]).toMatchObject({ name: 'A0 banner', scheduledStart: '09:00', scheduledEnd: '09:30' });
    expect(db.job.update).toHaveBeenCalled();
    expect(db.plan.update).toHaveBeenCalled();
  });
});

describe('GET /api/v1/plans/:id', () => {
  it('returns 404 for a plan owned by someone else', async () => {
    db.plan.findUnique.mockResolvedValue(planFixture({ userId: 'someone-else' }));
    const res = await request(app).get('/api/v1/plans/plan-1').set(authHeader);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a nonexistent plan', async () => {
    db.plan.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/v1/plans/nope').set(authHeader);
    expect(res.status).toBe(404);
  });

  it('returns the plan with HH:MM formatted times', async () => {
    db.plan.findUnique.mockResolvedValue(planFixture());
    const res = await request(app).get('/api/v1/plans/plan-1').set(authHeader);
    expect(res.status).toBe(200);
    expect(res.body.plan.shopOpen).toBe('09:00');
    expect(res.body.plan.shopClose).toBe('10:00');
  });
});

describe('POST /api/v1/plans/:id/manual-schedule', () => {
  it('rejects an overlapping manual placement without persisting', async () => {
    db.plan.findUnique.mockResolvedValue(
      planFixture({
        jobs: [
          { id: 'job-1', planId: 'plan-1', name: 'A', minutes: 30, power: 'none', scheduledStart: null, scheduledEnd: null, actualPower: null, sequence: null, unscheduled: false, manuallyPlaced: false },
          { id: 'job-2', planId: 'plan-1', name: 'B', minutes: 30, power: 'none', scheduledStart: null, scheduledEnd: null, actualPower: null, sequence: null, unscheduled: false, manuallyPlaced: false },
        ],
      }),
    );

    const res = await request(app)
      .post('/api/v1/plans/plan-1/manual-schedule')
      .set(authHeader)
      .send({
        placements: [
          { jobId: 'job-1', start: '09:00' },
          { jobId: 'job-2', start: '09:10' },
        ],
      });

    expect(res.status).toBe(422);
    expect(res.body.details.length).toBeGreaterThan(0);
    expect(db.job.update).not.toHaveBeenCalled();
  });

  it('persists a valid manual placement', async () => {
    const plan = planFixture({
      jobs: [
        { id: 'job-1', planId: 'plan-1', name: 'A', minutes: 30, power: 'none', scheduledStart: null, scheduledEnd: null, actualPower: null, sequence: null, unscheduled: false, manuallyPlaced: false },
      ],
    });
    db.plan.findUnique.mockResolvedValueOnce(plan).mockResolvedValueOnce(plan);
    db.job.update.mockResolvedValue({});
    db.plan.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/plans/plan-1/manual-schedule')
      .set(authHeader)
      .send({ placements: [{ jobId: 'job-1', start: '09:00' }] });

    expect(res.status).toBe(200);
    expect(db.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ manuallyPlaced: true }) }),
    );
  });
});

describe('DELETE /api/v1/plans/:id', () => {
  it('deletes an owned plan', async () => {
    db.plan.findUnique.mockResolvedValue(planFixture());
    db.plan.delete.mockResolvedValue({});
    const res = await request(app).delete('/api/v1/plans/plan-1').set(authHeader);
    expect(res.status).toBe(204);
    expect(db.plan.delete).toHaveBeenCalledWith({ where: { id: 'plan-1' } });
  });
});

describe('job attachment routes', () => {
  it('rejects an attachment request for a job on a plan owned by someone else', async () => {
    db.plan.findUnique.mockResolvedValue(planFixture({ userId: 'someone-else' }));
    const res = await request(app).get('/api/v1/plans/plan-1/jobs/job-1/attachment').set(authHeader);
    expect(res.status).toBe(404);
  });

  it('returns 404 when the job has no attachment', async () => {
    db.plan.findUnique.mockResolvedValue(planFixture());
    const res = await request(app).get('/api/v1/plans/plan-1/jobs/job-1/attachment').set(authHeader);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown job id on an owned plan', async () => {
    db.plan.findUnique.mockResolvedValue(planFixture());
    const res = await request(app).get('/api/v1/plans/plan-1/jobs/not-a-real-job/attachment').set(authHeader);
    expect(res.status).toBe(404);
  });
});
