#!/usr/bin/env node
/*
  build-exam-pages.mjs
  --------------------
  Generates one SEO landing page per exam from data/exams.json,
  plus a hub page (exam-photo-size.html) and sitemap entries.

  Run from repo root:   node tools/build-exam-pages.mjs
  Edit specs in data/exams.json, re-run, commit. No dependencies.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://www.uploadsure.in";
const DEFAULT_YEAR = 2026;
const TODAY = new Date().toISOString().slice(0, 10);
const HUB = "exam-photo-size.html";

const DOC_LABELS = {
  photo: "Photograph", postcardPhoto: "Postcard photo (4×6 in)", signature: "Signature",
  thumb: "Left thumb impression", declaration: "Handwritten declaration", photoId: "Photo ID",
};
const PHOTO_KEYS = new Set(["photo", "postcardPhoto"]);

const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/exams.json"), "utf8"));
const bySlug = Object.fromEntries(data.exams.map((e) => [e.slug, e]));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------- normalise each exam ---------- */
const exams = data.exams.map((e) => {
  const docsRaw = e.docs || bySlug[e.sameAs].docs;
  const docs = {};
  for (const [k, d] of Object.entries(docsRaw)) {
    docs[k] = { ...d, label: DOC_LABELS[k] || k, isPhoto: PHOTO_KEYS.has(k) };
  }
  const year = (e.name.match(/20\d\d/) || [])[0] || DEFAULT_YEAR;
  const hasPhoto = !!docs.photo;
  const kind = hasPhoto ? "Photo & Signature" : "Signature";
  return { ...e, docs, year, kind, file: `${e.slug}.html`,
    fileBase: e.slug.replace(/-(photo-signature|signature|photo)$/, "").replace(/-/g, "_") };
});

/* ---------- copy helpers ---------- */
function sizeLine(d) {
  let px = `${d.width}×${d.height} px`;
  if (d.mode === "range") px = `${d.minWidth ?? d.pxRange?.[0]}–${d.maxWidth ?? d.pxRange?.[1]} px wide (we output ${d.width}×${d.height})`;
  if (d.mode === "min") px = `at least ${d.minWidth}×${d.minHeight} px (we output ${d.width}×${d.height})`;
  if (d.mode === "none") px = `no pixel size set (we output ${d.width}×${d.height})`;
  if (d.mode === "preferred") px += " (preferred)";
  if (d.mode === "exact") px += " (exact — strictly checked)";
  return px;
}

function faqFor(e) {
  const q = [];
  const n = e.name.replace(/\s*\(.*\)$/, "");
  for (const [k, d] of Object.entries(e.docs)) {
    if (!d.width && k !== "photoId") continue;
    q.push([`What is the ${n} ${d.label.toLowerCase()} size?`,
      `${d.label}: ${d.minKB}–${d.maxKB} KB, JPG format${d.width ? `, ${sizeLine(d)}` : ""}.${d.notes ? " " + d.notes : ""}`]);
  }
  if (e.livePhoto) q.unshift([`Do I need to upload a photo for ${n}?`,
    `No. ${n} captures your photo live through webcam or phone camera during the application. You only need to upload the scanned signature${e.docs.photo ? " and the documents listed on this page" : ""}.`]);
  q.push([`Why does my ${n} upload fail even after resizing?`,
    `Portals check both a minimum and a maximum file size. A file that is too small is rejected just like one that is too big. This tool hits both ends of the range. Also make sure the file is a real JPG, not a renamed PNG.`]);
  q.push([`Is my photo uploaded to your server?`,
    `No. Everything runs inside your browser. Your files never leave your device.`]);
  return q;
}

/* ---------- shared HTML pieces ---------- */
const head = ({ title, desc, url, schema }) => `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<script>(function(){try{var t=localStorage.getItem("uploadsure-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
<script src="js/cookie-consent.js"></script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="UploadSure">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/og/application-pack.webp">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@uploadsure">
<link rel="icon" type="image/x-icon" href="/assets/logo/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/logo/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/logo/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#134A72">
<link rel="stylesheet" href="styles.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<script type="application/ld+json">
${JSON.stringify(schema, null, 1)}
</script>
</head>
<body>
<div id="site-header"></div>
<script src="js/header.js"></script>
<main>
<div class="wrap">`;

const tail = (extraScripts = "", init = "") => `
</div>
</main>
<div id="site-footer"></div>
<script src="js/footer.js"></script>
<div id="toast" role="status" aria-live="polite"></div>
<script src="js/utils.js"></script>
<script src="js/pwa-install.js"></script>
${extraScripts}
<script>
initThemeToggle();
initPwaInstall();
initScrollToTop();
${init}
</script>
<script src="js/search.js"></script>
<script src="js/sticky-header.js"></script>
</body>
</html>
`;

const crumbs = (items) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })),
});

/* ---------- exam page ---------- */
function examPage(e) {
  const url = `${SITE}/${e.file}`;
  const docs = Object.entries(e.docs);
  const toolDocs = docs.filter(([, d]) => d.width);
  const sig = e.docs.signature;
  const ph = e.docs.photo;
  const title = `${e.name} ${e.kind} Size ${e.year} — Resize Online Free | UploadSure`;
  const desc = [
    ph && `photo ${ph.minKB}–${ph.maxKB} KB`,
    sig && `signature ${sig.minKB}–${sig.maxKB} KB`,
  ].filter(Boolean).join(", ");
  const description = `${e.name} ${e.year}: ${desc}, JPG. Resize to the exact size in one click. Free, works on mobile, files never leave your device.`;
  const faq = faqFor(e);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": `${url}#webpage`, url, name: title, description, inLanguage: "en-IN",
        dateModified: TODAY,
        breadcrumb: crumbs([["Home", `${SITE}/`], ["Exam Photo Size", `${SITE}/${HUB}`], [e.name, url]]) },
      { "@type": "SoftwareApplication", name: `${e.name} Photo & Signature Resizer`, url,
        applicationCategory: "UtilitiesApplication", operatingSystem: "Any (runs in browser)",
        offers: { "@type": "Offer", price: "0", priceCurrency: "INR" } },
      { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    ],
  };

  const spec = { slug: e.slug, name: e.name, fileBase: e.fileBase,
    docs: Object.fromEntries(toolDocs.map(([k, d]) => [k, { label: d.label, width: d.width, height: d.height,
      minKB: d.minKB, maxKB: d.maxKB, targetKB: d.targetKB, isPhoto: d.isPhoto }])) };

  const related = exams.filter((x) => x.slug !== e.slug)
    .sort((a, b) => (b.category === e.category) - (a.category === e.category)).slice(0, 6);

  return head({ title, desc: description, url, schema }) + `
  <nav class="exam-crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a> / <a href="${HUB}">Exam photo size</a> / <span>${esc(e.name)}</span></nav>

  <section class="block" id="tool">
    <div class="sec-head">
      <span class="sec-num">${esc(e.category)}</span>
      <div>
        <h1>${esc(e.name)} ${e.kind} Resizer ${e.year}</h1>
        <p>Upload any photo. Get a file at the exact size and KB the ${esc(e.name)} portal accepts.</p>
      </div>
    </div>

    ${e.livePhoto ? `<div class="exam-note"><b>Photo is captured live.</b> ${esc(e.name)} takes your photo through webcam or phone camera during the form. You only need to upload the ${toolDocs.length > 1 ? "files below" : "signature"}.</div>` : ""}

    <div class="card pack">
      <div class="pack-body" id="examBody"></div>
      <div class="pack-foot">
        <span>Specs checked ${esc(data._meta.version)} · Always confirm on <b>${esc(e.portal)}</b>${e.confidence === "verify" ? " — sources differ for this exam, so we use the safe overlap" : ""}</span>
        <a class="report" href="mailto:info@uploadsure.in?subject=${encodeURIComponent("Spec issue — " + e.name)}">Portal rejected it? Tell us</a>
      </div>
    </div>
  </section>

  <section class="block" id="specs">
    <h2>${esc(e.name)} ${e.kind.toLowerCase()} size — official requirements</h2>
    <div class="spec-scroll"><table class="spec-table">
      <thead><tr><th>Document</th><th>File size</th><th>Dimensions</th><th>Format</th></tr></thead>
      <tbody>${docs.map(([, d]) => `
        <tr><td><b>${d.label}</b>${d.notes ? `<small>${esc(d.notes)}</small>` : ""}</td>
        <td>${d.minKB}–${d.maxKB} KB</td><td>${d.width ? esc(sizeLine(d)) : "—"}</td><td>JPG / JPEG</td></tr>`).join("")}
      </tbody>
    </table></div>
    ${e.pageNote ? `<p class="exam-small">${esc(e.pageNote.replace(/ - .*$/, "."))}</p>` : ""}
  </section>

  <section class="block" id="how">
    <h2>How to resize your ${esc(e.name)} ${e.kind.toLowerCase()}</h2>
    <ol class="exam-steps">
      <li><b>Take a clear photo.</b> ${ph ? "For the photograph, stand against a plain white wall in good light." : ""} For the signature, sign on plain white paper with a black pen and photograph it from above.</li>
      <li><b>Drop it in the box above.</b> It is cropped to ${toolDocs.map(([, d]) => `${d.width}×${d.height}`).join(" / ")} px and compressed into the allowed KB range.</li>
      <li><b>Download and upload.</b> The file is ready for the ${esc(e.name)} form. No editing needed.</li>
    </ol>
  </section>

  <section class="faq-section" aria-labelledby="faq-h"><div class="sec-head" style="margin-bottom:20px"><h2 id="faq-h">Frequently asked questions</h2></div>
    <div class="faq-list">${faq.map(([q, a], i) => `
      <details class="faq-item"${i === 0 ? " open" : ""}><summary class="faq-q">${esc(q)}</summary><div class="faq-a"><p>${esc(a)}</p></div></details>`).join("")}
    </div>
  </section>

  <section class="block" id="related">
    <h2>Other exams</h2>
    <div class="exam-grid">${related.map(cardHtml).join("")}</div>
    <p><a href="${HUB}">All exam photo &amp; signature sizes →</a></p>
  </section>
  <script type="application/json" id="exam-spec">${JSON.stringify(spec)}</script>
` + tail(`<script src="js/worker-client.js"></script>\n<script src="js/exam-page.js"></script>`, "initExamPage();");
}

function cardHtml(e) {
  const parts = Object.entries(e.docs).filter(([, d]) => d.width).slice(0, 2)
    .map(([, d]) => `${d.label.split(" ")[0]} ${d.minKB}–${d.maxKB} KB`);
  return `<a class="exam-card" href="${e.file}"><span>${esc(e.category)}</span><strong>${esc(e.name)}</strong><small>${esc(parts.join(" · "))}</small></a>`;
}

/* ---------- hub page ---------- */
function hubPage() {
  const url = `${SITE}/${HUB}`;
  const title = `Exam Photo & Signature Size ${DEFAULT_YEAR} — SSC, UPSC, IBPS, NEET, JEE, PAN | UploadSure`;
  const desc = `Photo and signature size in KB and pixels for ${exams.length} Indian exams and forms. Pick yours and resize in one click. Free, private, works on mobile.`;
  const cats = [...new Set(exams.map((e) => e.category))];
  const schema = { "@context": "https://schema.org", "@graph": [
    { "@type": "CollectionPage", url, name: title, description: desc, inLanguage: "en-IN",
      breadcrumb: crumbs([["Home", `${SITE}/`], ["Exam Photo Size", url]]) },
    { "@type": "ItemList", itemListElement: exams.map((e, i) => ({ "@type": "ListItem", position: i + 1, name: e.name, url: `${SITE}/${e.file}` })) },
  ] };
  return head({ title, desc, url, schema }) + `
  <section class="block">
    <div class="sec-head"><span class="sec-num">${exams.length}</span><div>
      <h1>Exam photo &amp; signature size ${DEFAULT_YEAR}</h1>
      <p>Pick your exam or form. Each page has the official size and a one-click resizer.</p></div></div>
    ${cats.map((c) => `<h2 class="exam-cat">${esc(c)}</h2><div class="exam-grid">${exams.filter((e) => e.category === c).map(cardHtml).join("")}</div>`).join("")}
  </section>
  <section class="block">
    <h2>Quick reference</h2>
    <div class="spec-scroll"><table class="spec-table">
      <thead><tr><th>Exam</th><th>Photo</th><th>Signature</th></tr></thead>
      <tbody>${exams.map((e) => `<tr><td><a href="${e.file}"><b>${esc(e.name)}</b></a></td>
        <td>${e.docs.photo ? `${e.docs.photo.minKB}–${e.docs.photo.maxKB} KB` : (e.livePhoto ? "Live capture" : "—")}</td>
        <td>${e.docs.signature ? `${e.docs.signature.minKB}–${e.docs.signature.maxKB} KB` : "—"}</td></tr>`).join("")}</tbody>
    </table></div>
  </section>
` + tail();
}

/* ---------- sitemap: keep existing non-exam URLs, add exam pages ---------- */
function updateSitemap() {
  const file = path.join(ROOT, "sitemap.xml");
  const xml = fs.readFileSync(file, "utf8");
  const ours = new Set([HUB, ...exams.map((e) => e.file)].map((f) => `${SITE}/${f}`));
  const kept = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0])
    .filter((u) => !ours.has((u.match(/<loc>(.*?)<\/loc>/) || [])[1]));
  const entry = (f, p) => `  <url>\n    <loc>${SITE}/${f}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${p}</priority>\n  </url>`;
  const out = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${kept.map((u) => "  " + u.trim()).join("\n")}\n${entry(HUB, "0.9")}\n${exams.map((e) => entry(e.file, "0.8")).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(file, out);
}

/* ---------- write ---------- */
for (const e of exams) fs.writeFileSync(path.join(ROOT, e.file), examPage(e));
fs.writeFileSync(path.join(ROOT, HUB), hubPage());
updateSitemap();
console.log(`Built ${exams.length} exam pages + ${HUB}, sitemap updated.`);
