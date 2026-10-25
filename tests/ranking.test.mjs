import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle as handleRequest } from "../server/api.js";
import { getRanking } from "../server/ranking.js";
import { createTestDb } from "./helpers/d1.mjs";

const artists = JSON.parse(readFileSync(new URL("../public/assets/data/artists.json", import.meta.url), "utf8"));
const handle = (request, env, now) => handleRequest(request, env, now, artists);

const ORIGIN = "https://juego.test";
const SUNDAY = new Date("2026-10-25T15:00:00Z"); // semana 43
const W43 = "2026-W43";
const W44 = "2026-W44";

function setup() {
  const { sqlite, d1 } = createTestDb();
  return { sqlite, env: { DB: d1, SESSION_SECRET: "test-secret-aaaaaaaaaaaaaaaaaaaaaaaa" } };
}

let counter = 0;
/** Inserta un jugador y sus partidas directo en la base: [{ week, date, score, attempt, at, finished }] */
function addPlayer(sqlite, nickname, plays) {
  const id = `player-${++counter}`;
  sqlite
    .prepare("INSERT INTO players (id, nickname, nickname_key, created_at) VALUES (?, ?, ?, ?)")
    .run(id, nickname, `${nickname.toLowerCase().replace(/\s/g, "")}-${counter}`, "2026-10-01T00:00:00Z");
  for (const play of plays) {
    sqlite
      .prepare(
        "INSERT INTO plays (player_id, play_date, week_key, attempt, title_ok, artist_ok, finished, won, score, finished_at) VALUES (?, ?, ?, ?, 1, 1, ?, ?, ?, ?)"
      )
      .run(
        id, play.date, play.week ?? W43, play.attempt ?? 1,
        play.finished ?? 1, (play.score ?? 0) > 0 ? 1 : 0, play.score, play.at ?? "2026-10-25T12:00:00Z"
      );
  }
  return id;
}

const day = (n) => `2026-10-${String(18 + n).padStart(2, "0")}`;

test("ordena por puntos de la semana, de mayor a menor", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Bajo", [{ date: day(1), score: 3, attempt: 3 }]);
  addPlayer(sqlite, "Alto", [{ date: day(1), score: 10 }, { date: day(2), score: 10 }]);
  addPlayer(sqlite, "Medio", [{ date: day(1), score: 5, attempt: 2 }, { date: day(2), score: 5, attempt: 2 }]);
  const { top } = await getRanking(env, W43, null);
  assert.deepEqual(top.map((r) => [r.position, r.nickname, r.points]), [[1, "Alto", 20], [2, "Medio", 10], [3, "Bajo", 3]]);
  assert.equal(top[0].days, 2);
});

test("solo se muestran 5, aunque haya más jugadores, y se informa el total", async () => {
  const { sqlite, env } = setup();
  for (let i = 1; i <= 8; i++) addPlayer(sqlite, `Jugador${i}`, [{ date: day(1), score: 10 - i }]);
  const result = await getRanking(env, W43, null);
  assert.equal(result.top.length, 5);
  assert.equal(result.players, 8);
  assert.equal(result.me, null);
});

test("desempate 1: más aciertos en la primera frase", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Dos", [{ date: day(1), score: 5, attempt: 2 }, { date: day(2), score: 5, attempt: 2 }]);
  addPlayer(sqlite, "Uno", [{ date: day(1), score: 10, attempt: 1 }]);
  const { top } = await getRanking(env, W43, null);
  assert.deepEqual(top.map((r) => r.nickname), ["Uno", "Dos"]);
});

test("desempate 2: quien llegó antes a ese total", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Tarde", [{ date: day(1), score: 10, at: "2026-10-25T20:00:00Z" }]);
  addPlayer(sqlite, "Temprano", [{ date: day(1), score: 10, at: "2026-10-25T09:00:00Z" }]);
  const { top } = await getRanking(env, W43, null);
  assert.deepEqual(top.map((r) => r.nickname), ["Temprano", "Tarde"]);
});

test("empate total: ordena por nickname, siempre igual", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Zeta", [{ date: day(1), score: 10 }]);
  addPlayer(sqlite, "Alfa", [{ date: day(1), score: 10 }]);
  const a = await getRanking(env, W43, null);
  const b = await getRanking(env, W43, null);
  assert.deepEqual(a.top.map((r) => r.nickname), ["Alfa", "Zeta"]);
  assert.deepEqual(a, b);
});

test("las partidas sin terminar no cuentan", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "EnCurso", [{ date: day(1), score: null, finished: 0 }]);
  addPlayer(sqlite, "Termino", [{ date: day(1), score: 3, attempt: 3 }]);
  const { top, players } = await getRanking(env, W43, null);
  assert.deepEqual(top.map((r) => r.nickname), ["Termino"]);
  assert.equal(players, 1);
});

test("cada semana tiene su ranking: los puntos de otra semana no se mezclan", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Veterano", [{ week: W43, date: day(1), score: 10 }, { week: W44, date: "2026-10-26", score: 3, attempt: 3 }]);
  const w43 = await getRanking(env, W43, null);
  const w44 = await getRanking(env, W44, null);
  assert.equal(w43.top[0].points, 10);
  assert.equal(w44.top[0].points, 3);
  assert.equal((await getRanking(env, "2026-W45", null)).top.length, 0);
});

test("tu posición aparece aunque estés fuera del top 5", async () => {
  const { sqlite, env } = setup();
  for (let i = 1; i <= 7; i++) addPlayer(sqlite, `Top${i}`, [{ date: day(1), score: 10, at: `2026-10-25T0${i}:00:00Z` }]);
  const me = addPlayer(sqlite, "Yo", [{ date: day(1), score: 3, attempt: 3 }]);
  const result = await getRanking(env, W43, me);
  assert.equal(result.top.length, 5);
  assert.equal(result.top.some((r) => r.you), false);
  assert.deepEqual(result.me, { position: 8, nickname: "Yo", points: 3, days: 1 });
  assert.equal(result.players, 8);
});

test("si estás en el top 5, queda marcado con you", async () => {
  const { sqlite, env } = setup();
  const me = addPlayer(sqlite, "Yo", [{ date: day(1), score: 10 }]);
  addPlayer(sqlite, "Otro", [{ date: day(1), score: 5, attempt: 2 }]);
  const result = await getRanking(env, W43, me);
  assert.deepEqual(result.top.map((r) => [r.nickname, r.you]), [["Yo", true], ["Otro", false]]);
  assert.equal(result.me.position, 1);
});

test("semana vacía: sin jugadores y sin errores", async () => {
  const { env } = setup();
  assert.deepEqual(await getRanking(env, W43, null), { week: W43, players: 0, top: [], me: null });
});

test("SEGURIDAD: la respuesta no expone ids de jugador ni campos internos", async () => {
  const { sqlite, env } = setup();
  const me = addPlayer(sqlite, "Yo", [{ date: day(1), score: 10 }]);
  const text = JSON.stringify(await getRanking(env, W43, me));
  assert.ok(!text.includes("player-"));
  assert.ok(!text.includes("player_id"));
  assert.ok(!text.includes("finished_at"));
});

test("SEGURIDAD: un nickname con caracteres especiales viaja como dato (el front usa textContent)", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "O'Brien \"x\"", [{ date: day(1), score: 10 }]);
  const { top } = await getRanking(env, W43, null);
  assert.equal(top[0].nickname, "O'Brien \"x\"");
});

test("API: /api/ranking es público, con no-store, e indica el domingo en que cierra la semana", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Alguien", [{ date: day(1), score: 10 }]);
  const res = await handle(new Request(ORIGIN + "/api/ranking"), env, SUNDAY);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  const data = await res.json();
  assert.equal(data.week, W43);
  assert.equal(data.weekEnds, "2026-10-25"); // el domingo es el último día
  assert.equal(data.me, null);
  assert.equal(data.top[0].nickname, "Alguien");
});

test("API: el lunes empieza otra semana (ranking vacío) y cierra el domingo siguiente", async () => {
  const { sqlite, env } = setup();
  addPlayer(sqlite, "Alguien", [{ date: day(1), score: 10 }]);
  const monday = new Date("2026-10-26T03:00:00Z"); // lunes 00:00 hora argentina
  const data = await (await handle(new Request(ORIGIN + "/api/ranking"), env, monday)).json();
  assert.equal(data.week, W44);
  assert.equal(data.weekEnds, "2026-11-01");
  assert.deepEqual(data.top, []);
});

test("API de punta a punta: al terminar una partida real aparecés en el ranking de esa semana", async () => {
  const { env } = setup();
  let cookie = "";
  const call = async (method, path, body) => {
    const headers = { Origin: ORIGIN, ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) };
    const res = await handle(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, SUNDAY);
    const set = res.headers.get("Set-Cookie");
    if (set) cookie = set.split(";")[0];
    return res.json();
  };
  await call("POST", "/api/join", { nickname: "Lucas" });
  assert.equal((await call("GET", "/api/ranking")).me, null); // todavía no terminó
  await call("POST", "/api/guess", { title: "Queso Ruso", artist: "Patricio Rey y sus Redonditos de Ricota" });
  const data = await call("GET", "/api/ranking");
  assert.deepEqual(data.me, { position: 1, nickname: "Lucas", points: 10, days: 1 });
  assert.equal(data.top[0].you, true);
});
