export function parseTime(hhmm: string): number {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm.trim());
  if (!match) throw new Error(`Invalid HH:MM time: "${hhmm}"`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatTime(totalMinutes: number): string {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
