/*
  Lulu & Pacho — site orchestration.
  Loads the shared header/footer partials, wires up navigation, theme,
  language, scroll reveals and the contact form.
*/
(function () {
  "use strict";

  var CONTACT_ENDPOINT = "https://formsubmit.co/ajax/contacto@lulupacho.org";
  var MESSAGE_MAX_LENGTH = 50;

  function loadPartial(url, mountId) {
    var mount = document.getElementById(mountId);
    if (!mount) return Promise.resolve();
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load partial: " + url);
        return res.text();
      })
      .then(function (html) {
        mount.innerHTML = html;
      });
  }

  function highlightActiveNavLink() {
    var page = document.body.getAttribute("data-page");
    if (!page) return;
    document.querySelectorAll(".nav-links a[data-page-link]").forEach(function (link) {
      if (link.getAttribute("data-page-link") === page) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function bindMobileNav() {
    var toggle = document.getElementById("nav-toggle");
    var panel = document.getElementById("nav-panel");
    if (!toggle || !panel) return;

    function closePanel() {
      panel.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }

    toggle.addEventListener("click", function () {
      var isOpen = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    panel.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", closePanel);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closePanel();
    });
  }

  function bindScrollReveal() {
    var targets = document.querySelectorAll(".reveal");
    if (!targets.length) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );

    targets.forEach(function (el) {
      observer.observe(el);
    });
  }

  function bindContactForm() {
    var form = document.getElementById("contact-form");
    if (!form) return;

    var messageField = document.getElementById("contact-message");
    var counter = document.getElementById("message-counter");
    var status = document.getElementById("form-status");
    var submitBtn = form.querySelector("button[type='submit']");

    if (messageField && counter) {
      var updateCounter = function () {
        var remaining = MESSAGE_MAX_LENGTH - messageField.value.length;
        counter.textContent = remaining + "/" + MESSAGE_MAX_LENGTH;
      };
      messageField.addEventListener("input", updateCounter);
      updateCounter();
    }

    function showStatus(kind, text) {
      status.textContent = text;
      status.classList.remove("success", "error");
      status.classList.add(kind, "is-visible");
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      status.classList.remove("is-visible");

      var email = form.elements["email"].value.trim();
      var message = form.elements["message"].value.trim();

      if (!email || !message) {
        showStatus("error", form.dataset.errorRequired || "Please complete every field.");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.setAttribute("aria-busy", "true");

      fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: email, message: message, _subject: "Nuevo contacto — Lulu & Pacho" })
      })
        .then(function (res) {
          if (!res.ok) throw new Error("Request failed");
          showStatus("success", form.dataset.successMessage || "Message sent. We will get back to you soon.");
          form.reset();
          if (messageField && counter) counter.textContent = MESSAGE_MAX_LENGTH + "/" + MESSAGE_MAX_LENGTH;
        })
        .catch(function () {
          showStatus("error", form.dataset.errorMessage || "Something went wrong. Please try again later.");
        })
        .finally(function () {
          submitBtn.disabled = false;
          submitBtn.removeAttribute("aria-busy");
        });
    });
  }

  function setYear() {
    var el = document.getElementById("current-year");
    if (el) el.textContent = new Date().getFullYear();
  }

  document.addEventListener("DOMContentLoaded", function () {
    Promise.all([
      loadPartial("assets/partials/header.html", "site-header-mount"),
      loadPartial("assets/partials/footer.html", "site-footer-mount")
    ]).then(function () {
      highlightActiveNavLink();
      bindMobileNav();
      setYear();
      if (window.LP && window.LP.theme) window.LP.theme.bindToggle();
      if (window.LP && window.LP.i18n) {
        window.LP.i18n.bindLangSwitch();
        window.LP.i18n.init();
      }
    });

    bindScrollReveal();
    bindContactForm();
  });
})();
