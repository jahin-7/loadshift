/**
 * What a job needs, as the owner specifies it:
 * - `grid`: mains only, must never land inside a cut.
 * - `flexible`: any off-grid source will do — generator or solar, whichever's free/available.
 * - `solar`: off-grid is fine, but only via solar — must never run on the diesel generator.
 * - `none`: no power needed at all.
 */
export type PowerKind = 'grid' | 'flexible' | 'solar' | 'none';
/** What actually powered a scheduled job. */
export type ActualPowerKind = 'grid' | 'generator' | 'solar' | 'none';

export interface CutInput {
  start: number;
  end: number;
}

export interface JobInput {
  id: string;
  name: string;
  minutes: number;
  power: PowerKind;
}

/**
 * What power sources a shop actually has, beyond the grid. `flexible`- and
 * `solar`-tagged jobs can only run off-grid if the relevant one of these is
 * true for that window — a shop with neither behaves exactly like one where
 * every job is effectively grid-only once a cut starts.
 */
export interface ShopCapabilities {
  hasGenerator: boolean;
  hasSolar: boolean;
  /** Minutes from midnight. Only meaningful when hasSolar is true. */
  solarStart?: number;
  solarEnd?: number;
}

export const DEFAULT_CAPABILITIES: ShopCapabilities = { hasGenerator: true, hasSolar: false };

export interface ScheduleInput {
  shopOpen: number;
  shopClose: number;
  cuts: CutInput[];
  jobs: JobInput[];
  capabilities?: ShopCapabilities;
}

export interface Segment {
  start: number;
  end: number;
  type: 'grid' | 'cut';
  remaining: number;
  /** Only meaningful when type is 'cut': is this sub-window inside the shop's solar hours? */
  solarCovered?: boolean;
}

export interface ScheduledJob {
  id: string;
  name: string;
  minutes: number;
  power: PowerKind;
  start: number;
  end: number;
  actualPower: ActualPowerKind;
  reason: string;
}

export interface ScheduleResult {
  segments: Segment[];
  scheduled: ScheduledJob[];
  unscheduled: JobInput[];
  feasible: boolean;
  totalGeneratorMinutes: number;
  totalSolarMinutes: number;
  idleMinutes: number;
}
