import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeSchedule } from './schedule.js';
import { parseTime } from './time.js';
import type { JobInput, PowerKind } from './types.js';

interface RawCase {
  case_id: string;
  shop_open: string;
  shop_close: string;
  cuts: { start: string; end: string }[];
  jobs: { name: string; minutes: number; power: 'grid' | 'generator' | 'none' }[];
}

/** The published fixture predates the flexible/solar split; map its 'generator' tag onto ours. */
function translatePower(raw: 'grid' | 'generator' | 'none'): PowerKind {
  return raw === 'generator' ? 'flexible' : raw;
}

const dataPath = fileURLToPath(new URL('../data/print_shop_days.json', import.meta.url));
const raw = JSON.parse(readFileSync(dataPath, 'utf-8')) as { cases: RawCase[] };

describe('computeSchedule against the real print-shop dataset (25 cases)', () => {
  it.each(raw.cases)('$case_id produces an internally consistent plan', (testCase) => {
    const shopOpen = parseTime(testCase.shop_open);
    const shopClose = parseTime(testCase.shop_close);
    const cuts = testCase.cuts.map((c) => ({ start: parseTime(c.start), end: parseTime(c.end) }));
    const jobs: JobInput[] = testCase.jobs.map((j, index) => ({
      id: `${testCase.case_id}-${index}`,
      name: j.name,
      minutes: j.minutes,
      power: translatePower(j.power),
    }));

    const result = computeSchedule({ shopOpen, shopClose, cuts, jobs });

    // Every input job is accounted for exactly once, either scheduled or not.
    const allIds = new Set(jobs.map((j) => j.id));
    const seenIds = new Set<string>();
    for (const j of [...result.scheduled, ...result.unscheduled]) {
      expect(seenIds.has(j.id)).toBe(false);
      seenIds.add(j.id);
    }
    expect(seenIds).toEqual(allIds);

    // feasible flag matches reality
    expect(result.feasible).toBe(result.unscheduled.length === 0);

    // no overlaps, everything inside shop hours
    const sorted = [...result.scheduled].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length; i++) {
      const j = sorted[i]!;
      expect(j.start).toBeGreaterThanOrEqual(shopOpen);
      expect(j.end).toBeLessThanOrEqual(shopClose);
      expect(j.end - j.start).toBe(j.minutes);
      if (i > 0) expect(j.start).toBeGreaterThanOrEqual(sorted[i - 1]!.end);
    }

    // grid-tagged jobs never land inside a cut
    for (const j of result.scheduled) {
      if (j.power !== 'grid') continue;
      const overlapsAnyCut = cuts.some((c) => j.start < c.end && j.end > c.start);
      expect(overlapsAnyCut).toBe(false);
    }

    // none-tagged jobs are always free
    for (const j of result.scheduled) {
      if (j.power === 'none') expect(j.actualPower).toBe('none');
    }

    // totalGeneratorMinutes matches the sum of jobs actually run on the generator
    const summed = result.scheduled
      .filter((j) => j.actualPower === 'generator')
      .reduce((sum, j) => sum + j.minutes, 0);
    expect(result.totalGeneratorMinutes).toBe(summed);

    // flexible-tagged jobs running on the generator must genuinely overlap a cut
    for (const j of result.scheduled) {
      if (j.power === 'flexible' && j.actualPower === 'generator') {
        const overlapsAnyCut = cuts.some((c) => j.start < c.end && j.end > c.start);
        expect(overlapsAnyCut).toBe(true);
      }
    }
  });
});
