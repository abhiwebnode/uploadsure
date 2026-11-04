/*
  upload-ai-checks.js
  -------------------
  Two on-device tools for exam / form uploads. Used by ai-tools.html and
  lazy-loaded by the exam pages (js/exam-page.js).

  1. Photo Rejection Checker — runs a 1.2 MB face detector (ONNX Runtime,
     loaded on first use) plus pixel checks, and predicts the usual reasons
     a portal or verifier rejects a photo: no/multiple faces, face too
     small or too big, off-centre, head cut off, blurry, too dark/bright,
     shadow on one side, busy or dark background, black & white.
     It cannot see eyes, glasses or head tilt — those are not claimed.

  2. Signature & Thumb Cleaner — turns a phone photo of a signature (or
     thumb impression / handwritten declaration) on paper into clean ink
     on pure white: removes shadows and paper texture, darkens the ink,
     drops specks, crops tight and pads to the target aspect ratio.
     Pure canvas code, no model download.

  Everything lives inside this IIFE and is exposed as window.UploadSureAI,
  so it can share a page with image-ai-tools.js without name clashes.
  Nothing is uploaded anywhere.
*/
(function () {
  "use strict";

  const ORT_SRC = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js";
  const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";
  const FACE_MODEL_URL = "https://cdn.jsdelivr.net/gh/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB@master/models/onnx/version-RFB-640.onnx";

  /* ================================================================
     Shared helpers
     ================================================================ */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src.split("/").pop()));
      document.head.appendChild(s);
    });
  }

  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  /** Draws an image/canvas scaled so its long side is at most maxSide. */
  function toWorkingCanvas(source, maxSide) {
    const sw = source.naturalWidth || source.width;
    const sh = source.naturalHeight || source.height;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const c = makeCanvas(sw * scale, sh * scale);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function saturationOf(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  }

  /* ================================================================
     1. PHOTO REJECTION CHECKER
     ================================================================ */
  let faceSessionPromise = null;

  function getFaceSession() {
    // Reuse the session from image-ai-tools.js when it's on the same page.
    if (typeof window.getUltraface === "function") return window.getUltraface();
    if (!faceSessionPromise) {
      faceSessionPromise = (async () => {
        if (typeof window.ort === "undefined") await loadScript(ORT_SRC);
        window.ort.env.wasm.wasmPaths = ORT_WASM_PATH;
        window.ort.env.logLevel = "error";
        const resp = await fetch(FACE_MODEL_URL);
        if (!resp.ok) throw new Error("Could not download the face model (" + resp.status + ")");
        const buffer = await resp.arrayBuffer();
        return window.ort.InferenceSession.create(buffer, { executionProviders: ["wasm"], logSeverityLevel: 3 });
      })().catch((err) => { faceSessionPromise = null; throw err; });
    }
    return faceSessionPromise;
  }

  async function detectFaces(session, canvas) {
    const W = canvas.width, H = canvas.height;
    const IW = 640, IH = 480;
    const tmp = makeCanvas(IW, IH);
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(canvas, 0, 0, IW, IH);
    const px = tctx.getImageData(0, 0, IW, IH).data;
    const n = IW * IH;
    const input = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      input[i] = (px[i * 4] - 127) / 128;
      input[i + n] = (px[i * 4 + 1] - 127) / 128;
      input[i + 2 * n] = (px[i * 4 + 2] - 127) / 128;
    }
    const tensor = new window.ort.Tensor("float32", input, [1, 3, IH, IW]);
    const out = await session.run({ [session.inputNames[0]]: tensor });
    const scores = out[session.outputNames[0]].data;
    const boxes = out[session.outputNames[1]].data;
    const found = [];
    for (let i = 0; i < scores.length / 2; i++) {
      const score = scores[i * 2 + 1];
      if (score < 0.7) continue;
      found.push({
        score,
        x1: clamp(boxes[i * 4] * W, 0, W), y1: clamp(boxes[i * 4 + 1] * H, 0, H),
        x2: clamp(boxes[i * 4 + 2] * W, 0, W), y2: clamp(boxes[i * 4 + 3] * H, 0, H),
      });
    }
    // non-max suppression
    found.sort((a, b) => b.score - a.score);
    const keep = [];
    for (const f of found) {
      if (keep.every((k) => iou(k, f) < 0.3)) keep.push(f);
    }
    return keep;
  }

  function iou(a, b) {
    const iw = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
    const ih = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
    const inter = iw * ih;
    const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return inter / (union + 1e-6);
  }

  /** Variance of the Laplacian on a grey copy of a region, at most 160 px wide (never upscaled). */
  function sharpnessOf(canvas, x, y, w, h) {
    const TW = Math.max(16, Math.min(160, Math.round(w)));
    const TH = Math.max(8, Math.round(TW * h / Math.max(1, w)));
    const t = makeCanvas(TW, TH);
    const tctx = t.getContext("2d", { willReadFrequently: true });
    tctx.drawImage(canvas, x, y, w, h, 0, 0, TW, TH);
    const d = tctx.getImageData(0, 0, TW, TH).data;
    const g = new Float32Array(TW * TH);
    for (let i = 0; i < TW * TH; i++) g[i] = luma(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    // Stretch contrast to the 2–98 percentile range so dark or flat
    // lighting isn't mistaken for blur.
    const sorted = Array.from(g).sort((a, b) => a - b);
    const lo = sorted[Math.floor(sorted.length * 0.02)], hi = sorted[Math.floor(sorted.length * 0.98)];
    const k = 255 / Math.max(20, hi - lo);
    for (let i = 0; i < g.length; i++) g[i] = (g[i] - lo) * k;
    let sum = 0, sum2 = 0, cnt = 0;
    for (let yy = 1; yy < TH - 1; yy++) {
      for (let xx = 1; xx < TW - 1; xx++) {
        const i = yy * TW + xx;
        const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - TW] - g[i + TW];
        sum += lap; sum2 += lap * lap; cnt++;
      }
    }
    const mean = sum / cnt;
    return sum2 / cnt - mean * mean;
  }

  /** Mean luma / std / saturation of the pixels selected by `pick(x, y)`. */
  function regionStats(data, W, H, pick, step) {
    let n = 0, sl = 0, sl2 = 0, ss = 0, bright = 0;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (!pick(x, y)) continue;
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const l = luma(r, g, b);
        sl += l; sl2 += l * l; ss += saturationOf(r, g, b); n++;
        if (l > 245) bright++;
      }
    }
    if (!n) return null;
    const mean = sl / n;
    return { n, mean, std: Math.sqrt(Math.max(0, sl2 / n - mean * mean)), sat: ss / n, clipped: bright / n };
  }


  /** Robust background stats: median luma, share of pixels far from it, saturation. */
  function backgroundStats(data, W, H, pick, step) {
    const ls = [];
    let ss = 0;
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        if (!pick(x, y)) continue;
        const i = (y * W + x) * 4;
        ls.push(luma(data[i], data[i + 1], data[i + 2]));
        ss += saturationOf(data[i], data[i + 1], data[i + 2]);
      }
    }
    if (!ls.length) return null;
    const sorted = ls.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    let far = 0;
    for (const l of ls) if (Math.abs(l - median) > 35) far++;
    return { n: ls.length, median, clutter: far / ls.length, sat: ss / ls.length };
  }

  /**
   * Checks a photo the way a portal or verifier would.
   * `source` = image or canvas, framed the way it will be uploaded.
   * Returns { verdict: "pass"|"warn"|"fail", checks: [...], face, canvas }.
   * Each check: { status: "ok"|"warn"|"bad", label, value, tip }.
   */
  async function checkPhotoForRejection(source, opts) {
    opts = opts || {};
    const canvas = toWorkingCanvas(source, 900);
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const checks = [];
    const metrics = {};
    const add = (status, label, value, tip) => checks.push({ status, label, value, tip: tip || "" });

    if (opts.onStatus) opts.onStatus("Loading face detector (one-time download)…");
    const session = await getFaceSession();
    if (opts.onStatus) opts.onStatus("Checking your photo…");
    const all = await detectFaces(session, canvas);

    // Ignore tiny background faces (posters, people far behind).
    const biggest = all.reduce((m, f) => Math.max(m, f.y2 - f.y1), 0);
    const faces = all.filter((f) => f.y2 - f.y1 >= biggest * 0.45);

    // Colour (doesn't need a face)
    const whole = regionStats(data, W, H, () => true, 3);
    const colourCheck = () => {
      if (whole.sat < 0.04) add("warn", "Colour", "looks black & white", "Most portals ask for a colour photo. Use the original camera photo.");
      else add("ok", "Colour", "colour photo");
    };

    if (faces.length === 0) {
      add("bad", "Face", "no face found", "Use a front-facing photo with your whole face visible, eyes open, in good light.");
      colourCheck();
      return finish(checks, null, canvas, metrics);
    }
    if (faces.length > 1) {
      add("bad", "Face", faces.length + " faces found", "Only you should be in the photo. Crop others out or retake it.");
    } else {
      add("ok", "Face", "1 face found");
    }

    const f = faces[0];
    const fw = f.x2 - f.x1, fh = f.y2 - f.y1;
    const cx = (f.x1 + f.x2) / 2, cy = (f.y1 + f.y2) / 2;

    // Face size (detector box ≈ forehead to chin)
    const ratio = fh / H;
    const pct = Math.round(ratio * 100) + "% of height";
    if (ratio < 0.25) add("bad", "Face size", "too small — " + pct, "Crop closer. Your face should fill about half the photo height.");
    else if (ratio < 0.32) add("warn", "Face size", "a bit small — " + pct, "Crop a little closer so the face fills about half the height.");
    else if (ratio > 0.8) add("bad", "Face size", "too close — " + pct, "Step back. Leave space above the head and show the top of the shoulders.");
    else if (ratio > 0.68) add("warn", "Face size", "a bit close — " + pct, "Leave a little more space around the head.");
    else add("ok", "Face size", pct);

    // Horizontal centring
    const dx = Math.abs(cx - W / 2) / W;
    if (dx > 0.15) add("bad", "Centred", "face is off to the " + (cx < W / 2 ? "left" : "right"), "Centre your face in the frame.");
    else if (dx > 0.08) add("warn", "Centred", "slightly off-centre", "Move the crop so your face is in the middle.");
    else add("ok", "Centred", "face is centred");

    // Head position: top of head (≈ a quarter face-height above the box) must be in frame
    const headTop = f.y1 - 0.25 * fh;
    const cyr = cy / H;
    if (headTop < 0) add("bad", "Head position", "top of head is cut off", "Leave a little space above your hair.");
    else if (cyr > 0.62) add("warn", "Head position", "face sits too low", "Reduce the empty space above your head.");
    else if (cyr < 0.25) add("warn", "Head position", "face sits too high", "Leave a little more space above your head.");
    else add("ok", "Head position", "head fully in frame");

    // Sharpness on the face
    const sharp = sharpnessOf(canvas, f.x1, f.y1, fw, fh);
    metrics.sharpness = Math.round(sharp);
    if (sharp < 20) add("bad", "Sharpness", "blurry", "Hold the phone steady, tap to focus on your face, and use good light.");
    else if (sharp < 50) add("warn", "Sharpness", "slightly soft", "A sharper photo is safer. Retake with steady hands and better light.");
    else add("ok", "Sharpness", "sharp");

    // Exposure + even lighting on the inner face
    const ix1 = f.x1 + fw * 0.2, ix2 = f.x2 - fw * 0.2, iy1 = f.y1 + fh * 0.2, iy2 = f.y2 - fh * 0.15;
    const midX = (ix1 + ix2) / 2;
    const inner = regionStats(data, W, H, (x, y) => x >= ix1 && x <= ix2 && y >= iy1 && y <= iy2, 2);
    const leftS = regionStats(data, W, H, (x, y) => x >= ix1 && x < midX - fw * 0.05 && y >= iy1 && y <= iy2, 2);
    const rightS = regionStats(data, W, H, (x, y) => x > midX + fw * 0.05 && x <= ix2 && y >= iy1 && y <= iy2, 2);
    if (inner) {
      const m = inner.mean;
      metrics.faceLuma = Math.round(m);
      if (m < 60) add("bad", "Brightness", "face is too dark", "Face a window or a light. Avoid light behind you.");
      else if (m < 85) add("warn", "Brightness", "face is a bit dark", "Add more light on your face.");
      else if (m > 225 || inner.clipped > 0.25) add("bad", "Brightness", "face is overexposed", "Too much light or flash. Move away from direct light.");
      else if (m > 205 || inner.clipped > 0.1) add("warn", "Brightness", "face is a bit bright", "Turn off the flash or soften the light.");
      else add("ok", "Brightness", "well exposed");
    }
    if (leftS && rightS) {
      const diff = Math.abs(leftS.mean - rightS.mean) / Math.max(1, (leftS.mean + rightS.mean) / 2);
      metrics.lightDiff = +diff.toFixed(3);
      const side = leftS.mean < rightS.mean ? "left" : "right";
      if (diff > 0.32) add("bad", "Even lighting", "strong shadow on the " + side + " side", "Face the light source directly so both sides of your face are lit.");
      else if (diff > 0.2) add("warn", "Even lighting", "some shadow on the " + side + " side", "Turn towards the light a little.");
      else add("ok", "Even lighting", "evenly lit");
    }

    // Background: the band above the head plus the upper corners beside it
    // (skipping hair). Uses median + "clutter" share, which hair edges and a
    // stray strand can't inflate the way a plain std-dev does.
    const topLimit = Math.max(0, headTop - 0.1 * fh);
    const sideGap = fw * 0.7;
    let bg = backgroundStats(data, W, H, (x, y) =>
      (y < topLimit) ||
      (y < f.y1 + 0.35 * fh && (x < f.x1 - sideGap || x > f.x2 + sideGap)), 2);
    let fallback = false;
    if (!bg || bg.n < 150) {
      fallback = true;
      // Tight framing: fall back to the top strip and the two upper corners.
      bg = backgroundStats(data, W, H, (x, y) =>
        (y < H * 0.05) || (y < H * 0.35 && (x < W * 0.1 || x > W * 0.9)), 2);
    }
    metrics.bgMedian = bg && Math.round(bg.median);
    metrics.bgClutter = bg && +bg.clutter.toFixed(3);
    metrics.bgSat = bg && +bg.sat.toFixed(3);
    if (!bg || bg.n < 150) {
      add("warn", "Background", "too little background visible to check", "Leave some plain background around your head.");
    } else {
      const plain = bg.clutter < 0.12 ? "ok" : bg.clutter < 0.25 ? "warn" : "bad";
      const light = bg.median > 175 ? "ok" : bg.median > 140 ? "warn" : "bad";
      const tinted = bg.sat > 0.22;
      if (fallback && plain === "bad") add("warn", "Background", "may not be plain", "Leave some plain background visible around your head.");
      else if (plain === "bad") add("bad", "Background", "busy or uneven", "Stand against a plain, evenly lit white or light wall.");
      else if (light === "bad") add("bad", "Background", "too dark", "Use a white or light-coloured wall behind you.");
      else if (plain === "warn" || light === "warn" || tinted) {
        const why = [plain === "warn" && "not fully plain", light === "warn" && "greyish / dim", tinted && "coloured"].filter(Boolean).join(", ");
        add("warn", "Background", why, "A plain white or off-white wall is the safest choice.");
      } else add("ok", "Background", "plain & light");
    }

    colourCheck();

    // Resolution of the original: face height in source pixels
    const srcH = source.naturalHeight || source.height;
    if (fh * srcH / H < 90) {
      add("warn", "Resolution", "low — face is only " + Math.round(fh * srcH / H) + " px tall", "Use the original camera photo, not a screenshot or forwarded copy.");
    }

    metrics.faceRatio = +ratio.toFixed(3);
    return finish(checks, f, canvas, metrics);
  }

  function finish(checks, face, canvas, metrics) {
    const verdict = checks.some((c) => c.status === "bad") ? "fail"
      : checks.some((c) => c.status === "warn") ? "warn" : "pass";
    return { verdict, checks, face, canvas, metrics };
  }

  /** Small preview with the detected face box and a centre guide. */
  function drawFaceOverlay(result, maxW) {
    const src = result.canvas;
    const scale = Math.min(1, (maxW || 220) / src.width);
    const c = makeCanvas(src.width * scale, src.height * scale);
    const ctx = c.getContext("2d");
    ctx.drawImage(src, 0, 0, c.width, c.height);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c.width / 2, 0); ctx.lineTo(c.width / 2, c.height); ctx.stroke();
    if (result.face) {
      const f = result.face;
      ctx.setLineDash([]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = result.verdict === "pass" ? "#1a7a4a" : result.verdict === "warn" ? "#c88c14" : "#c0392b";
      ctx.strokeRect(f.x1 * scale, f.y1 * scale, (f.x2 - f.x1) * scale, (f.y2 - f.y1) * scale);
    }
    return c;
  }

  const ICONS = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 8v5m0 3h.01"/></svg>',
    bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  /** Renders a result into `container` (summary banner + overlay + checklist). */
  function renderPhotoCheck(result, container) {
    const titles = {
      pass: "Looks good — no common rejection reasons found",
      warn: "Might be rejected — check the flagged items",
      fail: "Likely to be rejected — fix the red items first",
    };
    container.innerHTML = `
      <div class="rfg-summary ${result.verdict === "pass" ? "rfg-pass" : "rfg-warn"}">
        <div class="rfg-content"><strong class="rfg-title">${titles[result.verdict]}</strong></div>
      </div>
      <div class="ai-check-body">
        <div class="ai-check-preview"></div>
        <ul class="checklist">${result.checks.map((c) => `
          <li class="check ${c.status}"><span class="ic">${ICONS[c.status]}</span>
            <span><span class="lbl">${esc(c.label)}</span> — <span class="val">${esc(c.value)}</span>
            ${c.status !== "ok" && c.tip ? `<span class="ai-tip">${esc(c.tip)}</span>` : ""}</span></li>`).join("")}
        </ul>
      </div>
      <p class="ai-disclaimer">Automated check. It can't see eyes, glasses or head tilt — check those yourself.</p>`;
    container.querySelector(".ai-check-preview").appendChild(drawFaceOverlay(result, 200));
  }

  /* ================================================================
     2. SIGNATURE & THUMB CLEANER
     ================================================================ */

  /** Otsu threshold for values in [0,1]. */
  function otsu(values) {
    const hist = new Float64Array(256);
    for (let i = 0; i < values.length; i++) hist[Math.min(255, Math.max(0, Math.round(values[i] * 255)))]++;
    const total = values.length;
    let sumAll = 0;
    for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let wB = 0, sumB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr / 255;
  }

  /**
   * Sliding-window max or min along rows (horizontal) or columns, window
   * 2r+1, using the van Herk / Gil-Werman trick (constant cost per pixel).
   */
  function slide(src, W, H, r, useMax, horizontal) {
    const out = new Float32Array(W * H);
    const len = horizontal ? W : H, lines = horizontal ? H : W;
    const k = 2 * r + 1;
    const padLen = len + 2 * r;
    const n = Math.ceil(padLen / k) * k;
    const a = new Float32Array(n), g = new Float32Array(n), h = new Float32Array(n);
    const pick = useMax ? Math.max : Math.min;
    const fill = useMax ? -Infinity : Infinity;
    for (let line = 0; line < lines; line++) {
      for (let i = 0; i < n; i++) {
        const j = i - r;
        if (j < 0 || j >= len) a[i] = fill;
        else a[i] = horizontal ? src[line * W + j] : src[j * W + line];
      }
      for (let b = 0; b < n; b += k) {
        g[b] = a[b];
        for (let i = b + 1; i < b + k; i++) g[i] = pick(g[i - 1], a[i]);
        h[b + k - 1] = a[b + k - 1];
        for (let i = b + k - 2; i >= b; i--) h[i] = pick(h[i + 1], a[i]);
      }
      for (let j = 0; j < len; j++) {
        const v = pick(h[j], g[j + 2 * r]);
        if (horizontal) out[line * W + j] = v; else out[j * W + line] = v;
      }
    }
    return out;
  }

  /**
   * Paper brightness map = morphological closing of the grey image
   * (max filter, then min filter). Thin dark ink strokes disappear, while
   * lighting gradients and hard shadow / desk edges are kept exactly, so
   * dividing by this map flattens the paper without inventing lines.
   */
  function estimatePaper(gray, W, H) {
    const r = Math.max(8, Math.round(Math.max(W, H) / 100));
    let m = slide(gray, W, H, r, true, true);
    m = slide(m, W, H, r, true, false);
    m = slide(m, W, H, r, false, true);
    m = slide(m, W, H, r, false, false);
    return m;
  }

  /** 8-connected components on a binary mask. Returns { labels, comps }. */
  function components(mask, W, H) {
    const labels = new Int32Array(W * H);
    const comps = [];
    const stack = new Int32Array(W * H);
    let next = 1;
    for (let start = 0; start < W * H; start++) {
      if (!mask[start] || labels[start]) continue;
      let sp = 0, area = 0, minX = W, minY = H, maxX = 0, maxY = 0;
      stack[sp++] = start; labels[start] = next;
      while (sp) {
        const p = stack[--sp];
        const x = p % W, y = (p / W) | 0;
        area++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const q = yy * W + xx;
            if (mask[q] && !labels[q]) { labels[q] = next; stack[sp++] = q; }
          }
        }
      }
      comps.push({ id: next, area, minX, minY, maxX, maxY, keep: true });
      next++;
    }
    return { labels, comps };
  }

  const INK = { black: [17, 17, 24], blue: [18, 42, 150] };

  /**
   * Cleans a photo of ink on paper.
   * opts.aspect  — width/height of the output (e.g. 140/60); null = tight crop.
   * opts.ink     — "auto" | "black" | "blue".
   * Returns { canvas, ink, warnings, noInk }. When noInk is true the canvas
   * is not usable — callers should fall back to the original photo.
   */
  function cleanSignatureImage(source, opts) {
    opts = opts || {};
    const work = toWorkingCanvas(source, 1600);
    const W = work.width, H = work.height, N = W * H;
    const px = work.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;

    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) gray[i] = luma(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);

    // Flatten lighting: divide by the local paper brightness.
    const paper = estimatePaper(gray, W, H);
    const norm = new Float32Array(N);
    for (let i = 0; i < N; i++) norm[i] = clamp(gray[i] / Math.max(paper[i], 1), 0, 1);

    // Threshold (Otsu), with a guard so plain paper noise never becomes ink.
    let t = otsu(norm);
    t = clamp(t, 0.35, 0.85);
    const tHi = Math.min(0.93, t + 0.07);
    const tLo = Math.max(0, t - 0.3);

    const mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = norm[i] < t ? 1 : 0;

    // Drop specks and paper-edge lines.
    const { labels, comps } = components(mask, W, H);
    const minArea = Math.max(10, N * 0.00003);
    for (const c of comps) {
      const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
      const touches = c.minX <= 1 || c.minY <= 1 || c.maxX >= W - 2 || c.maxY >= H - 2;
      const spansH = c.minY <= 1 && c.maxY >= H - 2;   // top-to-bottom: shadow or desk edge
      const spansW = c.minX <= 1 && c.maxX >= W - 2;
      const lineLike = Math.max(cw, ch) / Math.max(1, Math.min(cw, ch)) > 12;
      if (c.area < minArea) c.keep = false;
      else if (spansH || spansW) c.keep = false;
      else if (touches && (lineLike || c.area > N * 0.15)) c.keep = false;
    }
    // Drop small strays far from the main ink.
    const kept = comps.filter((c) => c.keep);
    const inkArea = kept.reduce((s, c) => s + c.area, 0);
    const major = kept.filter((c) => c.area >= inkArea * 0.02);
    if (major.length) {
      const mb = bboxOf(major);
      const diag = Math.hypot(W, H);
      for (const c of kept) {
        if (c.area >= inkArea * 0.02) continue;
        const gx = Math.max(0, mb.minX - c.maxX, c.minX - mb.maxX);
        const gy = Math.max(0, mb.minY - c.maxY, c.minY - mb.maxY);
        if (Math.hypot(gx, gy) > diag * 0.08) c.keep = false;
      }
    }
    const keepSet = new Uint8Array(comps.length + 1);
    for (const c of comps) if (c.keep) keepSet[c.id] = 1;
    const final = comps.filter((c) => c.keep);

    const warnings = [];
    const finalArea = final.reduce((s, c) => s + c.area, 0);
    const noInk = !final.length || finalArea < N * 0.0008;
    if (noInk) {
      warnings.push("No clear ink found. Sign with a dark pen on white paper and take the photo in good light.");
    }
    const box = final.length ? bboxOf(final) : { minX: 0, minY: 0, maxX: W - 1, maxY: H - 1 };
    if (final.length && (box.minX <= 1 || box.minY <= 1 || box.maxX >= W - 2 || box.maxY >= H - 2)) {
      warnings.push("The ink touches the edge of the photo — part of it may be cut off.");
    }

    // Ink colour
    let ink = opts.ink || "auto";
    if (ink === "auto") {
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < N; i += 2) {
        if (!mask[i] || !keepSet[labels[i]] || norm[i] > tLo + (t - tLo) * 0.5) continue;
        r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++;
      }
      ink = n && b / n > r / n + 18 && b / n > g / n + 6 ? "blue" : "black";
    }
    const [ir, ig, ib] = INK[ink] || INK.black;

    // Crop with padding, then widen to the target aspect.
    const bw = box.maxX - box.minX + 1, bh = box.maxY - box.minY + 1;
    const pad = Math.round(Math.max(bw, bh) * (opts.padding !== undefined ? opts.padding : 0.08)) + 2;
    let cx0 = box.minX - pad, cy0 = box.minY - pad, cw = bw + pad * 2, chh = bh + pad * 2;
    if (opts.aspect) {
      if (cw / chh < opts.aspect) { const nw = chh * opts.aspect; cx0 -= (nw - cw) / 2; cw = nw; }
      else { const nh = cw / opts.aspect; cy0 -= (nh - chh) / 2; chh = nh; }
    }
    const outScale = Math.min(1, 1200 / Math.max(cw, chh));
    const out = makeCanvas(cw * outScale, chh * outScale);
    const octx = out.getContext("2d");
    const full = octx.createImageData(out.width, out.height);
    const od = full.data;
    for (let oy = 0; oy < out.height; oy++) {
      const sy = Math.floor(cy0 + oy / outScale);
      for (let ox = 0; ox < out.width; ox++) {
        const sx = Math.floor(cx0 + ox / outScale);
        let a = 0;
        if (sx >= 0 && sy >= 0 && sx < W && sy < H) {
          const i = sy * W + sx;
          const lab = labels[i];
          // ink pixels of kept components, plus soft anti-aliased edge pixels next to them
          if ((lab && keepSet[lab]) || (!lab && norm[i] < tHi && nearKept(labels, keepSet, sx, sy, W, H))) {
            a = clamp((tHi - norm[i]) / (tHi - tLo), 0, 1);
          }
        }
        const o = (oy * out.width + ox) * 4;
        od[o] = Math.round(255 + (ir - 255) * a);
        od[o + 1] = Math.round(255 + (ig - 255) * a);
        od[o + 2] = Math.round(255 + (ib - 255) * a);
        od[o + 3] = 255;
      }
    }
    octx.putImageData(full, 0, 0);
    return { canvas: out, ink, warnings, noInk };
  }

  function nearKept(labels, keepSet, x, y, W, H) {
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= H) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const l = labels[yy * W + xx];
        if (l && keepSet[l]) return true;
      }
    }
    return false;
  }

  function bboxOf(list) {
    return list.reduce((b, c) => ({
      minX: Math.min(b.minX, c.minX), minY: Math.min(b.minY, c.minY),
      maxX: Math.max(b.maxX, c.maxX), maxY: Math.max(b.maxY, c.maxY),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
  }

  /* ================================================================
     Tool cards on ai-tools.html
     ================================================================ */
  function initPhotoCheckerTool() {
    const drop = document.getElementById("photoCheckDrop");
    const input = document.getElementById("photoCheckFile");
    const status = document.getElementById("photoCheckStatus");
    const out = document.getElementById("photoCheckOut");
    if (!drop) return;
    bindDropZone(drop, input, async (file) => {
      out.className = "ai-check-out";
      out.innerHTML = "";
      try {
        const image = await loadImageFromFile(file);
        const result = await checkPhotoForRejection(image, { onStatus: (s) => (status.textContent = s) });
        status.textContent = "";
        renderPhotoCheck(result, out);
        const more = document.createElement("p");
        more.className = "ai-next";
        more.innerHTML = 'Next: <a href="exam-photo-size.html">resize it to your exam\'s exact size →</a>';
        out.appendChild(more);
      } catch (err) {
        status.textContent = "";
        out.className = "tool-out err";
        out.textContent = "Failed: " + err.message;
      }
    });
  }

  const SIG_PRESETS = {
    "sig-140x60": { w: 140, h: 60, label: "signature" },
    "sig-350x150": { w: 350, h: 150, label: "signature" },
    "thumb-240": { w: 240, h: 240, label: "thumb" },
    "tight": null,
  };

  function initSignatureCleanerTool() {
    const drop = document.getElementById("sigCleanDrop");
    const input = document.getElementById("sigCleanFile");
    const preset = document.getElementById("sigCleanPreset");
    const inkSeg = document.getElementById("sigCleanInk");
    const out = document.getElementById("sigCleanOut");
    if (!drop) return;
    let inkChoice = "auto";
    let lastFile = null;

    inkSeg.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        inkSeg.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === btn));
        inkChoice = btn.dataset.ink;
        if (lastFile) run(lastFile);
      });
    });
    preset.addEventListener("change", () => { if (lastFile) run(lastFile); });

    async function run(file) {
      lastFile = file;
      out.className = "tool-out";
      out.textContent = "Cleaning…";
      try {
        const image = await loadImageFromFile(file);
        const p = SIG_PRESETS[preset.value];
        const res = cleanSignatureImage(image, { aspect: p ? p.w / p.h : null, ink: inkChoice });
        if (res.noInk) {
          out.className = "tool-out err";
          out.textContent = res.warnings[0];
          return;
        }
        let final = res.canvas;
        if (p) {
          final = makeCanvas(p.w, p.h);
          const fctx = final.getContext("2d");
          fctx.imageSmoothingQuality = "high";
          fctx.drawImage(res.canvas, 0, 0, p.w, p.h);
        }
        const blob = await canvasToBlob(final, "image/jpeg", 0.92);
        const url = URL.createObjectURL(blob);
        const name = (p ? p.label : "signature") + "_clean" + (p ? `_${p.w}x${p.h}` : "") + ".jpg";
        out.className = "ai-check-out";
        out.innerHTML = `
          <div class="sig-compare">
            <figure><img src="${URL.createObjectURL(file)}" alt="original"><figcaption>Original</figcaption></figure>
            <figure><img src="${url}" alt="cleaned"><figcaption>Cleaned · ${res.ink} ink${p ? ` · ${p.w}×${p.h}px` : ""} · ${formatKilobytes(blob.size)} KB</figcaption></figure>
          </div>
          ${res.warnings.map((w) => `<p class="ai-warn">${esc(w)}</p>`).join("")}
          <div class="act-row"><button class="btn primary sm">Download JPG</button></div>
          <p class="ai-next">Need an exact KB range? <a href="exam-photo-size.html">Use your exam's page →</a> (cleaning is built in there too)</p>`;
        out.querySelector("button").onclick = () => triggerDownload(blob, name);
      } catch (err) {
        out.className = "tool-out err";
        out.textContent = "Failed: " + err.message;
      }
    }
    bindDropZone(drop, input, run);
  }

  window.UploadSureAI = {
    estimatePaper,
    checkPhotoForRejection,
    renderPhotoCheck,
    cleanSignatureImage,
    initPhotoCheckerTool,
    initSignatureCleanerTool,
  };
})();
