import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAuth } from '../auth/middleware.js';
import { ApiError } from './errors.js';

const router = Router();
router.use(requireAuth);

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a YYYY-MM-DD date.');

const readingInputSchema = z.object({
  date: dateOnly,
  readingKwh: z.number().nonnegative().max(10_000_000),
  note: z.string().trim().max(200).optional(),
});

function serializeReading(reading: { id: string; date: Date; readingKwh: number; note: string | null }) {
  return {
    id: reading.id,
    date: reading.date.toISOString().slice(0, 10),
    readingKwh: reading.readingKwh,
    note: reading.note,
  };
}

router.post('/meter', async (req, res) => {
  const parsed = readingInputSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? 'Invalid reading.');

  const created = await prisma.meterReading.create({
    data: {
      userId: req.userId!,
      date: new Date(`${parsed.data.date}T00:00:00.000Z`),
      readingKwh: parsed.data.readingKwh,
      note: parsed.data.note ?? null,
    },
  });
  res.status(201).json({ reading: serializeReading(created) });
});

router.get('/meter', async (req, res) => {
  const readings = await prisma.meterReading.findMany({
    where: { userId: req.userId! },
    orderBy: { date: 'asc' },
  });
  res.json({ readings: readings.map(serializeReading) });
});

router.delete('/meter/:id', async (req, res) => {
  const reading = await prisma.meterReading.findUnique({ where: { id: req.params.id } });
  if (!reading || reading.userId !== req.userId) throw new ApiError(404, 'Reading not found.');
  await prisma.meterReading.delete({ where: { id: reading.id } });
  res.status(204).end();
});

export default router;
