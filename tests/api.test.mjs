import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle as handleRequest } from "../server/api.js";
import { createTestDb } from "./helpers/d1.mjs";

const artistList = JSON.parse(readFileSync(new URL("../public/assets/data/artists.json", import.meta.url), "utf8"));
const handle = (request, env, now) => handleRequest(request, env, now, artistList);

const ORIGIN = "https://juego.test";
const DAY1 = new Date("2026-10-25T15:00:00Z"); // Queso Ruso
const DAY2 = new Date("2026-10-26T15:00:00Z"); // "Canción de prueba 02"
const FULL = { title: "Queso Ruso", artist: "Patricio Rey y sus Redonditos de Ricota" };

function setup() {
  const { sqlite, d1 } = createTestDb();
  return { sqlite, env: { DB: d1, SESSION_SECRET: "test-secret-aaaaaaaaaaaaaaaaaaaaaaaa" } };
}

/** A tiny browser: keeps the cookie between calls. */
function client(env, now = DAY1) {
  let cookie = "";
  async function call(method, path, body, extra = {}) {
    const headers = { Origin: ORIGIN, ...extra };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const res = await handle(new Request(ORIGIN + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, now);
    const setCookie = res.headers.get("Set-Cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, headers: res.headers, text, data: text ? JSON.parse(text) : null };
  }
  return {
    get: (path) => call("GET", path),
    post: (path, body, extra) => call("POST", path, body, extra),
    setNow: (date) => { now = date; },
    cookie: () => cookie,
    setCookie: (value) => { cookie = value; }
  };
}

async function joined(env, nickname = "Lucas", now = DAY1) {
  const c = client(env, now);
  const res = await c.post("/api/join", { nickname });
  assert.equal(res.status, 200);
  return c;
}

test("sin sesión: state indica que no se unió", async () => {
  const { env } = setup();
  const res = await client(env).get("/api/state");
  assert.equal(res.status, 200);
  assert.equal(res.data.joined, false);
});

test("join crea la cookie HttpOnly firmada y devuelve solo la primera frase", async () => {
  const { env } = setup();
  const c = client(env);
  const res = await c.post("/api/join", { nickname: "Lucas" });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get("Set-Cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Secure/);
  assert.deepEqual(res.data.clues, ["El bronceador Charlotte te cuida de la radiación"]);
  assert.equal(res.data.game.attempt, 1);
});

test("SEGURIDAD: el estado inicial no filtra la respuesta ni las frases 2 y 3", async () => {
  const { env } = setup();
  const c = await joined(env);
  const res = await c.get("/api/state");
  assert.ok(!res.text.includes("Queso Ruso"));
  assert.ok(!res.text.includes("Redonditos"));
  assert.ok(!res.text.includes("mosca"));
  assert.ok(!res.text.includes("Tercera"));
  assert.equal(res.data.answer, undefined);
});

test("nickname único: repetido, con otra capitalización o con puntuación es rechazado", async () => {
  const { env } = setup();
  await joined(env, "Lucas R");
  for (const dup of ["Lucas R", "lucas r", "LUCAS.R", "Lucás R"]) {
    const res = await client(env).post("/api/join", { nickname: dup });
    assert.equal(res.status, 409, dup);
    assert.equal(res.data.error, "nickname_taken");
  }
});

test("nickname inválido: HTML, muy corto, solo símbolos", async () => {
  const { env } = setup();
  for (const bad of ["<script>x</script>", "ab", "___", "", 123, null]) {
    const res = await client(env).post("/api/join", { nickname: bad });
    assert.equal(res.status, 400, String(bad));
  }
});

test("quien ya tiene sesión y vuelve a hacer join conserva su identidad", async () => {
  const { env } = setup();
  const c = await joined(env, "Lucas");
  const again = await c.post("/api/join", { nickname: "Otro Nombre" });
  assert.equal(again.status, 200);
  assert.equal(again.data.nickname, "Lucas");
});

test("acierto completo en el 1er intento = 10 puntos y revela la respuesta", async () => {
  const { env } = setup();
  const c = await joined(env);
  const res = await c.post("/api/guess", FULL);
  assert.equal(res.status, 200);
  assert.equal(res.data.game.won, true);
  assert.equal(res.data.game.score, 10);
  assert.deepEqual(res.data.answer, { title: "Queso Ruso", artist: FULL.artist });
});

test("ejemplo del enunciado: artista parcial en el 1ro, canción en el 2do = 5 puntos", async () => {
  const { env } = setup();
  const c = await joined(env);
  let res = await c.post("/api/guess", { title: "Nueva Roma", artist: "Patricio Rey" });
  assert.equal(res.data.game.lastFeedback, "artist_only");
  assert.equal(res.data.game.artistOk, true);
  assert.equal(res.data.clues.length, 2);
  assert.equal(res.data.clues[1], "Sentís la mosca joder detrás de la oreja");
  res = await c.post("/api/guess", { title: "queso ruso", artist: "" });
  assert.equal(res.data.game.won, true);
  assert.equal(res.data.game.score, 5);
});

test("solo la canción, sin artista, no gana (regla de ambos)", async () => {
  const { env } = setup();
  const c = await joined(env);
  const res = await c.post("/api/guess", { title: "Queso Ruso", artist: "Soda Stereo" });
  assert.equal(res.data.game.won, false);
  assert.equal(res.data.game.titleOk, true);
  assert.equal(res.data.game.lastFeedback, "title_only");
});

test("tres fallos = 0 puntos, se revela la respuesta y se muestran las 3 frases", async () => {
  const { env } = setup();
  const c = await joined(env);
  let res;
  for (const t of ["a", "b", "c"]) res = await c.post("/api/guess", { title: t, artist: "z" });
  assert.equal(res.data.game.finished, true);
  assert.equal(res.data.game.score, 0);
  assert.equal(res.data.clues.length, 3);
  assert.equal(res.data.answer.title, "Queso Ruso");
});

test("una vez terminada la partida no se puede seguir jugando", async () => {
  const { env } = setup();
  const c = await joined(env);
  await c.post("/api/guess", FULL);
  const res = await c.post("/api/guess", FULL);
  assert.equal(res.status, 409);
  assert.equal(res.data.error, "already_finished");
  const skip = await c.post("/api/skip", {});
  assert.equal(skip.status, 409);
});

test("skip consume un intento y desbloquea otra frase", async () => {
  const { env } = setup();
  const c = await joined(env);
  const res = await c.post("/api/skip", {});
  assert.equal(res.data.game.attempt, 2);
  assert.equal(res.data.clues.length, 2);
});

test("campos pendientes vacíos no gastan intento", async () => {
  const { env } = setup();
  const c = await joined(env);
  const res = await c.post("/api/guess", { title: "", artist: "" });
  assert.equal(res.status, 400);
  assert.equal(res.data.error, "missing_fields");
  assert.equal((await c.get("/api/state")).data.game.attempt, 1);
});

test("el progreso persiste: otro 'navegador' con la misma cookie ve el mismo estado", async () => {
  const { env } = setup();
  const c = await joined(env);
  await c.post("/api/guess", { title: "x", artist: "Los Redondos" });
  const other = client(env);
  other.setCookie(c.cookie());
  const res = await other.get("/api/state");
  assert.equal(res.data.game.attempt, 2);
  assert.equal(res.data.game.artistOk, true);
});

test("una partida por día: al cambiar el día (hora argentina) hay otra canción y otro intento", async () => {
  const { env } = setup();
  const c = await joined(env);
  await c.post("/api/guess", FULL);
  c.setNow(DAY2);
  const res = await c.get("/api/state");
  assert.equal(res.data.game.finished, false);
  assert.equal(res.data.game.attempt, 1);
  assert.match(res.data.clues[0], /Frase 1 de la canción 02/);
});

test("el día argentino manda, no el UTC: 02:30 UTC del 26 sigue siendo el 25", async () => {
  const { env } = setup();
  const c = await joined(env);
  c.setNow(new Date("2026-10-26T02:30:00Z"));
  const res = await c.get("/api/state");
  assert.equal(res.data.date, "2026-10-25");
  assert.equal(res.data.clues[0], "El bronceador Charlotte te cuida de la radiación");
});

test("sin canción para hoy (antes del inicio del calendario): 503 y no se rompe", async () => {
  const { env } = setup();
  const c = await joined(env);
  c.setNow(new Date("2026-10-20T12:00:00Z"));
  const res = await c.get("/api/state");
  assert.equal(res.status, 503);
  assert.equal(res.data.error, "no_song_today");
});

test("SEGURIDAD: cookie manipulada o ajena no sirve", async () => {
  const { env } = setup();
  const a = await joined(env, "Alicia");
  const [name, value] = a.cookie().split("=");
  const forged = client(env);
  forged.setCookie(`${name}=${value.slice(0, -2)}xx`);
  assert.equal((await forged.get("/api/state")).data.joined, false);
  assert.equal((await forged.post("/api/guess", FULL)).status, 401);

  const noSignature = client(env);
  noSignature.setCookie(`${name}=${value.split(".")[0]}`);
  assert.equal((await noSignature.get("/api/state")).data.joined, false);
});

test("SEGURIDAD: cookie firmada con otro secreto es rechazada", async () => {
  const { env, sqlite } = setup();
  const a = await joined(env, "Alicia");
  const other = { ...env, SESSION_SECRET: "otro-secreto-completamente-distinto-1234" };
  const c = client(other);
  c.setCookie(a.cookie());
  assert.equal((await c.get("/api/state")).data.joined, false);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM players").get().n, 1);
});

test("SEGURIDAD: origen cruzado → 403, sin JSON → 415, cuerpo enorme → 413, JSON roto → 400", async () => {
  const { env } = setup();
  const c = await joined(env);
  assert.equal((await c.post("/api/guess", FULL, { Origin: "https://malo.example" })).status, 403);
  assert.equal((await c.post("/api/guess", FULL, { Origin: "null" })).status, 403);

  const noJson = await handle(new Request(ORIGIN + "/api/guess", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "text/plain", Cookie: c.cookie() }, body: "x" }), env, DAY1);
  assert.equal(noJson.status, 415);

  const big = await c.post("/api/guess", { title: "a".repeat(3000), artist: "" });
  assert.equal(big.status, 413);

  const broken = await handle(new Request(ORIGIN + "/api/guess", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", Cookie: c.cookie() }, body: "{no es json" }), env, DAY1);
  assert.equal(broken.status, 400);
});

test("SEGURIDAD: campos demasiado largos se rechazan sin gastar intento", async () => {
  const { env } = setup();
  const c = await joined(env);
  const res = await c.post("/api/guess", { title: "a".repeat(101), artist: "" });
  assert.equal(res.status, 400);
  assert.equal(res.data.error, "field_too_long");
});

test("SEGURIDAD: rutas y métodos desconocidos → 404; respuestas con no-store", async () => {
  const { env } = setup();
  const c = await joined(env);
  assert.equal((await c.get("/api/guess")).status, 404);
  assert.equal((await c.get("/api/admin")).status, 404);
  assert.equal((await c.get("/api/state")).headers.get("Cache-Control"), "no-store");
});

test("sin secreto o sin base configurados: error controlado", async () => {
  const res = await handle(new Request(ORIGIN + "/api/state"), {}, DAY1);
  assert.equal(res.status, 500);
});

test("CONCURRENCIA: dos intentos que leen el mismo estado no se cuentan doble", async () => {
  const { env, sqlite } = setup();
  const c = await joined(env);

  // Barrier: both requests must have READ the play row before either one writes.
  let arrivals = 0;
  let release;
  const bothRead = new Promise((resolve) => { release = resolve; });
  const racing = {
    ...env,
    DB: {
      prepare(sql) {
        const statement = env.DB.prepare(sql);
        if (!/^SELECT attempt, title_ok/.test(sql)) return statement;
        return {
          bind: (...values) => { statement.bind(...values); return racing.DB.wrapped(statement); }
        };
      },
      wrapped(statement) {
        return {
          async first() {
            const row = await statement.first();
            if (++arrivals === 2) release();
            await bothRead;
            return row;
          },
          run: () => statement.run(),
          all: () => statement.all()
        };
      }
    }
  };

  const cookie = c.cookie();
  const one = client(racing); one.setCookie(cookie);
  const two = client(racing); two.setCookie(cookie);
  const [r1, r2] = await Promise.all([
    one.post("/api/guess", { title: "a", artist: "z" }),
    two.post("/api/guess", { title: "b", artist: "z" })
  ]);

  assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
  assert.equal(sqlite.prepare("SELECT attempt FROM plays").get().attempt, 2);
  const loser = r1.status === 409 ? r1 : r2;
  assert.equal(loser.data.error, "conflict");
  assert.equal(loser.data.state.game.attempt, 2);
});

test("la tabla plays impone una sola fila por jugador y día, con su week_key", async () => {
  const { env, sqlite } = setup();
  const c = await joined(env);
  await c.get("/api/state");
  await c.get("/api/state");
  await c.post("/api/skip", {});
  const rows = sqlite.prepare("SELECT play_date, week_key FROM plays").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].week_key, "2026-W43");
});

test("el puntaje queda guardado en la base al terminar", async () => {
  const { env, sqlite } = setup();
  const c = await joined(env);
  await c.post("/api/skip", {});
  await c.post("/api/guess", FULL);
  const row = sqlite.prepare("SELECT score, won, finished, finished_at FROM plays").get();
  assert.equal(row.score, 5);
  assert.equal(row.won, 1);
  assert.equal(row.finished, 1);
  assert.ok(row.finished_at);
});

test("pasados los 30 días el juego sigue: hay canción y se puede jugar", async () => {
  const { env } = setup();
  const c = await joined(env);
  c.setNow(new Date("2026-12-10T12:00:00Z")); // día 47 del calendario
  const res = await c.get("/api/state");
  assert.equal(res.status, 200);
  assert.equal(res.data.clues.length, 1);
  assert.equal((await c.post("/api/skip", {})).status, 200);
});
