export function parseTime(hhmm: string): number {
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm.trim());
  if (!match) throw new Error(`Invalid HH:MM time: "${hhmm}"`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

export function formatTime(totalMinutes: number): string {
  const clamped = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
