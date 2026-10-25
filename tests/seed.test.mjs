import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSeed } from "../scripts/seed-lib.mjs";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const artists = read("../public/assets/data/artists.json");
const example = read("../db/songs.example.json");

const realSong = (n) => ({ titles: [`Título real ${n}`], artist: "Soda Stereo", clues: [`uno ${n}`, `dos ${n}`, `tres ${n}`] });
const realData = (count = 30) => ({ startDate: "2026-11-02", songs: Array.from({ length: count }, (_, i) => realSong(i)) });

test("el ejemplo tiene 30 días y genera SQL con --allow-test", () => {
  assert.equal(example.songs.length, 30);
  const { errors, sql } = buildSeed(example, artists, { allowTest: true });
  assert.deepEqual(errors, []);
  assert.equal((sql.match(/INSERT INTO schedule/g) || []).length, 30);
});

test("PRODUCCIÓN: rechaza el ejemplo porque tiene textos de prueba", () => {
  const { errors, sql } = buildSeed(example, artists);
  assert.equal(sql, null);
  assert.ok(errors.some((e) => /prueba/i.test(e)));
});

test("30 canciones reales válidas se aceptan y quedan en días consecutivos", () => {
  const { errors, sql } = buildSeed(realData(), artists);
  assert.deepEqual(errors, []);
  assert.match(sql, /'2026-11-02', 1\)/);
  assert.match(sql, /'2026-12-01', 30\)/);
});

test("rechaza cantidad distinta de 30 en producción", () => {
  assert.ok(buildSeed(realData(29), artists).errors.some((e) => /30/.test(e)));
  assert.ok(buildSeed(realData(31), artists).errors.some((e) => /30/.test(e)));
});

test("rechaza artista que no existe en el diccionario", () => {
  const data = realData();
  data.songs[3].artist = "Soda Estereo";
  assert.ok(buildSeed(data, artists).errors.some((e) => /Soda Estereo/.test(e)));
});

test("rechaza canciones sin exactamente 3 frases o con frases vacías", () => {
  const data = realData();
  data.songs[0].clues = ["solo una"];
  data.songs[1].clues = ["a", "", "c"];
  assert.equal(buildSeed(data, artists).errors.length, 2);
});

test("rechaza títulos repetidos entre días", () => {
  const data = realData();
  data.songs[5].titles = ["TÍTULO REAL 0"];
  assert.ok(buildSeed(data, artists).errors.some((e) => /ya se usa/.test(e)));
});

test("rechaza fecha de inicio inválida", () => {
  const data = realData();
  data.startDate = "02/11/2026";
  assert.ok(buildSeed(data, artists).errors.some((e) => /startDate/.test(e)));
});

test("SEGURIDAD: las comillas en títulos o frases no rompen ni inyectan SQL", () => {
  const data = realData();
  data.songs[0].titles = ["It's; DROP TABLE players; --"];
  data.songs[0].clues[0] = "l'amour'); DELETE FROM plays; --";
  const { errors, sql } = buildSeed(data, artists);
  assert.deepEqual(errors, []);
  assert.ok(sql.includes("'It''s; DROP TABLE players; --'") || sql.includes("It''s; DROP TABLE players; --"));
  assert.ok(sql.includes("'l''amour''); DELETE FROM plays; --'"));
});

test("--days: acepta una cantidad distinta de 30 cuando se indica expresamente", () => {
  const { errors, sql } = buildSeed(realData(20), artists, { expectedDays: 20 });
  assert.deepEqual(errors, []);
  assert.equal((sql.match(/INSERT INTO schedule/g) || []).length, 20);
  assert.ok(buildSeed(realData(20), artists).errors.some((e) => /30/.test(e)));
});

test("producción: una frase marcada [REVISAR] bloquea la carga", () => {
  const data = realData();
  data.songs[7].clues[1] = "texto cortado [REVISAR]";
  const { errors, sql } = buildSeed(data, artists);
  assert.equal(sql, null);
  assert.ok(errors.some((e) => /Canción 8/.test(e) && /REVISAR/.test(e)));
});
