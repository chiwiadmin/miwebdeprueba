/*
  Lightweight accessible autocomplete (ARIA combobox pattern), used by both the
  song and the artist inputs. Replaces <datalist>, whose behaviour with aliases
  and on mobile differs between browsers.
*/

import { normalize } from "./game-core.js";

/**
 * Pure matching. `options` is [{ value, label? }]; `label` is the canonical name when
 * `value` is an alias. Returns canonical names whose name or alias matches `query`,
 * best matches first (word-start before substring), at most `limit`.
 */
export function suggest(options, query, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const best = new Map();

  for (const option of options) {
    const canonical = option.label || option.value;
    const text = normalize(option.value);
    let rank = -1;
    if (text.startsWith(q)) rank = 0;
    else if (text.split(" ").some((word) => word.startsWith(q))) rank = 1;
    else if (text.includes(q)) rank = 2;
    if (rank === -1) continue;
    if (!best.has(canonical) || rank < best.get(canonical)) best.set(canonical, rank);
  }

  return [...best.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([canonical]) => canonical);
}

/** Wires an input to a suggestion list. `getOptions` is read on every keystroke. */
export function attachAutocomplete(input, getOptions) {
  const listbox = document.createElement("ul");
  listbox.className = "ac-list";
  listbox.id = `${input.id}-listbox`;
  listbox.setAttribute("role", "listbox");
  listbox.hidden = true;
  input.after(listbox);
  input.parentElement.classList.add("ac");

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", listbox.id);
  input.setAttribute("aria-expanded", "false");

  let items = [];
  let active = -1;

  function close() {
    listbox.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    active = -1;
  }

  function setActive(index) {
    active = index;
    [...listbox.children].forEach((li, i) => li.setAttribute("aria-selected", String(i === index)));
    if (index >= 0) input.setAttribute("aria-activedescendant", listbox.children[index].id);
    else input.removeAttribute("aria-activedescendant");
  }

  function choose(index) {
    input.value = items[index];
    close();
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function render() {
    items = suggest(getOptions(), input.value);
    listbox.replaceChildren();
    if (!items.length) return close();
    items.forEach((text, i) => {
      const li = document.createElement("li");
      li.id = `${listbox.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.textContent = text;
      li.addEventListener("mousedown", (event) => { event.preventDefault(); choose(i); });
      listbox.append(li);
    });
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
    setActive(-1);
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", () => { if (input.value) render(); });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (event) => {
    if (listbox.hidden) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActive((active + 1) % items.length); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((active - 1 + items.length) % items.length); }
    else if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(active); }
    else if (event.key === "Escape") { event.stopPropagation(); close(); }
  });
}
