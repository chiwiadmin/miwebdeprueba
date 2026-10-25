/*
  Artist dictionary helpers.
  assets/data/artists.json holds [{ name, aliases }]: one canonical name per artist plus
  common aliases. The same file feeds the autocomplete and the answer validation, so an
  artist is written once and every song reuses it.
*/

import { normalize } from "./game-core.js";

/** Canonical name + aliases for an artist, or [] when it is not in the dictionary. */
export function acceptedNames(list, canonicalName) {
  const entry = list.find((item) => item.name === canonicalName);
  return entry ? [entry.name, ...entry.aliases] : [];
}

/** Attaches the accepted artist names to a song that only stores its canonical `artist`. */
export function withArtists(song, list) {
  return { ...song, artists: acceptedNames(list, song.artist) };
}

/** Autocomplete options: canonical names and aliases, each labelled with the canonical name. */
export function suggestionOptions(list) {
  const options = [];
  for (const { name, aliases } of list) {
    options.push({ value: name, label: name });
    for (const alias of aliases) options.push({ value: alias, label: name });
  }
  return options;
}

/** Normalized names/aliases that appear in more than one entry (ambiguous on purpose-free lists). */
export function findDuplicates(list) {
  const seen = new Map();
  const duplicates = [];
  for (const { name, aliases } of list) {
    for (const text of [name, ...aliases]) {
      const key = normalize(text);
      if (seen.has(key) && seen.get(key) !== name) duplicates.push(text);
      seen.set(key, name);
    }
  }
  return duplicates;
}
