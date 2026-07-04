/*
  Light/Dark theme manager for Lulu & Pacho.
  Applied as early as possible (inline in <head>) to avoid a flash of
  the wrong theme, then wired up to the toggle button once the header
  partial has been injected into the page.
*/
(function () {
  "use strict";

  var STORAGE_KEY = "lp-theme";

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function getPreferredTheme() {
    var stored = getStoredTheme();
    if (stored === "light" || stored === "dark") return stored;
    var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (err) {
      /* private browsing / storage disabled: theme still applies for this load */
    }
    var toggle = document.getElementById("theme-toggle");
    if (toggle) {
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") || getPreferredTheme();
  }

  function toggleTheme() {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
  }

  function bindToggle() {
    var toggle = document.getElementById("theme-toggle");
    if (!toggle || toggle.dataset.bound) return;
    toggle.dataset.bound = "true";
    toggle.setAttribute("aria-pressed", currentTheme() === "dark" ? "true" : "false");
    toggle.addEventListener("click", toggleTheme);
  }

  window.LP = window.LP || {};
  window.LP.theme = {
    applyTheme: applyTheme,
    toggleTheme: toggleTheme,
    getPreferredTheme: getPreferredTheme,
    bindToggle: bindToggle
  };

  applyTheme(getPreferredTheme());
})();
