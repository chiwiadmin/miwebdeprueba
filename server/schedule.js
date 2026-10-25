/*
  Which song is played on a given day.

  The seeded schedule covers the first cycle (one day per song). Once it runs out, a new cycle
  is generated on demand: every song exactly once, in random order, so no song repeats until
  all of them have been played. The order is drawn with the server's secure RNG and persisted
  in `schedule`, so it is the same for every player and cannot be predicted from the public code.
*/

import { addDays } from "./dates.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CYCLES = 400;

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Unbiased random integer in [0, max). */
function randomInt(max) {
  const limit = Math.floor(2 ** 32 / max) * max;
  const buffer = new Uint32Array(1);
  do { crypto.getRandomValues(buffer); } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/** Fisher-Yates shuffle, returns a new array. */
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function readSong(env, date) {
  const row = await env.DB
    .prepare("SELECT s.titles, s.artist, s.clue1, s.clue2, s.clue3 FROM schedule sc JOIN songs s ON s.id = sc.song_id WHERE sc.play_date = ?")
    .bind(date)
    .first();
  if (!row) return null;
  return { titles: JSON.parse(row.titles), artist: row.artist, clues: [row.clue1, row.clue2, row.clue3] };
}

async function ensureCycle(env, firstDate, length, cycle) {
  const start = addDays(firstDate, cycle * length);
  if (await env.DB.prepare("SELECT 1 AS found FROM schedule WHERE play_date = ?").bind(start).first()) return;

  const { results } = await env.DB.prepare("SELECT id FROM songs ORDER BY id").all();
  const order = shuffle(results.map((row) => row.id));

  // Do not open a cycle with the song that closed the previous one.
  const previous = await env.DB.prepare("SELECT song_id FROM schedule WHERE play_date = ?").bind(addDays(start, -1)).first();
  if (previous && order.length > 1 && order[0] === previous.song_id) {
    const swapWith = 1 + randomInt(order.length - 1);
    [order[0], order[swapWith]] = [order[swapWith], order[0]];
  }

  // One atomic batch + INSERT OR IGNORE: if two requests race, the first one wins as a whole.
  await env.DB.batch(
    order.map((songId, index) =>
      env.DB.prepare("INSERT OR IGNORE INTO schedule (play_date, song_id) VALUES (?, ?)").bind(addDays(start, index), songId)
    )
  );
}

/** The song for `date` (YYYY-MM-DD, Argentina), generating the next cycle(s) when needed. */
export async function getSongForDate(env, date) {
  const scheduled = await readSong(env, date);
  if (scheduled) return scheduled;

  const first = await env.DB.prepare("SELECT MIN(play_date) AS first_date FROM schedule").first();
  const total = await env.DB.prepare("SELECT COUNT(*) AS n FROM songs").first();
  if (!first || !first.first_date || !total || total.n < 1) return null;

  const length = total.n;
  const elapsed = daysBetween(first.first_date, date);
  if (elapsed < length) return null; // before the start date, or a gap inside the seeded cycle

  const cycle = Math.floor(elapsed / length);
  if (cycle > MAX_CYCLES) return null;
  for (let c = 1; c <= cycle; c++) await ensureCycle(env, first.first_date, length, c);
  return readSong(env, date);
}
