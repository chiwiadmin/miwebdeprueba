/*
  i18n loader for Lulu & Pacho.
  Reads translation dictionaries from /assets/lang/{lang}.json and applies
  them to any element carrying a data-i18n* attribute. Keys use dot
  notation to reach nested values, e.g. data-i18n="hero.title".
*/
(function () {
  "use strict";

  var STORAGE_KEY = "lp-lang";
  var DEFAULT_LANG = "es";
  var SUPPORTED = ["es", "en"];
  var cache = {};
  var currentLang = DEFAULT_LANG;

  function getStoredLang() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
  }

  function detectLang() {
    var stored = getStoredLang();
    if (stored && SUPPORTED.indexOf(stored) !== -1) return stored;
    var browserLang = (navigator.language || DEFAULT_LANG).slice(0, 2);
    return SUPPORTED.indexOf(browserLang) !== -1 ? browserLang : DEFAULT_LANG;
  }

  function resolvePath(dict, path) {
    return path.split(".").reduce(function (acc, key) {
      return acc && typeof acc === "object" ? acc[key] : undefined;
    }, dict);
  }

  function fetchDictionary(lang) {
    if (cache[lang]) return Promise.resolve(cache[lang]);
    return fetch("assets/lang/" + lang + ".json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load language file: " + lang);
        return res.json();
      })
      .then(function (dict) {
        cache[lang] = dict;
        return dict;
      });
  }

  function applyDictionary(dict) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var value = resolvePath(dict, el.getAttribute("data-i18n"));
      if (typeof value === "string") el.textContent = value;
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      var pairs = el.getAttribute("data-i18n-attr").split(",");
      pairs.forEach(function (pair) {
        var parts = pair.split(":");
        var attr = parts[0].trim();
        var key = parts[1] ? parts[1].trim() : "";
        var value = resolvePath(dict, key);
        if (typeof value === "string") el.setAttribute(attr, value);
      });
    });

    var page = document.body.getAttribute("data-page") || "home";
    var titleValue = resolvePath(dict, "meta." + page + ".title");
    if (titleValue) document.title = titleValue;

    var metaDescription = document.querySelector('meta[name="description"]');
    var descriptionValue = resolvePath(dict, "meta." + page + ".description");
    if (metaDescription && descriptionValue) {
      metaDescription.setAttribute("content", descriptionValue);
    }
  }

  function updateLangSwitchUI(lang) {
    document.querySelectorAll("[data-lang-option]").forEach(function (btn) {
      var isActive = btn.getAttribute("data-lang-option") === lang;
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT_LANG;
    return fetchDictionary(lang).then(function (dict) {
      currentLang = lang;
      document.documentElement.setAttribute("lang", lang);
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch (err) {
        /* storage unavailable: language still applies for this load */
      }
      applyDictionary(dict);
      updateLangSwitchUI(lang);
    });
  }

  function bindLangSwitch() {
    document.querySelectorAll("[data-lang-option]").forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "true";
      btn.addEventListener("click", function () {
        setLang(btn.getAttribute("data-lang-option"));
      });
    });
  }

  function init() {
    return setLang(detectLang());
  }

  window.LP = window.LP || {};
  window.LP.i18n = {
    init: init,
    setLang: setLang,
    bindLangSwitch: bindLangSwitch,
    getCurrentLang: function () {
      return currentLang;
    }
  };
})();
