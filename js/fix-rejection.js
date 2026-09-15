/*
  fix-rejection.js
  -----------------
  The diagnosis engine for the Fix My Rejection page.
  Pattern-matches a rejection message against a dictionary of common
  causes and routes the user to the exact tool that fixes each one.
  All processing is client-side — text stays in the browser.
*/

(function () {

  // Each rule has:
  //   patterns: regex(es) that match wording variations of the rejection
  //   title:    short diagnosis heading
  //   cause:    honest explanation of what the portal is checking
  //   fix:      what the user should do
  //   tool:     { href, label } to link to the right UploadSure tool
  //   confidence: how sure we are (used to rank if multiple match)
  const DIAGNOSIS_RULES = [
    {
      id: "photo-not-clear",
      patterns: [/photo.*not\s+clear/i, /not\s+clear/i, /blurr?y/i, /blurred/i, /unclear/i, /out\s+of\s+focus/i, /poor\s+quality/i, /low\s+resolution/i, /pixelated/i, /pixellated/i],
      title: "Photo isn't clear enough",
      cause: "The portal's automated check found the image blurry, pixelated, or too heavily compressed. This happens when you compress the file too aggressively (near the minimum KB) or use a low-resolution original.",
      fix: "Use a sharp original photo — don't crop from a group photo. When compressing, target the middle-to-high end of the KB range (e.g. 40 KB out of a 20–50 KB range, not 20 KB).",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 3,
    },
    {
      id: "file-size-exceeds",
      patterns: [/(file\s+)?size\s+(exceeds?|is\s+too\s+large|is\s+greater|is\s+more)/i, /file\s+too\s+large/i, /exceeds?\s+(the\s+)?(maximum|max|limit)/i, /larger\s+than/i, /kb.*limit/i, /reduce\s+.*size/i],
      title: "File size is too large",
      cause: "Your file is over the maximum KB the portal allows. Every portal has a strict upper limit — usually 20–50 KB for photos and 10–20 KB for signatures.",
      fix: "Compress to hit the exact KB limit. Application Pack does this automatically for the portal you select. Or use Compress Image with a target KB (say 45 KB).",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 3,
    },
    {
      id: "file-size-too-small",
      patterns: [/(file\s+)?size\s+(too\s+small|is\s+less|below|smaller)/i, /minimum\s+size/i, /at\s+least\s+\d+\s*kb/i],
      title: "File size is too small",
      cause: "The portal wants a minimum KB size — the file may be over-compressed, making the check fail.",
      fix: "Re-save with less compression. Application Pack targets the middle of the portal's range automatically, avoiding both extremes.",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 3,
    },
    {
      id: "format-not-jpg",
      patterns: [/only\s+jpe?g/i, /must\s+be\s+jpe?g/i, /format.*not\s+(supported|accepted|allowed)/i, /invalid\s+(file\s+)?format/i, /file\s+type.*not/i, /jpe?g\s+only/i, /png.*not\s+(accepted|supported|allowed)/i, /heic/i, /webp.*not/i],
      title: "Wrong file format",
      cause: "You uploaded a PNG, WebP, or HEIC (iPhone default) file. Most Indian government portals only accept JPG/JPEG.",
      fix: "Convert to JPG. HEIC is especially tricky — iPhone photos are HEIC by default and portals silently reject them without a clear error.",
      tool: { href: "image-tools.html#t-convert", label: "Open Convert Format" },
      confidence: 3,
    },
    {
      id: "signature-issue",
      patterns: [/signature.*(too\s+large|exceeds?|wrong|invalid|incorrect|not\s+clear)/i, /signature\s+size/i, /signature.*(width|height|dimensions|kb)/i],
      title: "Signature issue",
      cause: "Signatures have their own strict spec — usually 10–20 KB and much wider than tall (typical: 140×60 px for banking, 350×150 px for UPSC).",
      fix: "Application Pack has the exact signature spec per portal — it resizes, sets the KB, and outputs JPG in one step.",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 3,
    },
    {
      id: "background-not-white",
      patterns: [/background\s+(not\s+white|not\s+plain|coloured|colored|dark|patterned|is\s+not)/i, /white\s+background/i, /plain\s+background/i, /light\s+background/i, /background\s+colou?r/i],
      title: "Background isn't plain white",
      cause: "The portal detected a coloured, patterned, or dark background. Passport-style photos need a plain light background — some portals only accept pure white.",
      fix: "Use AI Background Remover — it removes the current background and lets you set plain white. Then run through the Application Pack to lock the exact spec.",
      tool: { href: "ai-tools.html#t-ai-bg", label: "Open AI Background Remover" },
      confidence: 3,
    },
    {
      id: "dimensions-incorrect",
      patterns: [/dimensions?\s+(incorrect|wrong|invalid|not\s+match|mismatch)/i, /(width|height).*(not|must|should)/i, /pixels?\s+(not\s+match|incorrect|wrong)/i, /resize\s+.*photo/i, /must\s+be\s+\d+x\d+/i],
      title: "Pixel dimensions are wrong",
      cause: "The pixel width × height doesn't match the portal's exact spec. Never guess — every portal has different requirements (200×230 for SBI, 350×350 for UPSC, 276×354 for SSC, etc).",
      fix: "Application Pack auto-resizes to the exact spec per portal. Alternatively use Resize Image with the exact px values.",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 3,
    },
    {
      id: "file-corrupted",
      patterns: [/(file\s+)?corrupt(ed)?/i, /invalid\s+file/i, /unable\s+to\s+(read|open|process)/i, /file.*damaged/i, /cannot\s+(read|open|process)/i, /unreadable/i],
      title: "File is corrupted or unreadable",
      cause: "The portal couldn't parse the file. Usually from broken uploads, incorrect file extension, or files that were edited but never re-saved (e.g. renamed .png to .jpg without conversion).",
      fix: "Re-open the photo in any image tool and re-save as fresh JPG. Application Pack does this cleanly — it re-encodes the file end-to-end.",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 2,
    },
    {
      id: "face-not-detected",
      patterns: [/face\s+(not|is\s+not)\s+(visible|detected|clear|centred|centered)/i, /face\s+(detection|verification)\s+failed/i, /no\s+face\s+(found|detected)/i, /face.*(small|large|angled|covered)/i],
      title: "Face isn't clearly visible",
      cause: "Face is too small, cropped, angled, covered, or lighting hides features. Some portals now use automatic face detection.",
      fix: "Take a fresh photo: face centred, occupies 60–70% of the frame, plain background, even natural lighting, eyes open, no glasses glare, no smile.",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 2,
    },
    {
      id: "signature-not-clear",
      patterns: [/signature.*not\s+clear/i, /signature.*(faded|light|unclear)/i, /signature.*not\s+visible/i],
      title: "Signature isn't clear",
      cause: "The signature scan is too faint, faded, or the ink is too light. Portals want dark, high-contrast signatures.",
      fix: "Sign fresh on plain white paper with a bold black or blue pen. Scan or photograph in bright light. Re-run through Application Pack.",
      tool: { href: "application-pack.html", label: "Open Application Pack" },
      confidence: 2,
    },
  ];

  const $ = (id) => document.getElementById(id);

  const textareaEl = $("rejectionInput");
  const portalEl   = $("portalSelect");
  const btnEl      = $("diagnoseBtn");
  const resultEl   = $("diagnosisResult");

  if (!textareaEl || !btnEl || !resultEl) return;

  // Quick-pick chips autofill the textarea
  document.querySelectorAll(".fix-quick-picks .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      textareaEl.value = chip.dataset.pick;
      textareaEl.focus();
      diagnose();
    });
  });

  btnEl.addEventListener("click", diagnose);

  textareaEl.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") diagnose();
  });

  function diagnose() {
    const text = (textareaEl.value || "").trim();

    if (text.length < 3) {
      resultEl.innerHTML = `
        <div class="fix-empty">
          Paste the rejection message above, or tap one of the common rejections to autofill it.
        </div>`;
      resultEl.classList.add("show");
      resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // Score every rule — 1 point per matching pattern
    const scored = DIAGNOSIS_RULES.map((rule) => {
      let score = 0;
      for (const p of rule.patterns) {
        if (p.test(text)) score += 1;
      }
      return { rule, score: score * rule.confidence };
    }).filter((s) => s.score > 0);

    scored.sort((a, b) => b.score - a.score);

    const portal = portalEl.value;

    if (scored.length === 0) {
      resultEl.innerHTML = renderNoMatch(text, portal);
    } else {
      resultEl.innerHTML = renderDiagnoses(scored.slice(0, 3), text, portal);
    }

    resultEl.classList.add("show");
    resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderDiagnoses(scored, originalText, portal) {
    const portalSuffix = portalHrefSuffix(portal);
    const cards = scored.map((s, i) => {
      const r = s.rule;
      const isPrimary = i === 0;
      const href = r.tool.href + (portalSuffix && r.tool.href.startsWith("application-pack.html") ? portalSuffix : "");

      return `
        <div class="fix-diagnosis-card ${isPrimary ? "is-primary" : ""}">
          ${isPrimary ? `<span class="fix-badge">Most likely cause</span>` : ""}
          <h3>${escapeHTML(r.title)}</h3>
          <div class="fix-diag-row">
            <div class="fix-diag-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <strong>What the portal was checking</strong>
              <p>${escapeHTML(r.cause)}</p>
            </div>
          </div>
          <div class="fix-diag-row">
            <div class="fix-diag-icon fix-diag-icon-ok">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div>
              <strong>How to fix it</strong>
              <p>${escapeHTML(r.fix)}</p>
            </div>
          </div>
          <a href="${escapeAttr(href)}" class="btn primary fix-cta">
            ${escapeHTML(r.tool.label)} →
          </a>
        </div>
      `;
    }).join("");

    return `
      <div class="fix-result-head">
        <span class="fix-result-eyebrow">Diagnosis</span>
        <h2>We found ${scored.length} likely cause${scored.length > 1 ? "s" : ""}${portal ? " for " + portalLabel(portal) : ""}</h2>
        <p class="lede">Start with the top one. If it doesn't fix it, work through the others in order.</p>
      </div>
      <div class="fix-diagnoses">${cards}</div>
      <div class="fix-result-foot">
        <p>Not the fix you needed? <a href="contact.html">Tell us what happened</a> — we'll add it to the diagnosis engine.</p>
      </div>
    `;
  }

  function renderNoMatch(originalText, portal) {
    const portalSuffix = portalHrefSuffix(portal);
    return `
      <div class="fix-result-head">
        <span class="fix-result-eyebrow">No clear match</span>
        <h2>We couldn't map that message to a specific cause</h2>
        <p class="lede">That's OK — most rejections fall into a handful of buckets. Best bet: run your file through the Application Pack for your portal. It resets dimensions, format and file size to the exact spec.</p>
      </div>
      <div class="fix-diagnoses">
        <div class="fix-diagnosis-card is-primary">
          <span class="fix-badge">Safest starting point</span>
          <h3>Reset everything to the portal's exact spec</h3>
          <div class="fix-diag-row">
            <div>
              <p>Most rejections are caused by dimensions, KB size, or format — even when the error message says something else. Running through Application Pack fixes all three at once.</p>
            </div>
          </div>
          <a href="application-pack.html${escapeAttr(portalSuffix)}" class="btn primary fix-cta">Open Application Pack →</a>
        </div>
      </div>
      <div class="fix-result-foot">
        <p>Want us to add this rejection message to the engine? <a href="contact.html">Send it to us</a> — include the exact text and portal name.</p>
      </div>
    `;
  }

  function portalHrefSuffix(portal) {
    return portal ? "?portal=" + portal : "";
  }

  function portalLabel(portal) {
    const labels = {
      ssc: "SSC", upsc: "UPSC", ibps: "IBPS / SBI",
      jee: "JEE Main", neet: "NEET UG",
      passport: "Passport Photo", pan: "PAN Card", kyc: "Bank KYC",
    };
    return labels[portal] || "your portal";
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function escapeAttr(s) { return escapeHTML(s); }

})();
