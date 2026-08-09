/*
  sticky-header.js
  -----------------
  Standalone script — adds/removes .scrolled class to every <header>
  element on the page based on scroll position.
  
  Include on any page:
    <script src="js/sticky-header.js"></script>
  
  Works independently — does NOT require header.js.
  Uses requestAnimationFrame throttling for 60fps smoothness.
*/

(function () {
  "use strict";

  const THRESHOLD = 40;
  let ticking = false;
  let lastState = false;

  function applyState(scrolled) {
    const headers = document.querySelectorAll("header");
    for (let i = 0; i < headers.length; i++) {
      headers[i].classList.toggle("scrolled", scrolled);
    }
  }

  function onScroll() {
    const scrolled = window.scrollY > THRESHOLD;
    if (scrolled !== lastState) {
      applyState(scrolled);
      lastState = scrolled;
    }
    ticking = false;
  }

  window.addEventListener("scroll", function () {
    if (!ticking) {
      requestAnimationFrame(onScroll);
      ticking = true;
    }
  }, { passive: true });

  /* Run once on DOMContentLoaded — waits for any dynamically injected header */
  function ready(fn) {
    if (document.readyState !== "loading") { fn(); return; }
    document.addEventListener("DOMContentLoaded", fn);
  }

  ready(function () {
    onScroll();

    /* Also watch for headers injected AFTER load (e.g. by header.js) */
    const mo = new MutationObserver(function () {
      if (window.scrollY > THRESHOLD) applyState(true);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    /* Stop observing after 3 seconds — headers should exist by then */
    setTimeout(function () { mo.disconnect(); }, 3000);
  });

})();
