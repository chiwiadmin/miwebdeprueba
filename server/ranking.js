/*
  Weekly ranking (week = Monday to Sunday, Argentina time; see dates.js).
  Only finished games count. Order: total points, then more first-clue hits,
  then whoever reached that total first, then nickname (so the order is always stable).
*/

export const TOP_SIZE = 5;

export async function getRanking(env, weekKey, playerId) {
  const { results } = await env.DB
    .prepare(
      `WITH totals AS (
         SELECT p.player_id AS player_id, pl.nickname AS nickname,
                SUM(p.score) AS points,
                COUNT(*) AS days,
                SUM(CASE WHEN p.won = 1 AND p.attempt = 1 THEN 1 ELSE 0 END) AS first_hits,
                MAX(p.finished_at) AS last_finish
         FROM plays p JOIN players pl ON pl.id = p.player_id
         WHERE p.week_key = ? AND p.finished = 1
         GROUP BY p.player_id
       ), ranked AS (
         SELECT player_id, nickname, points, days,
                ROW_NUMBER() OVER (ORDER BY points DESC, first_hits DESC, last_finish ASC, nickname ASC) AS position,
                COUNT(*) OVER () AS players
         FROM totals
       )
       SELECT player_id, nickname, points, days, position, players
       FROM ranked
       WHERE position <= ? OR player_id = ?
       ORDER BY position`
    )
    .bind(weekKey, TOP_SIZE, playerId || "")
    .all();

  // Player ids never leave the server: only position, nickname, points and days are exposed.
  const publicRow = (row) => ({ position: row.position, nickname: row.nickname, points: row.points, days: row.days });
  const top = results.filter((row) => row.position <= TOP_SIZE).map((row) => ({ ...publicRow(row), you: row.player_id === playerId }));
  const mine = playerId ? results.find((row) => row.player_id === playerId) : null;

  return {
    week: weekKey,
    players: results.length ? results[0].players : 0,
    top,
    me: mine ? publicRow(mine) : null
  };
}
