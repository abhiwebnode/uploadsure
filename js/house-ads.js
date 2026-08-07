/*
  house-ads.js
  --------------
  Self-hosted cross-promotion for your own projects. No external
  requests, no third-party script, no tracking pixels — everything is
  defined in this file and rendered locally, so it doesn't undercut the
  "nothing leaves your browser" promise the rest of the site makes.

  ── HOW TO USE ──────────────────────────────────────────────────────
  1. Drop a slot anywhere in a page:

       <div class="house-ad" data-format="banner"></div>   (wide, full width)
       <div class="house-ad" data-format="card"></div>     (compact, grid-friendly)

  2. Load this file and call initHouseAds() after the DOM exists:

       <script src="js/house-ads.js"></script>
       <script>initHouseAds();</script>

  3. Edit HOUSE_ADS below to change what runs. That's the only part you
     normally need to touch.
	 
  4. For random image on page
  
  {
  title: "NearPop",
  url: "https://nearpop.in",
  weight: 2,
  images: [
    "assets/ads/nearpop-1.jpg",
    "assets/ads/nearpop-2.jpg",
    "assets/ads/nearpop-3.jpg",
  ],
  imageMode: "full",
}
  ── LATER, WHEN YOU ADD ADSENSE ─────────────────────────────────────
  Keep the same <div class="house-ad"> slots. Either drop the AdSense
  <ins> tag inside a slot and remove its class, or set FALLBACK_ONLY to
  true so house ads appear only where AdSense hasn't filled. The page
  markup doesn't need restructuring either way.
*/

/* ────────────────────────────────────────────────────────────────────
   YOUR ADS — edit this list
   ────────────────────────────────────────────────────────────────────
   title       required. Short product name.
   description required. One line. Keep it under ~90 chars for banners.
   url         required. Where the click goes.
   cta         button text. Defaults to "Visit".
   badge       optional small tag, e.g. "Free", "New", "Android".
   weight      optional. Higher = shown more often. Defaults to 1.
   hideOnHosts optional array of hostnames where this ad must NOT show.
               Lets you reuse this same file across all your sites
               without a site ever advertising itself.
   icon        optional inline SVG string, drawn in the accent colour.
               Ignored when `image` is set.

   image       optional path to an image, e.g. "assets/ads/nearpop.png".
               Host it yourself so the ad stays request-free.
               NO FIXED SIZE REQUIRED — the layout reads the image's own
               aspect ratio and adapts. See the sizing note below.
   imageAlt    alt text for the image. Falls back to the title.
   imageMode   "thumb" (default) — image sits beside the text, like a
                                   product shot. Good for any aspect.
               "full"            — the image IS the ad; text is hidden
                                   and the image fills the slot edge to
                                   edge. Use for designed banners.

   ── IMAGE SIZING ────────────────────────────────────────────────────
   You do not need to match a specific size — the CSS scales to fit and
   respects whatever aspect ratio you supply. Export at roughly 2× the
   display size so it stays sharp on phones.

     imageMode: "thumb"  →  square-ish works best. 600×600 or 800×600.
                            Displays ~96px tall, so 600px covers retina
                            comfortably.
     imageMode: "full"   →  match the slot's shape:
                              banner slot  → wide, e.g. 1600×400 (4:1)
                              card slot    → portrait, e.g. 800×1000 (4:5)

   If an image fails to load, the ad falls back to the icon/text layout
   automatically — a broken path never leaves an empty box.
*/
const HOUSE_ADS = [
  {
    title: "NearPop",
    description: "Discover what's happening around you — GPS-based local finds across Delhi NCR.",
    url: "https://nearpop.in",
    cta: "Explore NearPop",
    badge: "Android + Web",
    weight: 2,
	image: "assets/ads/nearpop.jpg",
	imageMode: "full",
    hideOnHosts: ["nearpop.in", "www.nearpop.in"],
    
  },
  {
    title: "TaxSavingLab",
    description: "Free tax calculator built for Indian traders — work out your liability in minutes.",
    url: "https://taxsavinglab.com",
    cta: "Calculate your tax",
    badge: "Free",
    weight: 2,
	image: "assets/ads/nearpop.jpg",
	imageMode: "full",
    hideOnHosts: ["taxsavinglab.com", "www.taxsavinglab.com"],
    
  },
  {
    title: "CouponBoyz",
    description: "Deals and coupon codes worth actually using — updated daily.",
    url: "https://couponboyz.com",
    cta: "Find a deal",
    badge: "Deals",
    weight: 1,
	image: "assets/ads/nearpop.jpg",
	imageMode: "full",
    hideOnHosts: ["couponboyz.com", "www.couponboyz.com"],
    
  },
];

/* ────────────────────────────────────────────────────────────────────
   SETTINGS
   ──────────────────────────────────────────────────────────────────── */

// If true, house ads only render into slots that are still empty — use
// this once AdSense is live so house ads act purely as unfilled backfill.
const FALLBACK_ONLY = false;

// Show a small "Ad" style label so it's clear this is promotional.
// Honest by default; set to false if you'd rather it read as a plain link.
const SHOW_SPONSOR_LABEL = true;

/* ──────────────────────────────────────────────────────────────────── */

function initHouseAds() {
  const slots = document.querySelectorAll(".house-ad");
  if (!slots.length) return;

  const eligible = getEligibleAds();
  if (!eligible.length) return;

  // Rotate across slots so two slots on one page don't show the same ad
  // (unless there's only one eligible ad to show).
  const shuffled = weightedShuffle(eligible);

  slots.forEach((slot, index) => {
    if (FALLBACK_ONLY && slot.children.length > 0) return; // AdSense already filled it
    const ad = shuffled[index % shuffled.length];
    const format = slot.dataset.format === "card" ? "card" : "banner";
    slot.innerHTML = renderAd(ad, format);
    slot.classList.add("house-ad-filled", "house-ad-" + format);

    const link = slot.querySelector("a");
    if (link) {
      link.addEventListener("click", () => {
        // Only reports to your own analytics if gtag is already on the page.
        // No new network dependency is introduced by this file.
        if (typeof gtag === "function") {
          gtag("event", "house_ad_click", { ad_title: ad.title, ad_url: ad.url });
        }
      });
    }
  });
}

/** Drops ads that shouldn't run on the current hostname. */
function getEligibleAds() {
  const host = window.location.hostname.toLowerCase();
  return HOUSE_ADS.filter((ad) => {
    if (!Array.isArray(ad.hideOnHosts)) return true;
    return !ad.hideOnHosts.some((h) => h.toLowerCase() === host);
  });
}

/**
 * Shuffles ads with weighting — an ad with weight 2 is twice as likely to
 * land near the front as one with weight 1, but every ad still appears
 * exactly once, so multiple slots on a page stay varied.
 */
function weightedShuffle(ads) {
  return ads
    .map((ad) => ({ ad, sort: Math.random() * (ad.weight || 1) }))
    .sort((a, b) => b.sort - a.sort)
    .map((entry) => entry.ad);
}

function renderAd(ad, format) {
  const cta = ad.cta || "Visit";
  const badge = ad.badge ? `<span class="house-ad-badge">${escapeHtml(ad.badge)}</span>` : "";
  const label = SHOW_SPONSOR_LABEL
    ? `<span class="house-ad-label">From the same maker</span>`
    : "";

  const imageMode = ad.image ? (ad.imageMode === "full" ? "full" : "thumb") : null;

  // ── full-bleed image ad: the image is the whole unit ──
  // onerror strips the image and reveals the text layout underneath, so a
  // wrong path degrades to a working ad instead of an empty box.
  if (imageMode === "full") {
    return `
      <a href="${escapeHtml(ad.url)}" target="_blank" rel="noopener"
         class="house-ad-inner house-ad-inner-full">
        ${label}
        <img class="house-ad-fullimg" src="${escapeHtml(ad.image)}"
             alt="${escapeHtml(ad.imageAlt || ad.title)}"
             onerror="this.closest('.house-ad-inner').classList.add('img-failed');this.remove()">
        <span class="house-ad-fallback">
          <span class="house-ad-titlerow">
            <span class="house-ad-title">${escapeHtml(ad.title)}</span>
            ${badge}
          </span>
          <span class="house-ad-desc">${escapeHtml(ad.description)}</span>
        </span>
      </a>`;
  }

  // ── thumbnail image, or icon, beside the text ──
  const visual = imageMode === "thumb"
    ? `<span class="house-ad-thumb">
         <img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.imageAlt || ad.title)}"
              onerror="this.closest('.house-ad-thumb').remove()">
       </span>`
    : (ad.icon ? `<span class="house-ad-icon" aria-hidden="true">${ad.icon}</span>` : "");

  return `
    <a href="${escapeHtml(ad.url)}" target="_blank" rel="noopener"
       class="house-ad-inner house-ad-inner-${format}">
      ${label}
      <div class="house-ad-main">
        ${visual}
        <div class="house-ad-text">
          <div class="house-ad-titlerow">
            <span class="house-ad-title">${escapeHtml(ad.title)}</span>
            ${badge}
          </div>
          <p class="house-ad-desc">${escapeHtml(ad.description)}</p>
        </div>
      </div>
      <span class="house-ad-cta">
        ${escapeHtml(cta)}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
      </span>
    </a>`;
}

/** Ad copy is authored by you, but escaping keeps a stray < or & from
    breaking the markup if you paste something in later. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
