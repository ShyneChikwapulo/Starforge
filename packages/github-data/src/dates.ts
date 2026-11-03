/** Add (or subtract) whole days to a YYYY-MM-DD date, in UTC. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The YYYY-MM-DD day of a Date, in UTC. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
