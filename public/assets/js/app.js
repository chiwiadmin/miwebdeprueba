import { MAX_CLUES } from "./game-core.js";
import { validateNickname } from "./nickname.js";
import { suggestionOptions } from "./artists.js";
import { attachAutocomplete } from "./autocomplete.js";

const $ = (id) => document.getElementById(id);
const screens = { welcome: $("screen-welcome"), game: $("screen-game"), result: $("screen-result") };

const FEEDBACK = {
  artist_only: "Estás cerca: el artista es correcto, pero la canción no. Vamos con otra frase.",
  title_only: "Estás cerca: la canción es correcta, pero el artista no. Vamos con otra frase.",
  wrong: "No es esa. Vamos con otra frase.",
  skipped: "Otra frase en camino."
};

const ERRORS = {
  nickname_taken: "Ese nickname ya está en uso. Probá con otro.",
  invalid_nickname: "Ese nickname no es válido.",
  missing_fields: "Completá los campos que faltan.",
  not_joined: "Tu sesión venció. Ingresá tu nickname de nuevo.",
  no_song_today: "Hoy todavía no hay canción. Volvé más tarde.",
  already_finished: "Ya terminaste la partida de hoy."
};
const GENERIC_ERROR = "Algo salió mal. Probá de nuevo en unos segundos.";

let current = null;
let busy = false;
let songOptions = [];
let artistOptions = [];

async function api(path, body) {
  const options = { credentials: "same-origin" };
  if (body !== undefined) {
    options.method = "POST";
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(path, options);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

function show(name) {
  Object.entries(screens).forEach(([key, el]) => { el.hidden = key !== name; });
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll("form button").forEach((button) => { button.disabled = value; });
}

function message(id, text) {
  const box = $(id);
  box.hidden = !text;
  box.textContent = text || "";
}

function renderClues() {
  const list = $("clues");
  list.replaceChildren();
  current.clues.forEach((text, i) => {
    const li = document.createElement("li");
    const label = document.createElement("small");
    label.textContent = `Frase ${i + 1} de ${MAX_CLUES}`;
    li.append(label, document.createTextNode(`“${text}”`));
    list.append(li);
  });
}

function renderGame() {
  const game = current.game;
  $("player-name").textContent = current.nickname;
  $("game-progress").textContent = `Intento ${game.attempt} de ${MAX_CLUES}`;
  $("title-wrap").hidden = game.titleOk;
  $("title-ok").hidden = !game.titleOk;
  $("artist-wrap").hidden = game.artistOk;
  $("artist-ok").hidden = !game.artistOk;
  message("feedback", FEEDBACK[game.lastFeedback]);
  renderClues();
  $("guess-title").value = "";
  $("guess-artist").value = "";
  show("game");
  (game.titleOk ? $("guess-artist") : $("guess-title")).focus();
}

function formatDay(isoDate) {
  const [, month, day] = isoDate.split("-");
  return `${Number(day)}/${Number(month)}`;
}

async function renderRanking() {
  const box = $("ranking");
  const response = await api("/api/ranking");
  const data = response.data;
  if (!response.ok || !Array.isArray(data.top) || !data.top.length) { box.hidden = true; return; }

  $("ranking-note").textContent = `Semana hasta el domingo ${formatDay(data.weekEnds)} · ${data.players} ${data.players === 1 ? "jugador" : "jugadores"}`;

  const list = $("ranking-list");
  list.replaceChildren();
  data.top.forEach((row) => {
    const li = document.createElement("li");
    if (row.you) li.className = "is-you";
    const position = document.createElement("span");
    position.className = row.position <= 3 ? `pos rank-${row.position}` : "pos";
    position.textContent = String(row.position);
    position.setAttribute("aria-label", `Puesto ${row.position}`);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = row.you ? `${row.nickname} (vos)` : row.nickname;
    const points = document.createElement("span");
    points.className = "pts";
    points.textContent = `${row.points} pts`;
    li.append(position, name, points);
    list.append(li);
  });

  const mine = $("ranking-me");
  const outside = data.me && !data.top.some((row) => row.you);
  mine.hidden = !outside;
  if (outside) mine.textContent = `Tu posición: ${data.me.position}° de ${data.players} · ${data.me.points} pts`;
  box.hidden = false;
}

function renderResult() {
  const { game, answer } = current;
  $("result-title").textContent = game.won ? `¡Acertaste, ${current.nickname}!` : "Esta vez no fue";
  $("result-score").textContent = game.score;
  $("result-detail").textContent = `La canción era “${answer.title}” de ${answer.artist}.`;
  $("ranking").hidden = true;
  show("result");
  renderRanking();
}

function apply(state) {
  current = state;
  if (!state.joined) return show("welcome");
  if (state.error) { show("welcome"); return message("nick-error", ERRORS[state.error] || GENERIC_ERROR); }
  if (state.game.finished) return renderResult();
  renderGame();
}

function failureText(response) {
  return ERRORS[response.data.error] || GENERIC_ERROR;
}

async function send(path, body, errorBoxId) {
  if (busy) return;
  setBusy(true);
  const response = await api(path, body);
  setBusy(false);
  const state = response.data.state || response.data;
  if (response.ok || (response.data.state && response.data.error)) {
    if (!response.ok) message(errorBoxId, failureText(response));
    apply(state);
    return;
  }
  message(errorBoxId, failureText(response));
}

$("nick-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = validateNickname($("nick").value);
  if (!result.ok) return message("nick-error", result.error);
  message("nick-error", "");
  await send("/api/join", { nickname: result.value }, "nick-error");
});

$("guess-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("guess-title").value.trim();
  const artist = $("guess-artist").value.trim();
  const needsTitle = !current.game.titleOk;
  const needsArtist = !current.game.artistOk;
  if ((needsTitle && !title) || (needsArtist && !artist)) {
    message("feedback", needsTitle && needsArtist ? "Completá la canción y el artista." : needsTitle ? "Completá la canción." : "Completá el artista.");
    (needsTitle && !title ? $("guess-title") : $("guess-artist")).focus();
    return;
  }
  await send("/api/guess", { title, artist }, "feedback");
});

$("skip-btn").addEventListener("click", () => send("/api/skip", {}, "feedback"));

async function init() {
  attachAutocomplete($("guess-title"), () => songOptions);
  attachAutocomplete($("guess-artist"), () => artistOptions);

  const [artistsRes, catalogRes] = await Promise.all([
    fetch("assets/data/artists.json").catch(() => null),
    fetch("assets/data/songs-catalog.json").catch(() => null)
  ]);
  if (artistsRes && artistsRes.ok) artistOptions = suggestionOptions(await artistsRes.json());
  if (catalogRes && catalogRes.ok) songOptions = (await catalogRes.json()).map((value) => ({ value }));

  const response = await api("/api/state");
  if (!response.ok && !response.data.joined) {
    show("welcome");
    message("nick-error", "No pudimos conectar con el juego. Recargá la página.");
    return;
  }
  apply(response.data);
}

init();
