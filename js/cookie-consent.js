/*
  cookie-consent.js
  ------------------
  Manages cookie consent for UploadSure.
  
  What this does:
  - Blocks Google Analytics from loading until the user accepts
  - Shows a banner on first visit
  - Remembers the choice in localStorage (not a cookie — ironic but correct,
    since localStorage doesn't require consent under GDPR)
  - On Accept: loads GA, sets consent, hides banner
  - On Decline: never loads GA this session, sets consent, hides banner
  - On subsequent visits: reads saved choice, loads GA only if accepted

  Usage: load this script BEFORE the gtag script in every page's <head>.
  Replace YOUR_GA_ID below with your actual GA measurement ID.
*/

const GA_ID = "G-9P4YEJ29E2";
const CONSENT_KEY = "uploadsure_cookie_consent";  // localStorage key
const CONSENT_ACCEPTED = "accepted";
const CONSENT_DECLINED = "declined";

(function () {
  "use strict";

  /* ── Read saved choice ── */
  const saved = localStorage.getItem(CONSENT_KEY);

  if (saved === CONSENT_ACCEPTED) {
    loadGA();
    return; // Banner not needed
  }

  if (saved === CONSENT_DECLINED) {
    return; // GA never loads, banner not needed
  }

  /* ── No saved choice — show banner on DOMContentLoaded ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showBanner);
  } else {
    showBanner();
  }

  function showBanner() {
    const banner = document.createElement("div");
    banner.id = "cookieBanner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = `
      <div class="cookie-inner">
        <div class="cookie-text">
          <svg class="cookie-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/>
            <path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/>
          </svg>
          <p>
            We use <strong>Google Analytics</strong> to understand how visitors use this site.
            Your files are never uploaded anywhere — 
            <a href="privacy.html">read our privacy policy</a>.
          </p>
        </div>
        <div class="cookie-actions">
          <button class="cookie-btn cookie-decline" id="cookieDecline">Decline</button>
          <button class="cookie-btn cookie-accept" id="cookieAccept">Accept Analytics</button>
        </div>
      </div>`;

    document.body.appendChild(banner);

    /* Animate in after a brief delay so it doesn't flash on load */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => banner.classList.add("cookie-visible"));
    });

    document.getElementById("cookieAccept").onclick = () => {
      localStorage.setItem(CONSENT_KEY, CONSENT_ACCEPTED);
      hideBanner(banner);
      loadGA();
    };

    document.getElementById("cookieDecline").onclick = () => {
      localStorage.setItem(CONSENT_KEY, CONSENT_DECLINED);
      hideBanner(banner);
    };
  }

  function hideBanner(banner) {
    banner.classList.remove("cookie-visible");
    banner.classList.add("cookie-hiding");
    setTimeout(() => banner.remove(), 400);
  }

  function loadGA() {
    // Load the gtag script dynamically
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    script.onload = () => {
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      window.gtag = gtag;
      gtag("js", new Date());
      gtag("config", GA_ID, {
        anonymize_ip: true,       // extra privacy layer
        cookie_flags: "SameSite=None;Secure",
      });
    };
  }

})();

/* ── Public helper: let users withdraw consent from privacy page ── */
function withdrawCookieConsent() {
  localStorage.removeItem("uploadsure_cookie_consent");
  location.reload();
}
