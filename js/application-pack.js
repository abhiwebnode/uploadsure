/*
  application-pack.js
  ---------------------
  The guided "pick a portal, fix your file to its exact spec" flow.

  NOTE on `verified`: earlier drafts of this catalog showed a green
  "Verified" badge on every portal, but that was placeholder demo
  text — nobody had actually tested those specs against a live
  upload. The badge only says "Verified" for portals someone has
  actually confirmed by uploading a fixed file and watching it get
  accepted; for everything else, the badge is hidden rather than
  showing a cautionary label — the per-item "(estimated)" tags and
  the notes still carry that context without a banner across the top.
  Flip `verified: true` once a portal has actually been checked
  end-to-end.

  Pixel dimensions marked `estimatedPx: true` were calculated from a
  cm/inch spec (no pixel figure was published) using a 200 DPI
  conversion, which is a commonly cited scanning resolution for these
  forms but is NOT confirmed against any specific portal's real
  upload validator — some portals (e.g. SSC's "Live Capture" flow)
  may generate a different fixed size automatically. Treat these as
  a reasonable starting point, not a guarantee, until verified.

  In a production build this array should be replaced by a fetch to
  a small backend so the catalog can be updated without redeploying
  the page.
*/

const PORTAL_SPECS = [
  {
    id: "ssc",
    name: "SSC — CGL, CHSL, MTS, GD",
    verified: false,
    items: [
      { key: "photo", label: "Photograph", width: 276, height: 354, minKilobytes: 20, maxKilobytes: 50, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, note: "Official spec is 3.5×4.5cm (px estimated at 200 DPI) — many SSC exams instead use in-browser Live Capture, which sets its own size automatically." },
      { key: "sign", label: "Signature", width: 315, height: 157, minKilobytes: 10, maxKilobytes: 20, mimeType: "image/jpeg", checkBackground: false, estimatedPx: true, note: "Official spec is 4.0×2.0cm (px estimated at 200 DPI). Black or blue ink on white paper." },
    ],
  },
  {
    id: "upsc",
    name: "UPSC — Civil Services, NDA, CDS",
    verified: false,
    items: [
      { key: "photo", label: "Photograph", width: 350, height: 350, minKilobytes: 20, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, note: "Clear front-facing photo, plain background, name & date strip optional." },
      { key: "sign", label: "Signature", width: 350, height: 150, minKilobytes: 20, maxKilobytes: 100, mimeType: "image/jpeg", checkBackground: false, note: "Sign inside a box on white paper." },
    ],
  },
  {
    id: "ibps",
    name: "IBPS / SBI — Banking PO, Clerk",
    verified: false,
    items: [
      { key: "photo", label: "Photograph", width: 200, height: 230, minKilobytes: 20, maxKilobytes: 50, mimeType: "image/jpeg", checkBackground: true, note: "Official spec is 4.5×3.5cm (200×230px). Plain background, face centred." },
      { key: "sign", label: "Signature", width: 140, height: 60, minKilobytes: 10, maxKilobytes: 20, mimeType: "image/jpeg", checkBackground: false, note: "Black or blue ink on white paper." },
    ],
  },
  {
    id: "jee",
    name: "NTA JEE Main",
    verified: false,
    items: [
      { key: "photo", label: "Photograph", width: 276, height: 354, minKilobytes: 10, maxKilobytes: 200, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, note: "Official spec is 3.5×4.5cm (px estimated at 200 DPI), plain background." },
      { key: "sign", label: "Signature", width: 276, height: 118, minKilobytes: 10, maxKilobytes: 100, mimeType: "image/jpeg", checkBackground: false, estimatedPx: true, note: "Official spec is 3.5×1.5cm (px estimated at 200 DPI)." },
    ],
  },
  {
    id: "neet",
    name: "NTA NEET UG",
    verified: false,
    items: [
      { key: "photoPassport", label: "Photograph (passport size)", width: 276, height: 354, minKilobytes: 10, maxKilobytes: 200, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, note: "Official spec is 3.5×4.5cm (px estimated at 200 DPI), plain background." },
      { key: "photoPostcard", label: "Photograph (postcard size)", width: 800, height: 1200, minKilobytes: 10, maxKilobytes: 200, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, note: "Official spec is 4×6 inches (px estimated at 200 DPI) — an unusually large size, double-check this is really what's asked for a digital upload before using it." },
      { key: "sign", label: "Signature", width: 276, height: 118, minKilobytes: 10, maxKilobytes: 50, mimeType: "image/jpeg", checkBackground: false, estimatedPx: true, note: "NTA lists no strict dimension for NEET signature — this uses the JEE signature size as a safe default; check the current notification." },
    ],
  },
  {
    id: "passport",
    name: "Passport Photo — International",
    verified: false,
    items: [
      { key: "photoUS", label: "United States", width: 400, height: 400, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "2×2in (51×51mm), white or off-white background. No eyeglasses allowed. Head height must be 1–1.38in (~50–69% of frame)." },
      { key: "photoIndia", label: "India", width: 400, height: 400, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "2×2in (51×51mm), white background, face should fill 80–85% of the frame." },
      { key: "photoUK", label: "United Kingdom", width: 276, height: 354, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "35×45mm, light grey or cream background — white is NOT accepted. Our background check only confirms plain & light, not the exact shade, so double-check the colour yourself." },
      { key: "photoEU", label: "EU / Schengen Area", width: 276, height: 354, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "35×45mm, light grey or other plain light background." },
      { key: "photoCanada", label: "Canada", width: 394, height: 551, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "50×70mm — noticeably larger than most countries. White or light grey background." },
      { key: "photoAustralia", label: "Australia", width: 276, height: 354, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "35×45mm, plain light background. No eyeglasses allowed." },
      { key: "photoChina", label: "China", width: 260, height: 378, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "33×48mm, white background." },
      { key: "photoJapan", label: "Japan", width: 276, height: 354, minKilobytes: 10, maxKilobytes: 300, mimeType: "image/jpeg", checkBackground: true, estimatedPx: true, estimatedSize: true, note: "35×45mm, plain white background." },
    ],
  },
  {
    id: "pan",
    name: "PAN — Protean / NSDL",
    verified: false,
    items: [
      { key: "photo", label: "Photograph", width: 213, height: 213, minKilobytes: 20, maxKilobytes: 50, mimeType: "image/jpeg", checkBackground: true, note: "3.5×2.5 cm equivalent, plain background." },
      { key: "sign", label: "Signature", width: 200, height: 60, minKilobytes: 10, maxKilobytes: 20, mimeType: "image/jpeg", checkBackground: false, note: "Signature on white paper." },
    ],
  },
  {
    id: "kyc",
    name: "Bank KYC — generic",
    verified: false,
    items: [
      { key: "photo", label: "Photograph", width: 200, height: 200, minKilobytes: 20, maxKilobytes: 100, mimeType: "image/jpeg", checkBackground: true, note: "Recent colour photo, neutral background." },
    ],
  },
];

function initApplicationPack() {
  const portalPicker = document.getElementById("portalPicker");
  const packBody = document.getElementById("packBody");
  const verifiedBadge = document.getElementById("verifiedBadge");

  // Currently selected portal id — replaces what used to be portalSelect.value
  let selectedPortalId = PORTAL_SPECS[0].id;

  /* Portal names are formatted "SHORT — detail" (e.g. "SSC — CGL, CHSL, MTS, GD").
     Split on the em dash so each card gets a bold title and a lighter subtitle.
     Portals without a dash (e.g. "NTA JEE Main") fall back to showing how many
     items they require instead, so every card has a consistent two-line shape. */
  function splitPortalName(portal) {
    const parts = portal.name.split("—");
    if (parts.length > 1) {
      return { title: parts[0].trim(), detail: parts.slice(1).join("—").trim() };
    }
    const itemCount = portal.items.length;
    return { title: portal.name.trim(), detail: `${itemCount} item${itemCount === 1 ? "" : "s"}` };
  }

  PORTAL_SPECS.forEach((portal) => {
    const { title, detail } = splitPortalName(portal);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "portal-pill";
    button.dataset.portalId = portal.id;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", portal.id === selectedPortalId ? "true" : "false");
    if (portal.id === selectedPortalId) button.classList.add("on");
    button.textContent = title;
    button.title = detail; // subtitle visible as tooltip
    button.onclick = () => selectPortal(portal.id);
    portalPicker.appendChild(button);
  });

  function selectPortal(portalId) {
    selectedPortalId = portalId;
    portalPicker.querySelectorAll(".portal-pill").forEach((b) => {
      const isSelected = b.dataset.portalId === portalId;
      b.classList.toggle("on", isSelected);
      b.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
    renderPortal(portalId);
  }

  function renderPortal(portalId) {
    const portal = PORTAL_SPECS.find((p) => p.id === portalId);
    if (portal.verified) {
      verifiedBadge.className = "verified";
      verifiedBadge.style.display = "";
      verifiedBadge.innerHTML = `${checkmarkIcon()} Verified ${portal.verifiedDate || ""}`;
    } else {
      // No confirmed-against-a-live-upload badge to show yet — rather than
      // display a cautionary label here, the badge is simply hidden until
      // a portal is actually verified. See the module note above for why
      // this deliberately stops short of claiming "Verified" instead.
      verifiedBadge.style.display = "none";
    }
    packBody.innerHTML = "";

    portal.items.forEach((itemSpec) => {
      const itemEl = document.createElement("div");
      itemEl.className = "pack-item";
      itemEl.innerHTML = `
        <div class="item-name">
          <h3>${itemSpec.label}</h3>
          <span class="req">${itemSpec.width}×${itemSpec.height}px${itemSpec.estimatedPx ? " (estimated)" : ""} · ${itemSpec.minKilobytes}–${itemSpec.maxKilobytes}KB${itemSpec.estimatedSize ? " (not specified — general default)" : ""} · ${FORMAT_EXTENSIONS[itemSpec.mimeType].toUpperCase()}</span>
        </div>
        <label class="drop">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4m0 0L8 8m4-4l4 4"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>
          <div class="t">Drop your ${itemSpec.label.toLowerCase()} here</div>
          <div class="h">or click to choose · ${itemSpec.note}</div>
          <input type="file" accept="image/*">
        </label>
        <div class="result"></div>`;

      const fileInput = itemEl.querySelector("input");
      const dropZone = itemEl.querySelector(".drop");
      const resultEl = itemEl.querySelector(".result");
      bindDropZone(dropZone, fileInput, (file) => validateAgainstSpec(itemSpec, file, resultEl, dropZone));
      packBody.appendChild(itemEl);
    });
  }

  async function validateAgainstSpec(spec, file, resultEl, dropZone) {
    dropZone.querySelector(".t").textContent = "Processing…";
    try {
      const image = await loadImageFromFile(file);
      const previewCanvas = coverCropToCanvas(image, spec.width, spec.height);

      // Encoding (the part that scales with file size) runs in the worker.
      const previewBitmap = await createImageBitmap(previewCanvas);
      const { blob } = await workerCompressFixedDimensions(previewBitmap, spec.mimeType, spec.maxKilobytes);

      const sizeKilobytes = +formatKilobytes(blob.size);
      const backgroundCheck = spec.checkBackground ? sampleBorderForPlainBackground(previewCanvas) : null;
      const objectUrl = URL.createObjectURL(blob);

      const checks = buildChecklist(spec, sizeKilobytes, backgroundCheck);
      const anyWarnings = checks.some((c) => c.status === "warn");

      resultEl.innerHTML = `
        <div class="preview">
          <div class="preview-thumb">
            <img src="${objectUrl}" alt="fixed ${spec.label}">
            <span class="stamp sm preview-stamp ${anyWarnings ? "warn" : "pass"}">${anyWarnings ? "Recheck" : "Pass"}</span>
          </div>
          <ul class="checklist">${checks.map(renderCheckRow).join("")}</ul>
        </div>
        <div class="act-row">
          <button class="btn primary dl">Download fixed ${spec.label.toLowerCase()}</button>
          <span class="note-inline">Saved as ${spec.key}_${spec.width}x${spec.height}.${FORMAT_EXTENSIONS[spec.mimeType]}</span>
        </div>`;
      resultEl.classList.add("show");
      resultEl.querySelector(".dl").onclick = () => {
        triggerDownload(blob, `${spec.key}_${spec.width}x${spec.height}.${FORMAT_EXTENSIONS[spec.mimeType]}`);
        showToast("Downloaded — upload this one");
      };
      dropZone.querySelector(".t").textContent = `Replace ${spec.label.toLowerCase()}`;
    } catch (error) {
      dropZone.querySelector(".t").textContent = `Drop your ${spec.label.toLowerCase()} here`;
      showToast("Could not read that file — try a JPG or PNG");
    }
  }

  function buildChecklist(spec, sizeKilobytes, backgroundCheck) {
    const checks = [
      { status: "ok", label: "Dimensions", value: `<b>${spec.width}×${spec.height}px</b> exact` },
      { status: "ok", label: "Format", value: `<b>${FORMAT_EXTENSIONS[spec.mimeType].toUpperCase()}</b>` },
    ];

    const sizeWithinBand = sizeKilobytes <= spec.maxKilobytes && sizeKilobytes >= (spec.minKilobytes || 0);
    checks.push({
      status: sizeWithinBand ? "ok" : "warn",
      label: "File size",
      value: `<b>${sizeKilobytes} KB</b> ${sizeWithinBand ? "within" : "vs"} ${spec.minKilobytes}–${spec.maxKilobytes} KB`,
    });

    if (spec.checkBackground) {
      const looksGood = backgroundCheck.isPlain && backgroundCheck.isLight;
      checks.push({
        status: looksGood ? "ok" : "warn",
        label: "Background",
        value: looksGood
          ? "looks plain & light <b>(best-effort)</b>"
          : "may not be plain — check before upload <b>(best-effort)</b>",
      });
      checks.push({ status: "warn", label: "Face position", value: "we can't verify this — ensure face is centred & upright" });
    }
    return checks;
  }

  function renderCheckRow(check) {
    return `<li class="check ${check.status}">
      <span class="ic">${check.status === "ok" ? checkmarkIcon() : warningIcon()}</span>
      <span><span class="lbl">${check.label}</span> — <span class="val">${check.value}</span></span>
    </li>`;
  }

  renderPortal(selectedPortalId);

  document.getElementById("reportBtn").onclick = () => {
    const portal = PORTAL_SPECS.find((p) => p.id === selectedPortalId);
    const subject = encodeURIComponent(`Spec issue report — ${portal.name}`);
    const body = encodeURIComponent(
      `Portal: ${portal.name}\n\n` +
      `What happened (e.g. "portal rejected the photo I downloaded from here"):\n\n\n` +
      `Which item — photo, signature, etc.:\n\n\n` +
      `Any error message the portal showed:\n\n`
    );
    window.location.href = `mailto:info@uploadsure.in?subject=${subject}&body=${body}`;
    showToast("Opening your email app…");
  };
}