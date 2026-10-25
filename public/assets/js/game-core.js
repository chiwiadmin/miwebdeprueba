/*
  Game core: pure logic, no DOM, no network.
  Same rules will be enforced server-side in Stage 2; this copy drives the prototype.
*/

export const MAX_CLUES = 3;
export const SCORE_BY_ATTEMPT = [10, 5, 3];

export function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

// Counts letters only, so short titles with spaces ("ji ji ji") stay strict.
function allowedDistance(normalized) {
  const letters = normalized.replace(/\s/g, "").length;
  if (letters <= 6) return 0;
  if (letters <= 12) return 1;
  return 2;
}

/** True when `input` matches any accepted name, tolerating accents, case and small typos. */
export function matchesAny(input, accepted) {
  const candidate = normalize(input);
  if (!candidate) return false;
  return accepted.some((name) => {
    const target = normalize(name);
    return levenshtein(candidate, target) <= allowedDistance(target);
  });
}

export function scoreForAttempt(attemptNumber) {
  return SCORE_BY_ATTEMPT[attemptNumber - 1] ?? 0;
}

export function newGame() {
  return { attempt: 1, titleOk: false, artistOk: false, finished: false, won: false, score: null, lastFeedback: null };
}

/**
 * Applies a guess. Winning requires BOTH song and artist; a part guessed earlier is kept.
 * Returns a new state whose `lastFeedback` is one of:
 *  correct | title_only | artist_only | wrong | skipped | wrong_final
 */
export function submitGuess(state, song, { title, artist }) {
  if (state.finished) return state;

  const titleOk = state.titleOk || (title ? matchesAny(title, song.titles) : false);
  const artistOk = state.artistOk || (artist ? matchesAny(artist, song.artists) : false);

  if (titleOk && artistOk) {
    return { ...state, titleOk, artistOk, finished: true, won: true, score: scoreForAttempt(state.attempt), lastFeedback: "correct" };
  }

  let feedback = "wrong";
  if (titleOk && !state.titleOk) feedback = "title_only";
  else if (artistOk && !state.artistOk) feedback = "artist_only";
  return advance(state, { titleOk, artistOk }, feedback);
}

/** Player asks for another phrase without guessing; it consumes an attempt. */
export function skipClue(state) {
  if (state.finished) return state;
  return advance(state, { titleOk: state.titleOk, artistOk: state.artistOk }, "skipped");
}

function advance(state, found, feedback) {
  if (state.attempt >= MAX_CLUES) {
    return { ...state, ...found, finished: true, won: false, score: 0, lastFeedback: "wrong_final" };
  }
  return { ...state, ...found, attempt: state.attempt + 1, lastFeedback: feedback };
}
