import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize, levenshtein, matchesAny, scoreForAttempt, newGame, submitGuess, skipClue
} from "../public/assets/js/game-core.js";
import { readFileSync } from "node:fs";
import { withArtists } from "../public/assets/js/artists.js";

const artistList = JSON.parse(readFileSync(new URL("../public/assets/data/artists.json", import.meta.url), "utf8"));
const SONG_OF_THE_DAY = { titles: ["Queso Ruso"], artist: "Patricio Rey y sus Redonditos de Ricota" };
const song = withArtists(SONG_OF_THE_DAY, artistList);

test("normalize: tildes, mayúsculas y puntuación", () => {
  assert.equal(normalize("  ¡Canción,  ÁÉÍ! "), "cancion aei");
});

test("levenshtein: distancias básicas", () => {
  assert.equal(levenshtein("casa", "casa"), 0);
  assert.equal(levenshtein("casa", "caza"), 1);
  assert.equal(levenshtein("", "abc"), 3);
});

test("matchesAny: tolera tildes, case y un typo", () => {
  assert.ok(matchesAny("QUESO ruso", song.titles));
  assert.ok(matchesAny("queso russo", song.titles));
  assert.ok(!matchesAny("nueva roma", song.titles));
  assert.ok(!matchesAny("", song.titles));
});

test("matchesAny: alias de artista (nombre parcial)", () => {
  assert.ok(matchesAny("Patricio Rey", song.artists));
  assert.ok(matchesAny("los redondos", song.artists));
  assert.ok(!matchesAny("Soda Stereo", song.artists));
});

test("matchesAny: palabras cortas no admiten typos", () => {
  assert.ok(!matchesAny("ji ji jo", ["ji ji ji"]));
});

test("puntajes 10 / 5 / 3 / 0", () => {
  assert.deepEqual([1, 2, 3, 4].map(scoreForAttempt), [10, 5, 3, 0]);
});

const full = { title: "Queso Ruso", artist: "Patricio Rey y sus Redonditos de Ricota" };

test("acierto de canción Y artista en el 1er intento = 10", () => {
  const s = submitGuess(newGame(), song, full);
  assert.equal(s.won, true);
  assert.equal(s.score, 10);
  assert.equal(s.finished, true);
});

test("CORRECCIÓN: acertar solo la canción, sin artista, NO gana", () => {
  const s = submitGuess(newGame(), song, { title: "Queso Ruso", artist: "" });
  assert.equal(s.won, false);
  assert.equal(s.finished, false);
  assert.equal(s.titleOk, true);
  assert.equal(s.lastFeedback, "title_only");
  assert.equal(s.attempt, 2);
});

test("CORRECCIÓN: canción correcta con artista incorrecto NO gana", () => {
  const s = submitGuess(newGame(), song, { title: "Queso Ruso", artist: "Soda Stereo" });
  assert.equal(s.won, false);
  assert.equal(s.artistOk, false);
});

test("canción acertada antes se conserva; luego solo falta el artista (2do intento = 5)", () => {
  let s = submitGuess(newGame(), song, { title: "Queso Ruso", artist: "" });
  s = submitGuess(s, song, { title: "", artist: "Los Redondos" });
  assert.equal(s.won, true);
  assert.equal(s.score, 5);
});

test("ejemplo del enunciado: falla con artista parcial, luego acierta la canción en el 2do = 5", () => {
  let s = submitGuess(newGame(), song, { title: "Nueva Roma", artist: "Patricio Rey" });
  assert.equal(s.lastFeedback, "artist_only");
  assert.equal(s.artistOk, true);
  assert.equal(s.attempt, 2);
  assert.equal(s.finished, false);
  s = submitGuess(s, song, { title: "Queso Ruso", artist: "" });
  assert.equal(s.won, true);
  assert.equal(s.score, 5);
});

test("el artista acertado se conserva en intentos siguientes", () => {
  let s = submitGuess(newGame(), song, { title: "x", artist: "Los Redondos" });
  s = submitGuess(s, song, { title: "y", artist: "" });
  assert.equal(s.artistOk, true);
  assert.equal(s.lastFeedback, "wrong");
});

test("acierto completo en el 3er intento = 3", () => {
  let s = submitGuess(newGame(), song, { title: "a", artist: "b" });
  s = submitGuess(s, song, { title: "b", artist: "c" });
  s = submitGuess(s, song, full);
  assert.equal(s.score, 3);
});

test("tres fallos = 0 puntos y fin de partida", () => {
  let s = newGame();
  for (const t of ["a", "b", "c"]) s = submitGuess(s, song, { title: t, artist: "z" });
  assert.equal(s.finished, true);
  assert.equal(s.won, false);
  assert.equal(s.score, 0);
});

test("canción acertada pero artista nunca: en el 3er intento termina con 0", () => {
  let s = submitGuess(newGame(), song, { title: "Queso Ruso", artist: "" });
  s = submitGuess(s, song, { title: "", artist: "nadie" });
  s = submitGuess(s, song, { title: "", artist: "otro" });
  assert.equal(s.won, false);
  assert.equal(s.score, 0);
});

test("pedir otra frase consume un intento", () => {
  let s = skipClue(newGame());
  assert.equal(s.attempt, 2);
  s = submitGuess(s, song, full);
  assert.equal(s.score, 5);
});

test("rendirse en la última frase = 0", () => {
  let s = skipClue(skipClue(skipClue(newGame())));
  assert.equal(s.finished, true);
  assert.equal(s.score, 0);
});

test("una partida terminada no cambia", () => {
  const done = submitGuess(newGame(), song, full);
  assert.equal(submitGuess(done, song, { title: "otra", artist: "x" }), done);
  assert.equal(skipClue(done), done);
});
