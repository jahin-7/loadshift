import { Router } from 'express';
import { z } from 'zod';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { ApiError } from './errors.js';
import { computeSchedule } from '../engine/schedule.js';
import { scoreManualSchedule } from '../engine/manual.js';
import { generatorCost } from '../engine/cost.js';
import { formatTime, parseTime } from '../engine/time.js';
import { UPLOAD_DIR, uploadAttachment } from '../upload.js';
import type { ShopCapabilities } from '../engine/types.js';
import type { Cut, Job, Plan } from '@prisma/client';

const router = Router();
router.use(requireAuth);

const timeString = z.string().refine((v) => {
  try {
    parseTime(v);
    return true;
  } catch {
    return false;
  }
}, 'Must be an HH:MM time.');

const powerKind = z.enum(['grid', 'flexible', 'solar', 'none']);

const jobInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  minutes: z.number().int().positive().max(24 * 60),
  power: powerKind,
});

const cutInputSchema = z
  .object({ start: timeString, end: timeString })
  .refine((c) => parseTime(c.end) > parseTime(c.start), { message: 'Cut end must be after start.' });

const planInputSchema = z
  .object({
    label: z.string().trim().min(1).max(120),
    shopOpen: timeString,
    shopClose: timeString,
    cuts: z.array(cutInputSchema).max(50),
    jobs: z.array(jobInputSchema).min(1).max(200),
  })
  .refine((p) => parseTime(p.shopClose) > parseTime(p.shopOpen), {
    message: 'shopClose must be after shopOpen.',
    path: ['shopClose'],
  });

type PlanWithRelations = Plan & { cuts: Cut[]; jobs: Job[] };

function planCapabilities(plan: PlanWithRelations): ShopCapabilities {
  return {
    hasGenerator: plan.hasGenerator,
    hasSolar: plan.hasSolar,
    solarStart: plan.solarStartMinutes ?? undefined,
    solarEnd: plan.solarEndMinutes ?? undefined,
  };
}

function serializePlan(plan: PlanWithRelations) {
  return {
    id: plan.id,
    label: plan.label,
    shopOpen: formatTime(plan.shopOpenMinutes),
    shopClose: formatTime(plan.shopCloseMinutes),
    generatorLitersPerHour: plan.generatorLitersPerHour,
    fuelPricePerLiter: plan.fuelPricePerLiter,
    hasGenerator: plan.hasGenerator,
    hasSolar: plan.hasSolar,
    solarStart: plan.solarStartMinutes === null ? null : formatTime(plan.solarStartMinutes),
    solarEnd: plan.solarEndMinutes === null ? null : formatTime(plan.solarEndMinutes),
    feasible: plan.feasible,
    totalGeneratorMinutes: plan.totalGeneratorMinutes,
    totalSolarMinutes: plan.totalSolarMinutes,
    totalGeneratorCost: plan.totalGeneratorCost,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    cuts: plan.cuts
      .slice()
      .sort((a, b) => a.startMinutes - b.startMinutes)
      .map((c) => ({ id: c.id, start: formatTime(c.startMinutes), end: formatTime(c.endMinutes) })),
    jobs: plan.jobs
      .slice()
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
      .map((j) => ({
        id: j.id,
        name: j.name,
        minutes: j.minutes,
        power: j.power,
        scheduledStart: j.scheduledStart === null ? null : formatTime(j.scheduledStart),
        scheduledEnd: j.scheduledEnd === null ? null : formatTime(j.scheduledEnd),
        actualPower: j.actualPower,
        unscheduled: j.unscheduled,
        manuallyPlaced: j.manuallyPlaced,
        attachment: j.attachmentName ? { name: j.attachmentName, mime: j.attachmentMime } : null,
      })),
  };
}

async function loadOwnedPlan(planId: string, userId: string): Promise<PlanWithRelations> {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { cuts: true, jobs: true },
  });
  if (!plan || plan.userId !== userId) throw new ApiError(404, 'Plan not found.');
  return plan;
}

/** Runs the auto-planner and persists the result onto the plan's jobs. */
async function autoScheduleAndPersist(plan: PlanWithRelations): Promise<PlanWithRelations> {
  const result = computeSchedule({
    shopOpen: plan.shopOpenMinutes,
    shopClose: plan.shopCloseMinutes,
    cuts: plan.cuts.map((c) => ({ start: c.startMinutes, end: c.endMinutes })),
    jobs: plan.jobs.map((j) => ({ id: j.id, name: j.name, minutes: j.minutes, power: j.power as never })),
    capabilities: planCapabilities(plan),
  });

  const cost = generatorCost(result.totalGeneratorMinutes, plan.generatorLitersPerHour, plan.fuelPricePerLiter);
  const scheduledById = new Map(result.scheduled.map((j, index) => [j.id, { ...j, sequence: index }]));

  await prisma.$transaction([
    ...plan.jobs.map((job) => {
      const placed = scheduledById.get(job.id);
      return prisma.job.update({
        where: { id: job.id },
        data: placed
          ? {
              scheduledStart: placed.start,
              scheduledEnd: placed.end,
              actualPower: placed.actualPower,
              sequence: placed.sequence,
              unscheduled: false,
              manuallyPlaced: false,
            }
          : {
              scheduledStart: null,
              scheduledEnd: null,
              actualPower: null,
              sequence: null,
              unscheduled: true,
              manuallyPlaced: false,
            },
      });
    }),
    prisma.plan.update({
      where: { id: plan.id },
      data: {
        feasible: result.feasible,
        totalGeneratorMinutes: result.totalGeneratorMinutes,
        totalSolarMinutes: result.totalSolarMinutes,
        totalGeneratorCost: cost,
      },
    }),
  ]);

  return loadOwnedPlan(plan.id, plan.userId);
}

router.post('/plans', async (req, res) => {
  const parsed = planInputSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? 'Invalid plan data.');
  const input = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) throw new ApiError(401, 'User no longer exists.');

  const created = await prisma.plan.create({
    data: {
      userId: user.id,
      label: input.label,
      shopOpenMinutes: parseTime(input.shopOpen),
      shopCloseMinutes: parseTime(input.shopClose),
      generatorLitersPerHour: user.generatorLitersPerHour,
      fuelPricePerLiter: user.fuelPricePerLiter,
      hasGenerator: user.hasGenerator,
      hasSolar: user.hasSolar,
      solarStartMinutes: user.solarStartMinutes,
      solarEndMinutes: user.solarEndMinutes,
      cuts: { create: input.cuts.map((c) => ({ startMinutes: parseTime(c.start), endMinutes: parseTime(c.end) })) },
      jobs: { create: input.jobs.map((j) => ({ name: j.name, minutes: j.minutes, power: j.power })) },
    },
    include: { cuts: true, jobs: true },
  });

  const scheduled = await autoScheduleAndPersist(created);
  res.status(201).json({ plan: serializePlan(scheduled) });
});

router.get('/plans', async (req, res) => {
  const plans = await prisma.plan.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: 'desc' },
    include: { cuts: true, jobs: true },
  });
  res.json({ plans: plans.map(serializePlan) });
});

router.get('/plans/:id', async (req, res) => {
  const plan = await loadOwnedPlan(req.params.id!, req.userId!);
  res.json({ plan: serializePlan(plan) });
});

router.put('/plans/:id', async (req, res) => {
  const parsed = planInputSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? 'Invalid plan data.');
  const input = parsed.data;

  const existing = await loadOwnedPlan(req.params.id!, req.userId!);

  await prisma.$transaction([
    prisma.cut.deleteMany({ where: { planId: existing.id } }),
    prisma.job.deleteMany({ where: { planId: existing.id } }),
    prisma.plan.update({
      where: { id: existing.id },
      data: {
        label: input.label,
        shopOpenMinutes: parseTime(input.shopOpen),
        shopCloseMinutes: parseTime(input.shopClose),
        cuts: { create: input.cuts.map((c) => ({ startMinutes: parseTime(c.start), endMinutes: parseTime(c.end) })) },
        jobs: { create: input.jobs.map((j) => ({ name: j.name, minutes: j.minutes, power: j.power })) },
      },
    }),
  ]);

  const reloaded = await loadOwnedPlan(existing.id, req.userId!);
  const scheduled = await autoScheduleAndPersist(reloaded);
  res.json({ plan: serializePlan(scheduled) });
});

router.post('/plans/:id/auto-schedule', async (req, res) => {
  const plan = await loadOwnedPlan(req.params.id!, req.userId!);
  const scheduled = await autoScheduleAndPersist(plan);
  res.json({ plan: serializePlan(scheduled) });
});

const manualPlacementSchema = z.object({
  placements: z.array(z.object({ jobId: z.string(), start: timeString })),
});

router.post('/plans/:id/manual-schedule', async (req, res) => {
  const plan = await loadOwnedPlan(req.params.id!, req.userId!);
  const parsed = manualPlacementSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, 'Invalid placement data.');

  const result = scoreManualSchedule(
    plan.shopOpenMinutes,
    plan.shopCloseMinutes,
    plan.cuts.map((c) => ({ start: c.startMinutes, end: c.endMinutes })),
    plan.jobs.map((j) => ({ id: j.id, name: j.name, minutes: j.minutes, power: j.power as never })),
    parsed.data.placements.map((p) => ({ jobId: p.jobId, start: parseTime(p.start) })),
    planCapabilities(plan),
  );

  if (!result.valid) {
    res.status(422).json({ error: 'Manual placement is invalid.', details: result.errors });
    return;
  }

  const cost = generatorCost(result.totalGeneratorMinutes, plan.generatorLitersPerHour, plan.fuelPricePerLiter);
  const scheduledById = new Map(result.scheduled.map((j, index) => [j.id, { ...j, sequence: index }]));

  await prisma.$transaction([
    ...plan.jobs.map((job) => {
      const placed = scheduledById.get(job.id);
      return prisma.job.update({
        where: { id: job.id },
        data: placed
          ? {
              scheduledStart: placed.start,
              scheduledEnd: placed.end,
              // A straddling job can earn both solar and generator minutes at once; if any
              // fuel was spent at all that's the more important thing to surface on the badge.
              actualPower:
                placed.generatorMinutes > 0
                  ? 'generator'
                  : placed.solarMinutes > 0
                    ? 'solar'
                    : job.power === 'none'
                      ? 'none'
                      : 'grid',
              sequence: placed.sequence,
              unscheduled: false,
              manuallyPlaced: true,
            }
          : { scheduledStart: null, scheduledEnd: null, actualPower: null, sequence: null, unscheduled: true, manuallyPlaced: true },
      });
    }),
    prisma.plan.update({
      where: { id: plan.id },
      data: {
        feasible: result.unscheduled.length === 0,
        totalGeneratorMinutes: result.totalGeneratorMinutes,
        totalSolarMinutes: result.totalSolarMinutes,
        totalGeneratorCost: cost,
      },
    }),
  ]);

  const reloaded = await loadOwnedPlan(plan.id, req.userId!);
  res.json({ plan: serializePlan(reloaded) });
});

async function loadOwnedJob(planId: string, jobId: string, userId: string): Promise<Job> {
  const plan = await loadOwnedPlan(planId, userId);
  const job = plan.jobs.find((j) => j.id === jobId);
  if (!job) throw new ApiError(404, 'Job not found.');
  return job;
}

router.post('/plans/:planId/jobs/:jobId/attachment', uploadAttachment.single('file'), async (req, res) => {
  const job = await loadOwnedJob(String(req.params.planId), String(req.params.jobId), req.userId!);
  if (!req.file) throw new ApiError(422, 'No file was uploaded.');

  if (job.attachmentPath) {
    await unlink(path.join(UPLOAD_DIR, job.attachmentPath)).catch(() => {});
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      attachmentPath: req.file.filename,
      attachmentName: req.file.originalname,
      attachmentMime: req.file.mimetype,
    },
  });
  res.status(201).json({ attachment: { name: req.file.originalname, mime: req.file.mimetype } });
});

router.get('/plans/:planId/jobs/:jobId/attachment', async (req, res) => {
  const job = await loadOwnedJob(String(req.params.planId), String(req.params.jobId), req.userId!);
  if (!job.attachmentPath || !job.attachmentName) throw new ApiError(404, 'No attachment on this job.');
  res.download(path.join(UPLOAD_DIR, job.attachmentPath), job.attachmentName);
});

router.delete('/plans/:planId/jobs/:jobId/attachment', async (req, res) => {
  const job = await loadOwnedJob(String(req.params.planId), String(req.params.jobId), req.userId!);
  if (job.attachmentPath) {
    await unlink(path.join(UPLOAD_DIR, job.attachmentPath)).catch(() => {});
  }
  await prisma.job.update({
    where: { id: job.id },
    data: { attachmentPath: null, attachmentName: null, attachmentMime: null },
  });
  res.status(204).end();
});

router.delete('/plans/:id', async (req, res) => {
  const plan = await loadOwnedPlan(req.params.id!, req.userId!);
  await prisma.plan.delete({ where: { id: plan.id } });
  res.status(204).end();
});

export default router;
