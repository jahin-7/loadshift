import type { CutInput, Segment, ShopCapabilities } from './types.js';

/**
 * Normalizes raw cut windows against the shop's open/close bounds: clips
 * partial overlaps, drops cuts entirely outside the day, sorts, and merges
 * any that touch or overlap. Callers may hand in unsorted/overlapping cuts
 * (e.g. straight from a form), so this is the single place that guarantees
 * a clean, non-overlapping, chronological list.
 */
export function normalizeCuts(shopOpen: number, shopClose: number, cuts: CutInput[]): CutInput[] {
  const clipped = cuts
    .map((cut) => ({ start: Math.max(cut.start, shopOpen), end: Math.min(cut.end, shopClose) }))
    .filter((cut) => cut.end > cut.start)
    .sort((a, b) => a.start - b.start);

  const merged: CutInput[] = [];
  for (const cut of clipped) {
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) {
      last.end = Math.max(last.end, cut.end);
    } else {
      merged.push({ ...cut });
    }
  }
  return merged;
}

/**
 * Splits one cut segment at its solar-window boundaries so the bin-packer can
 * treat "free (solar-covered)" and "costs fuel (uncovered)" cut time as
 * separate, still-atomic segments — the same trick used for grid-vs-cut.
 */
function splitCutBySolar(segment: Segment, solarStart: number, solarEnd: number): Segment[] {
  if (solarEnd <= solarStart) return [segment];
  const pieces: { start: number; end: number; covered: boolean }[] = [];
  const before = { start: segment.start, end: Math.min(segment.end, solarStart) };
  const within = { start: Math.max(segment.start, solarStart), end: Math.min(segment.end, solarEnd) };
  const after = { start: Math.max(segment.start, solarEnd), end: segment.end };

  if (before.end > before.start) pieces.push({ ...before, covered: false });
  if (within.end > within.start) pieces.push({ ...within, covered: true });
  if (after.end > after.start) pieces.push({ ...after, covered: false });

  if (pieces.length === 0) return [segment];
  return pieces.map((p) => ({
    start: p.start,
    end: p.end,
    type: 'cut' as const,
    remaining: p.end - p.start,
    solarCovered: p.covered,
  }));
}

export function buildSegments(
  shopOpen: number,
  shopClose: number,
  cuts: CutInput[],
  capabilities?: ShopCapabilities,
): Segment[] {
  if (shopClose <= shopOpen) throw new Error('shopClose must be after shopOpen');
  const normalized = normalizeCuts(shopOpen, shopClose, cuts);

  const segments: Segment[] = [];
  let cursor = shopOpen;
  for (const cut of normalized) {
    if (cut.start > cursor) {
      segments.push({ start: cursor, end: cut.start, type: 'grid', remaining: cut.start - cursor });
    }
    const cutSegment: Segment = { start: cut.start, end: cut.end, type: 'cut', remaining: cut.end - cut.start };
    if (capabilities?.hasSolar && capabilities.solarStart !== undefined && capabilities.solarEnd !== undefined) {
      segments.push(...splitCutBySolar(cutSegment, capabilities.solarStart, capabilities.solarEnd));
    } else {
      segments.push(cutSegment);
    }
    cursor = cut.end;
  }
  if (cursor < shopClose) {
    segments.push({ start: cursor, end: shopClose, type: 'grid', remaining: shopClose - cursor });
  }
  return segments;
}
