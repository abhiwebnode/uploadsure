/*
  pwa-install.js
  ---------------
  Three genuinely different situations, handled honestly rather than
  pretending they're the same:

  1. Android / Chromium browsers that fire `beforeinstallprompt` — we
     can show a real button that triggers the native install prompt.
  2. iOS Safari — there is no install API at all. The only way to
     install is the user manually tapping Share → "Add to Home
     Screen". We detect this and show instructions instead of a
     button that would do nothing.
  3. Already running as an installed app (standalone display mode) —
     show nothing, there's nothing to install.

  Dismissing the banner is remembered for 14 days via localStorage,
  so it doesn't nag on every visit.
*/

function initPwaInstall() {
  registerServiceWorker();

  if (isRunningStandalone()) return; // already installed — nothing to offer
  if (wasRecentlyDismissed()) return;

  let deferredInstallPrompt = null;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showInstallBanner({
      message: "Install UploadSure for one-tap access next time.",
      buttonLabel: "Install",
      onAccept: async () => {
        hideInstallBanner();
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice; // we don't act differently either way — browser handles the actual install
        deferredInstallPrompt = null;
      },
    });
  });

  // iOS Safari never fires beforeinstallprompt — detect it directly
  // and show instructions instead of a dead button.
  if (isIosSafari() && !isRunningStandalone()) {
    showInstallBanner({
      message: "Install UploadSure: tap the Share icon, then \u201cAdd to Home Screen.\u201d",
      buttonLabel: "Got it",
      onAccept: () => hideInstallBanner(),
      isInstructionOnly: true,
    });
  }
}

function isRunningStandalone() {
  const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = window.navigator.standalone === true; // legacy iOS flag
  return displayModeStandalone || iosStandalone;
}

function isIosSafari() {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua); // exclude Chrome/Firefox/Edge on iOS, which can't install either but shouldn't get double-counted as "Safari"
  return isIos && isSafari;
}

function wasRecentlyDismissed() {
  try {
    const dismissedAt = +localStorage.getItem("uploadsure-install-dismissed");
    if (!dismissedAt) return false;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    return Date.now() - dismissedAt < fourteenDaysMs;
  } catch (e) {
    return false;
  }
}

function markDismissed() {
  try { localStorage.setItem("uploadsure-install-dismissed", String(Date.now())); } catch (e) { /* ignore */ }
}

function showInstallBanner({ message, buttonLabel, onAccept }) {
  if (document.getElementById("installBanner")) return; // already showing

  const banner = document.createElement("div");
  banner.id = "installBanner";
  banner.className = "install-banner";
  banner.innerHTML = `
    <span class="install-banner-text">${message}</span>
    <button class="btn primary sm install-accept">${buttonLabel}</button>
    <button class="install-dismiss" aria-label="Dismiss">\u00d7</button>
  `;
  document.body.appendChild(banner);

  banner.querySelector(".install-accept").onclick = onAccept;
  banner.querySelector(".install-dismiss").onclick = () => {
    markDismissed();
    hideInstallBanner();
  };
}

function hideInstallBanner() {
  const banner = document.getElementById("installBanner");
  if (banner) banner.remove();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return; // older browser — installability just won't be offered, no error needed
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {
      // Registration failing (e.g. served over plain http:// during local
      // testing) shouldn't break the page — the tools still work fine
      // without a service worker, just without the install prompt.
    });
  });
}
