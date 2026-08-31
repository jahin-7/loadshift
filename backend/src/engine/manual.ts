import type { CutInput, JobInput, PowerKind, ShopCapabilities } from './types.js';
import { DEFAULT_CAPABILITIES } from './types.js';
import { normalizeCuts } from './segments.js';

export interface ManualPlacement {
  jobId: string;
  start: number;
}

export interface ManualScheduledJob {
  id: string;
  name: string;
  minutes: number;
  power: PowerKind;
  start: number;
  end: number;
  generatorMinutes: number;
  solarMinutes: number;
}

export interface ManualScoreResult {
  valid: boolean;
  errors: string[];
  scheduled: ManualScheduledJob[];
  unscheduled: JobInput[];
  totalGeneratorMinutes: number;
  totalSolarMinutes: number;
}

function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Scores a schedule the user arranged by hand (e.g. via drag-and-drop),
 * rather than computing one. Unlike the auto-planner, a manually placed job
 * may straddle a cut boundary — fuel is only charged for the actual minutes
 * that overlap a cut and aren't covered by solar, not the whole job, since a
 * machine just needs continuous power regardless of source.
 */
export function scoreManualSchedule(
  shopOpen: number,
  shopClose: number,
  cuts: CutInput[],
  jobs: JobInput[],
  placements: ManualPlacement[],
  capabilities: ShopCapabilities = DEFAULT_CAPABILITIES,
): ManualScoreResult {
  const errors: string[] = [];
  const normalizedCuts = normalizeCuts(shopOpen, shopClose, cuts);
  const solarPortionsOfCuts =
    capabilities.hasSolar && capabilities.solarStart !== undefined && capabilities.solarEnd !== undefined
      ? normalizedCuts
          .map((cut) => ({
            start: Math.max(cut.start, capabilities.solarStart!),
            end: Math.min(cut.end, capabilities.solarEnd!),
          }))
          .filter((p) => p.end > p.start)
      : [];
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const placedIds = new Set(placements.map((p) => p.jobId));

  const intervals: { jobId: string; start: number; end: number }[] = [];
  for (const placement of placements) {
    const job = jobsById.get(placement.jobId);
    if (!job) {
      errors.push(`Unknown job id "${placement.jobId}" in placement.`);
      continue;
    }
    const start = placement.start;
    const end = start + job.minutes;
    if (start < shopOpen || end > shopClose) {
      errors.push(`"${job.name}" (${start}-${end}) falls outside shop hours (${shopOpen}-${shopClose}).`);
    }
    intervals.push({ jobId: job.id, start, end });
  }

  intervals.sort((a, b) => a.start - b.start);
  for (let i = 1; i < intervals.length; i++) {
    const prev = intervals[i - 1]!;
    const cur = intervals[i]!;
    if (cur.start < prev.end) {
      const prevJob = jobsById.get(prev.jobId)!;
      const curJob = jobsById.get(cur.jobId)!;
      errors.push(`"${prevJob.name}" and "${curJob.name}" overlap.`);
    }
  }

  const scheduled: ManualScheduledJob[] = [];
  let totalGeneratorMinutes = 0;
  let totalSolarMinutes = 0;
  for (const interval of intervals) {
    const job = jobsById.get(interval.jobId);
    if (!job) continue;
    const cutOverlap = normalizedCuts.reduce(
      (sum, cut) => sum + overlapMinutes(interval.start, interval.end, cut.start, cut.end),
      0,
    );

    if (job.power === 'grid' && cutOverlap > 0) {
      errors.push(`"${job.name}" needs mains power but overlaps a power cut by ${cutOverlap} minute(s).`);
    }

    let generatorMinutes = 0;
    let solarMinutes = 0;
    if ((job.power === 'flexible' || job.power === 'solar') && cutOverlap > 0) {
      solarMinutes = solarPortionsOfCuts.reduce(
        (sum, p) => sum + overlapMinutes(interval.start, interval.end, p.start, p.end),
        0,
      );
      const uncovered = cutOverlap - solarMinutes;
      if (job.power === 'solar' && uncovered > 0) {
        errors.push(
          `"${job.name}" must run on solar or mains, but has no solar coverage for ${uncovered} minute(s) of this cut.`,
        );
      } else if (uncovered > 0 && !capabilities.hasGenerator) {
        errors.push(
          `"${job.name}" needs power during a cut with no generator or solar coverage, for ${uncovered} minute(s).`,
        );
      } else {
        generatorMinutes = uncovered;
      }
    }

    totalGeneratorMinutes += generatorMinutes;
    totalSolarMinutes += solarMinutes;
    scheduled.push({
      id: job.id,
      name: job.name,
      minutes: job.minutes,
      power: job.power,
      start: interval.start,
      end: interval.end,
      generatorMinutes,
      solarMinutes,
    });
  }

  const unscheduled = jobs.filter((job) => !placedIds.has(job.id));

  return {
    valid: errors.length === 0,
    errors,
    scheduled,
    unscheduled,
    totalGeneratorMinutes,
    totalSolarMinutes,
  };
}
