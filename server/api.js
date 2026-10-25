/*
  Game API. Pure Request -> Response so it can run in a Cloudflare Pages Function
  and in plain Node tests.

  GET  /api/state   current player + today's game (only the clues already unlocked)
  POST /api/join    {nickname}  creates the player and the session cookie
  POST /api/guess   {title, artist}
  POST /api/skip    asks for another clue (consumes an attempt)

  The song of the day never leaves the server until the player's game is finished.
*/

import { submitGuess, skipClue, normalize } from "../public/assets/js/game-core.js";
import { acceptedNames } from "../public/assets/js/artists.js";
import { validateNickname } from "../public/assets/js/nickname.js";
import { argentinaDate, isoWeekKey } from "./dates.js";
import { getSongForDate } from "./schedule.js";
import { COOKIE_NAME, createToken, verifyToken, readCookie, sessionCookie } from "./session.js";

const MAX_BODY_CHARS = 2000;
const MAX_FIELD_CHARS = 100;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

const fail = (error, status) => json({ error }, status);

/**
 * `artists` is the dictionary from assets/data/artists.json. It is passed in (not imported here)
 * because Cloudflare's Pages build uses an older esbuild that rejects `import ... with { type: "json" }`,
 * which plain Node requires.
 */
export async function handle(request, env, now = new Date(), artists = []) {
  if (!env.SESSION_SECRET || !env.DB) return fail("server_misconfigured", 500);

  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/api/state") return await getState(request, env, now);

    if (request.method === "POST" && ["/api/join", "/api/guess", "/api/skip"].includes(url.pathname)) {
      const rejected = checkPost(request, url);
      if (rejected) return rejected;
      if (url.pathname === "/api/join") return await join(request, env, now, url);
      return await move(request, env, now, url.pathname === "/api/guess" ? "guess" : "skip", artists);
    }
    return fail("not_found", 404);
  } catch (err) {
    console.error("api error", err);
    return fail("internal", 500);
  }
}

/** Same-origin JSON only: blocks cross-site form posts even if a cookie were attached. */
function checkPost(request, url) {
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).host !== url.host) return fail("forbidden_origin", 403);
    } catch {
      return fail("forbidden_origin", 403);
    }
  }
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) return fail("unsupported_media_type", 415);
  return null;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return { error: fail("body_too_large", 413) };
  try {
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return { body };
  } catch { /* falls through */ }
  return { error: fail("invalid_json", 400) };
}

async function getPlayer(request, env) {
  const token = readCookie(request.headers.get("Cookie"), COOKIE_NAME);
  if (!token) return null;
  const playerId = await verifyToken(env.SESSION_SECRET, token);
  if (!playerId) return null;
  return await env.DB.prepare("SELECT id, nickname FROM players WHERE id = ?").bind(playerId).first();
}

async function getOrCreatePlay(env, playerId, date) {
  await env.DB
    .prepare("INSERT OR IGNORE INTO plays (player_id, play_date, week_key) VALUES (?, ?, ?)")
    .bind(playerId, date, isoWeekKey(date))
    .run();
  const row = await env.DB
    .prepare("SELECT attempt, title_ok, artist_ok, finished, won, score, last_feedback FROM plays WHERE player_id = ? AND play_date = ?")
    .bind(playerId, date)
    .first();
  return {
    attempt: row.attempt,
    titleOk: !!row.title_ok,
    artistOk: !!row.artist_ok,
    finished: !!row.finished,
    won: !!row.won,
    score: row.score,
    lastFeedback: row.last_feedback
  };
}

/** What the browser is allowed to know. Answer fields appear only once the game is over. */
function publicState(player, date, game, song) {
  const state = {
    joined: true,
    nickname: player.nickname,
    date,
    game: {
      attempt: game.attempt,
      titleOk: game.titleOk,
      artistOk: game.artistOk,
      finished: game.finished,
      won: game.won,
      score: game.score,
      lastFeedback: game.lastFeedback
    },
    clues: song.clues.slice(0, game.attempt)
  };
  if (game.finished) state.answer = { title: song.titles[0], artist: song.artist };
  return state;
}

async function stateFor(player, env, now, headers = {}) {
  const date = argentinaDate(now);
  const song = await getSongForDate(env, date);
  if (!song) return json({ joined: true, nickname: player.nickname, date, error: "no_song_today" }, 503, headers);
  const game = await getOrCreatePlay(env, player.id, date);
  return json(publicState(player, date, game, song), 200, headers);
}

async function getState(request, env, now) {
  const player = await getPlayer(request, env);
  if (!player) return json({ joined: false, date: argentinaDate(now) });
  return stateFor(player, env, now);
}

async function join(request, env, now, url) {
  const existing = await getPlayer(request, env);
  if (existing) return stateFor(existing, env, now);

  const { body, error } = await readJson(request);
  if (error) return error;

  const checked = validateNickname(body.nickname);
  const key = checked.ok ? normalize(checked.value).replace(/\s/g, "") : "";
  if (!checked.ok || key.length < 3) return json({ error: "invalid_nickname", message: checked.error }, 400);

  const playerId = crypto.randomUUID();
  try {
    await env.DB
      .prepare("INSERT INTO players (id, nickname, nickname_key, created_at) VALUES (?, ?, ?, ?)")
      .bind(playerId, checked.value, key, now.toISOString())
      .run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err && err.message))) return fail("nickname_taken", 409);
    throw err;
  }

  const token = await createToken(env.SESSION_SECRET, playerId);
  const cookie = sessionCookie(token, url.protocol === "https:");
  return stateFor({ id: playerId, nickname: checked.value }, env, now, { "Set-Cookie": cookie });
}

function cleanField(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function move(request, env, now, kind, artists) {
  const player = await getPlayer(request, env);
  if (!player) return fail("not_joined", 401);

  const date = argentinaDate(now);
  const song = await getSongForDate(env, date);
  if (!song) return fail("no_song_today", 503);

  let guess = null;
  if (kind === "guess") {
    const { body, error } = await readJson(request);
    if (error) return error;
    guess = { title: cleanField(body.title), artist: cleanField(body.artist) };
    if (guess.title.length > MAX_FIELD_CHARS || guess.artist.length > MAX_FIELD_CHARS) return fail("field_too_long", 400);
  }

  const game = await getOrCreatePlay(env, player.id, date);
  if (game.finished) return json({ error: "already_finished", state: publicState(player, date, game, song) }, 409);

  if (guess && ((!game.titleOk && !guess.title) || (!game.artistOk && !guess.artist))) return fail("missing_fields", 400);

  const names = acceptedNames(artists, song.artist);
  const matchable = { titles: song.titles, artists: names.length ? names : [song.artist] };
  const next = guess ? submitGuess(game, matchable, guess) : skipClue(game);

  // Optimistic concurrency: only the request that still sees the attempt we read can write.
  const result = await env.DB
    .prepare(
      `UPDATE plays SET attempt = ?, title_ok = ?, artist_ok = ?, finished = ?, won = ?, score = ?, last_feedback = ?, finished_at = ?
       WHERE player_id = ? AND play_date = ? AND attempt = ? AND finished = 0`
    )
    .bind(
      next.attempt, +next.titleOk, +next.artistOk, +next.finished, +next.won, next.score ?? null,
      next.lastFeedback, next.finished ? now.toISOString() : null,
      player.id, date, game.attempt
    )
    .run();

  if (result.meta.changes !== 1) {
    const fresh = await getOrCreatePlay(env, player.id, date);
    return json({ error: "conflict", state: publicState(player, date, fresh, song) }, 409);
  }
  return json(publicState(player, date, next, song));
}
