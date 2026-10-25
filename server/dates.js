/*
  Game calendar. The "day" and the "week" are always Argentina time (UTC-3, no DST),
  never the player's clock.
*/

const ART_OFFSET_MS = 3 * 60 * 60 * 1000;

/** YYYY-MM-DD in Argentina time. */
export function argentinaDate(now = new Date()) {
  return new Date(now.getTime() - ART_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO-8601 week (Monday to Sunday) of a YYYY-MM-DD date, e.g. "2026-W44". */
export function isoWeekKey(dateStr) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  const dayOfWeek = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - dayOfWeek + 3); // Thursday of this week decides the year
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
