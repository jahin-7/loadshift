import { buildSegments } from './segments.js';
import { DEFAULT_CAPABILITIES } from './types.js';
import type { ActualPowerKind, JobInput, ScheduleInput, ScheduleResult, ScheduledJob, Segment } from './types.js';

interface Placement {
  job: JobInput;
  segment: Segment;
  actualPower: ActualPowerKind;
  reason: string;
}

/**
 * Best-fit-decreasing: sorts jobs longest-first, and for each places it into
 * the *tightest* still-fitting segment (least leftover space) rather than
 * the first one that fits. That packs segments tighter than plain first-fit,
 * which matters because every minute of grid capacity left unused by a
 * flexible job is a minute that might force a later job onto the generator.
 * Mutates each segment's `remaining`; returns jobs that found no home.
 */
function bestFitDecreasing(
  jobs: JobInput[],
  segments: Segment[],
  actualPowerFor: (segment: Segment) => ActualPowerKind,
  reasonFor: (segment: Segment) => string,
  placements: Placement[],
): JobInput[] {
  const leftover: JobInput[] = [];
  const sorted = [...jobs].sort((a, b) => b.minutes - a.minutes);

  for (const job of sorted) {
    let best: Segment | null = null;
    for (const segment of segments) {
      if (segment.remaining < job.minutes) continue;
      if (!best || segment.remaining < best.remaining) best = segment;
    }
    if (best) {
      best.remaining -= job.minutes;
      placements.push({ job, segment: best, actualPower: actualPowerFor(best), reason: reasonFor(best) });
    } else {
      leftover.push(job);
    }
  }
  return leftover;
}

/**
 * Auto-plans a day: assigns every job a slot on a single-track timeline.
 * `grid` jobs never land inside a power cut. `flexible` and `solar` jobs use
 * free grid time whenever there's room, then free solar time if the shop has
 * it — `solar`-tagged jobs stop there and go unscheduled rather than ever
 * touching the diesel generator, while `flexible` jobs fall back to the
 * generator (fuel cost) only as a last resort, and only if the shop has one.
 * `none` jobs soak up cut-window time first since it would otherwise sit
 * idle. See README "Scheduling algorithm" for the full priority rationale.
 */
export function computeSchedule(input: ScheduleInput): ScheduleResult {
  const capabilities = input.capabilities ?? DEFAULT_CAPABILITIES;
  const segments = buildSegments(input.shopOpen, input.shopClose, input.cuts, capabilities);
  const gridSegments = segments.filter((s) => s.type === 'grid');
  const cutSegments = segments.filter((s) => s.type === 'cut');
  const solarCutSegments = cutSegments.filter((s) => s.solarCovered === true);
  const otherCutSegments = cutSegments.filter((s) => s.solarCovered !== true);

  const gridJobs = input.jobs.filter((j) => j.power === 'grid');
  const flexibleJobs = input.jobs.filter((j) => j.power === 'flexible');
  const solarOnlyJobs = input.jobs.filter((j) => j.power === 'solar');
  const noneJobs = input.jobs.filter((j) => j.power === 'none');

  const placements: Placement[] = [];

  // Phase A: mandatory grid jobs claim grid segments first — they have no
  // other option, so they must be placed before anything else touches grid capacity.
  const unplacedGrid = bestFitDecreasing(
    gridJobs,
    gridSegments,
    () => 'grid',
    () => 'Needs mains power directly; scheduled in a grid-on window.',
    placements,
  );

  // Phase A2/A3: off-grid-capable jobs (both kinds) opportunistically fill
  // leftover grid capacity first, since running on mains costs no fuel.
  const flexibleOverflow = bestFitDecreasing(
    flexibleJobs,
    gridSegments,
    () => 'grid',
    () => 'Can run off-grid, but grid was free during this window.',
    placements,
  );
  const solarOnlyOverflow = bestFitDecreasing(
    solarOnlyJobs,
    gridSegments,
    () => 'grid',
    () => 'Must run on solar or mains, but grid was free during this window.',
    placements,
  );

  // Phase B1: solar-only jobs get first claim on solar-covered cut time —
  // it's their sole possible off-grid path, whereas flexible jobs still have
  // the generator as a fallback if they miss out here.
  const unplacedSolarOnly = bestFitDecreasing(
    solarOnlyOverflow,
    solarCutSegments,
    () => 'solar',
    () => 'No grid window had room; ran on solar during a power cut.',
    placements,
  );

  // Phase B2: flexible jobs take whatever solar-covered time is left over.
  const flexibleSolarOverflow = bestFitDecreasing(
    flexibleOverflow,
    solarCutSegments,
    () => 'solar',
    () => 'No grid window had room; ran on solar during a power cut.',
    placements,
  );

  // Phase B3: flexible jobs that found no free power anywhere fall back to
  // the generator — the only place fuel is actually spent — and only if the
  // shop has one. Solar-only jobs never reach this phase.
  const unplacedFlexible = capabilities.hasGenerator
    ? bestFitDecreasing(
        flexibleSolarOverflow,
        otherCutSegments,
        () => 'generator',
        () => 'No grid or solar window had room; ran on the generator during a power cut.',
        placements,
      )
    : flexibleSolarOverflow;

  // Phase C: jobs needing no power at all soak up cut-window time first
  // (otherwise-wasted capacity), falling back to leftover grid time.
  const noneOverflow = bestFitDecreasing(
    noneJobs,
    cutSegments,
    () => 'none',
    () => 'No power needed; scheduled during a power cut to save grid time for jobs that need it.',
    placements,
  );
  const unplacedNone = bestFitDecreasing(
    noneOverflow,
    gridSegments,
    () => 'none',
    () => 'No power needed; fit into leftover grid-window time.',
    placements,
  );

  const unscheduled = [...unplacedGrid, ...unplacedSolarOnly, ...unplacedFlexible, ...unplacedNone];

  // Lay out each segment's assigned jobs back-to-back, in the order the
  // owner originally listed them, so the plan reads naturally rather than
  // largest-job-first.
  const originalOrder = new Map(input.jobs.map((job, index) => [job.id, index]));
  const bySegment = new Map<Segment, Placement[]>();
  for (const placement of placements) {
    const list = bySegment.get(placement.segment) ?? [];
    list.push(placement);
    bySegment.set(placement.segment, list);
  }

  const scheduled: ScheduledJob[] = [];
  for (const segment of segments) {
    const list = (bySegment.get(segment) ?? []).sort(
      (a, b) => (originalOrder.get(a.job.id) ?? 0) - (originalOrder.get(b.job.id) ?? 0),
    );
    let cursor = segment.start;
    for (const placement of list) {
      const start = cursor;
      const end = start + placement.job.minutes;
      scheduled.push({
        id: placement.job.id,
        name: placement.job.name,
        minutes: placement.job.minutes,
        power: placement.job.power,
        start,
        end,
        actualPower: placement.actualPower,
        reason: placement.reason,
      });
      cursor = end;
    }
  }
  scheduled.sort((a, b) => a.start - b.start);

  const totalGeneratorMinutes = scheduled
    .filter((j) => j.actualPower === 'generator')
    .reduce((sum, j) => sum + j.minutes, 0);
  const totalSolarMinutes = scheduled
    .filter((j) => j.actualPower === 'solar')
    .reduce((sum, j) => sum + j.minutes, 0);

  const totalSegmentMinutes = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const totalScheduledMinutes = scheduled.reduce((sum, j) => sum + j.minutes, 0);

  return {
    segments,
    scheduled,
    unscheduled,
    feasible: unscheduled.length === 0,
    totalGeneratorMinutes,
    totalSolarMinutes,
    idleMinutes: totalSegmentMinutes - totalScheduledMinutes,
  };
}
