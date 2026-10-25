import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { acceptedNames, suggestionOptions, findDuplicates, withArtists } from "../public/assets/js/artists.js";
import { matchesAny, normalize } from "../public/assets/js/game-core.js";
const SONG_OF_THE_DAY = { titles: ["Queso Ruso"], artist: "Patricio Rey y sus Redonditos de Ricota" };

const list = JSON.parse(readFileSync(new URL("../public/assets/data/artists.json", import.meta.url), "utf8"));
const names = list.map((a) => a.name);

test("el diccionario tiene al menos 190 artistas", () => {
  assert.ok(list.length >= 190, `solo hay ${list.length}`);
});

test("cada entrada tiene nombre y alias válidos", () => {
  for (const a of list) {
    assert.ok(typeof a.name === "string" && a.name.trim().length > 0);
    assert.ok(Array.isArray(a.aliases));
    a.aliases.forEach((x) => assert.ok(typeof x === "string" && x.trim().length > 0));
  }
});

test("no hay nombres canónicos repetidos", () => {
  const keys = names.map(normalize);
  assert.equal(new Set(keys).size, keys.length);
});

test("ningún nombre o alias apunta a dos artistas distintos", () => {
  assert.deepEqual(findDuplicates(list), []);
});

test("cubre desde las bandas emblemáticas hasta los artistas actuales", () => {
  for (const must of ["Los Gatos", "Sui Generis", "Soda Stereo", "Lali", "Dillom"]) {
    assert.ok(names.includes(must), `falta ${must}`);
  }
});

test("la canción de prueba usa un artista que existe en el diccionario", () => {
  assert.ok(names.includes(SONG_OF_THE_DAY.artist));
  assert.ok(withArtists(SONG_OF_THE_DAY, list).artists.length > 1);
});

test("los alias del artista se aceptan como respuesta", () => {
  const accepted = acceptedNames(list, "Patricio Rey y sus Redonditos de Ricota");
  assert.ok(matchesAny("los redondos", accepted));
  assert.ok(matchesAny("PATRICIO REY", accepted));
  assert.ok(!matchesAny("Soda Stereo", accepted));
});

test("un artista desconocido no acepta nada", () => {
  assert.deepEqual(acceptedNames(list, "Banda Inexistente"), []);
});

test("las sugerencias incluyen alias etiquetados con el nombre canónico", () => {
  const options = suggestionOptions(list);
  const redondos = options.find((o) => o.value === "Los Redondos");
  assert.equal(redondos.label, "Patricio Rey y sus Redonditos de Ricota");
  assert.ok(options.length > list.length);
});

test("el diccionario no contiene HTML ni caracteres de control", () => {
  const all = list.flatMap((a) => [a.name, ...a.aliases]);
  all.forEach((t) => assert.ok(!/[<>"\u0000-\u001f]/.test(t), t));
});

import { suggest } from "../public/assets/js/autocomplete.js";

const artistOptions = suggestionOptions(list);

test("autocompletado: prefijo del nombre sugiere el artista", () => {
  assert.ok(suggest(artistOptions, "sod").includes("Soda Stereo"));
  assert.ok(suggest(artistOptions, "lal").includes("Lali"));
  assert.ok(suggest(artistOptions, "dil").includes("Dillom"));
});

test("autocompletado: un alias sugiere el nombre canónico (una sola vez)", () => {
  const result = suggest(artistOptions, "redondos");
  assert.deepEqual(result.filter((n) => n === "Patricio Rey y sus Redonditos de Ricota").length, 1);
});

test("autocompletado: ignora tildes y mayúsculas", () => {
  assert.ok(suggest(artistOptions, "SERU").includes("Serú Girán"));
  assert.ok(suggest(artistOptions, "fito pa").includes("Fito Páez"));
});

test("autocompletado: palabra del medio y texto vacío", () => {
  assert.ok(suggest(artistOptions, "stereo").includes("Soda Stereo"));
  assert.deepEqual(suggest(artistOptions, ""), []);
  assert.deepEqual(suggest(artistOptions, "zzzzqq"), []);
});

test("autocompletado: respeta el límite y prioriza los que empiezan igual", () => {
  const result = suggest(artistOptions, "los", 5);
  assert.equal(result.length, 5);
  assert.ok(result.every((n) => /^los /i.test(n) || artistOptions.some((o) => (o.label || o.value) === n && /^los /i.test(o.value))));
});

test("autocompletado: también funciona para canciones (sin etiquetas)", () => {
  const songs = ["Queso Ruso", "Nueva Roma", "Ji ji ji"].map((value) => ({ value }));
  assert.deepEqual(suggest(songs, "que"), ["Queso Ruso"]);
  assert.deepEqual(suggest(songs, "roma"), ["Nueva Roma"]);
});
