import { test } from "node:test";
import assert from "node:assert/strict";
import { getSongForDate, shuffle, daysBetween } from "../server/schedule.js";
import { addDays } from "../server/dates.js";
import { createTestDb, SEED_START } from "./helpers/d1.mjs";

const N = 30; // canciones del ejemplo
const dayOf = (cycle, index) => addDays(SEED_START, cycle * N + index);

function setup() {
  const { sqlite, d1 } = createTestDb();
  return { sqlite, env: { DB: d1 } };
}

const idsOfCycle = (sqlite, cycle) =>
  Array.from({ length: N }, (_, i) =>
    sqlite.prepare("SELECT song_id FROM schedule WHERE play_date = ?").get(dayOf(cycle, i))?.song_id
  );

test("primera vuelta: sale el calendario cargado, sin generar nada", async () => {
  const { env, sqlite } = setup();
  const song = await getSongForDate(env, SEED_START);
  assert.equal(song.titles[0], "Queso Ruso");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule").get().n, N);
});

test("segunda vuelta: usa las 30 canciones exactamente una vez, sin repetir", async () => {
  const { env, sqlite } = setup();
  await getSongForDate(env, dayOf(1, 0));
  const ids = idsOfCycle(sqlite, 1);
  assert.equal(ids.every((id) => Number.isInteger(id)), true);
  assert.equal(new Set(ids).size, N);
  assert.deepEqual([...ids].sort((a, b) => a - b), Array.from({ length: N }, (_, i) => i + 1));
});

test("el orden de la nueva vuelta es aleatorio, no la copia de la primera", async () => {
  const { env, sqlite } = setup();
  await getSongForDate(env, dayOf(1, 0));
  assert.notDeepEqual(idsOfCycle(sqlite, 1), idsOfCycle(sqlite, 0));
});

test("no abre la vuelta con la canción que cerró la anterior (50 intentos)", async () => {
  for (let i = 0; i < 50; i++) {
    const { env, sqlite } = setup();
    await getSongForDate(env, dayOf(1, 0));
    const last = idsOfCycle(sqlite, 0)[N - 1];
    assert.notEqual(idsOfCycle(sqlite, 1)[0], last);
  }
});

test("queda guardado: todos ven la misma canción y no se vuelve a sortear", async () => {
  const { env, sqlite } = setup();
  const day = dayOf(1, 5);
  const first = await getSongForDate(env, day);
  const before = idsOfCycle(sqlite, 1);
  const again = await getSongForDate(env, day);
  assert.deepEqual(again, first);
  assert.deepEqual(idsOfCycle(sqlite, 1), before);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule").get().n, N * 2);
});

test("pedidos simultáneos al estrenar la vuelta generan UN solo orden coherente", async () => {
  const { env, sqlite } = setup();
  const day = dayOf(1, 3);
  const results = await Promise.all(Array.from({ length: 8 }, () => getSongForDate(env, day)));
  assert.equal(new Set(results.map((r) => r.titles[0])).size, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule").get().n, N * 2);
  assert.equal(new Set(idsOfCycle(sqlite, 1)).size, N);
});

test("si nadie entró durante varias vueltas, se generan todas completas y sin repetir cada una", async () => {
  const { env, sqlite } = setup();
  await getSongForDate(env, dayOf(3, 10));
  for (const cycle of [1, 2, 3]) assert.equal(new Set(idsOfCycle(sqlite, cycle)).size, N, `vuelta ${cycle}`);
  for (const cycle of [1, 2, 3]) {
    assert.notEqual(idsOfCycle(sqlite, cycle)[0], idsOfCycle(sqlite, cycle - 1)[N - 1], `unión ${cycle - 1}→${cycle}`);
  }
});

test("antes del inicio del calendario no hay canción (no inventa)", async () => {
  const { env, sqlite } = setup();
  assert.equal(await getSongForDate(env, "2026-10-01"), null);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM schedule").get().n, N);
});

test("base vacía: no hay canción y no se rompe", async () => {
  const { d1 } = createTestDb({ seed: false });
  assert.equal(await getSongForDate({ DB: d1 }, SEED_START), null);
});

test("shuffle: conserva los elementos y no modifica el original", () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8];
  const mixed = shuffle(original);
  assert.deepEqual([...mixed].sort((a, b) => a - b), original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("shuffle: todas las posiciones son posibles (sin sesgo evidente)", () => {
  const firstSeen = new Set();
  for (let i = 0; i < 400; i++) firstSeen.add(shuffle([0, 1, 2, 3, 4])[0]);
  assert.equal(firstSeen.size, 5);
});

test("daysBetween", () => {
  assert.equal(daysBetween("2026-10-25", "2026-11-24"), 30);
  assert.equal(daysBetween("2026-10-25", "2026-10-20"), -5);
});
