/*
  doc-tools.js
  ------------
  Two tools for "the portal won't accept my file":

  1. Document Scanner (ai-tools.html #t-doc-scan)
     Phone photo of a certificate / marksheet / ID → finds the page edges
     (drag the corners to adjust), straightens it, gives it a clean scan
     look (Colour / Grayscale / B&W), and saves JPG or a multi-page PDF
     under a chosen KB limit. Needs upload-ai-checks.js for the lighting
     flattener (estimatePaper).

  2. Fix from error message (fix-rejection.html)
     Reads KB limits, pixel or cm sizes, file format and document type out
     of the portal's rejection text, shows them as editable fields, and
     fixes the dropped file to match. Signature / thumb clean-up lazy-loads
     upload-ai-checks.js.

  Shared: a small JPEG→PDF writer (no library) and an encoder that lands a
  JPEG inside a [min, max] KB band. Everything runs in the browser.

  Depends on: utils.js, worker-client.js
*/
(function () {
  "use strict";

  const KB = 1024;

  /* ================================================================
     Shared helpers
     ================================================================ */
  function makeCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function scaleCanvas(src, k) {
    const c = makeCanvas(src.width * k, src.height * k);
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function imageToCanvas(img, maxSide) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const k = Math.min(1, (maxSide || 4000) / Math.max(w, h));
    const c = makeCanvas(w * k, h * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function rotateCanvas90(src) {
    const c = makeCanvas(src.height, src.width);
    const ctx = c.getContext("2d");
    ctx.translate(c.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, 0, 0);
    return c;
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

  async function jpegFromCanvas(canvas, maxKilobytes) {
    if (typeof workerCompressFixedDimensions === "function") {
      const bitmap = await createImageBitmap(canvas);
      return (await workerCompressFixedDimensions(bitmap, "image/jpeg", maxKilobytes)).blob;
    }
    // Fallback: binary search on the main thread
    let lo = 0.3, hi = 0.95, best = await canvasToBlob(canvas, "image/jpeg", 0.3);
    for (let i = 0; i < 8; i++) {
      const q = (lo + hi) / 2;
      const b = await canvasToBlob(canvas, "image/jpeg", q);
      if (b.size <= maxKilobytes * KB) { best = b; lo = q; } else hi = q;
    }
    return best;
  }

  /** Inserts JPEG comment segments after SOI so the file reaches targetBytes.
      Decoders ignore COM segments; pixels are untouched. */
  async function padJpeg(blob, targetBytes) {
    const src = new Uint8Array(await blob.arrayBuffer());
    let need = targetBytes - src.length;
    if (need <= 4 || src[0] !== 0xff || src[1] !== 0xd8) return blob;
    const parts = [src.slice(0, 2)];
    while (need > 4) {
      const payload = Math.min(need - 4, 65533);
      const seg = new Uint8Array(payload + 4);
      seg[0] = 0xff; seg[1] = 0xfe;
      seg[2] = ((payload + 2) >> 8) & 0xff; seg[3] = (payload + 2) & 0xff;
      seg.fill(0x20, 4);
      parts.push(seg);
      need -= seg.length;
    }
    parts.push(src.slice(2));
    return new Blob(parts, { type: "image/jpeg" });
  }

  /**
   * Encodes `canvas` as JPEG inside [minKB, maxKB].
   * - Caps at 97% of maxKB counted as 1000-byte KB, so it passes portals
   *   that count either way.
   * - If even the lowest quality is too big and resizing is allowed, the
   *   image is scaled down and retried.
   * - If it comes out under minKB it is padded (pixels unchanged).
   * Returns { blob, canvas, resized }.
   */
  async function encodeInBand(canvas, { minKB, maxKB, allowResize }) {
    const capBytes = maxKB ? maxKB * 1000 * 0.97 : Infinity;
    let cur = canvas, resized = false, blob;
    for (let attempt = 0; attempt < 8; attempt++) {
      blob = await jpegFromCanvas(cur, isFinite(capBytes) ? capBytes / KB : 100000);
      if (blob.size <= capBytes || !allowResize) break;
      const k = clamp(Math.sqrt(capBytes / blob.size) * 0.92, 0.35, 0.95);
      cur = scaleCanvas(cur, k);
      resized = true;
    }
    if (minKB && blob.size < minKB * KB * 1.02) {
      const target = Math.min(isFinite(capBytes) ? capBytes : Infinity, Math.max(minKB * KB * 1.06, (minKB + (maxKB || minKB * 2)) / 2 * 1000));
      blob = await padJpeg(blob, Math.round(target));
    }
    return { blob, canvas: cur, resized };
  }

  /* ---------- minimal JPEG → PDF writer ---------- */
  const A4 = { w: 595.28, h: 841.89 };

  /** pages: [{ jpeg: Blob, width, height }]. pageSize "a4" or "fit". */
  async function buildPdf(pages, pageSize) {
    const enc = new TextEncoder();
    const chunks = [];
    const offsets = [];
    let length = 0;
    const push = (data) => {
      const bytes = typeof data === "string" ? enc.encode(data) : data;
      chunks.push(bytes);
      length += bytes.length;
    };
    const obj = (num, body) => { offsets[num] = length; push(`${num} 0 obj\n`); body(); push("\nendobj\n"); };

    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    const n = pages.length;
    const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => push(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));

    for (let i = 0; i < n; i++) {
      const p = pages[i];
      const bytes = new Uint8Array(await p.jpeg.arrayBuffer());
      let pw, ph, dw, dh, dx, dy;
      if (pageSize === "a4") {
        const landscape = p.width > p.height;
        pw = landscape ? A4.h : A4.w; ph = landscape ? A4.w : A4.h;
        const margin = 18;
        const k = Math.min((pw - 2 * margin) / p.width, (ph - 2 * margin) / p.height);
        dw = p.width * k; dh = p.height * k; dx = (pw - dw) / 2; dy = (ph - dh) / 2;
      } else {
        pw = A4.w; ph = A4.w * p.height / p.width; dw = pw; dh = ph; dx = 0; dy = 0;
      }
      const f = (v) => v.toFixed(2);
      const pageNum = 3 + i * 3, imgNum = pageNum + 1, contNum = pageNum + 2;
      obj(pageNum, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pw)} ${f(ph)}] /Resources << /XObject << /Im0 ${imgNum} 0 R >> >> /Contents ${contNum} 0 R >>`));
      obj(imgNum, () => {
        push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
        push(bytes);
        push("\nendstream");
      });
      const content = `q ${f(dw)} 0 0 ${f(dh)} ${f(dx)} ${f(dy)} cm /Im0 Do Q`;
      obj(contNum, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    }

    const total = 3 + n * 3;
    const xrefAt = length;
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let i = 1; i < total; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    push(xref);
    push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);
    return new Blob(chunks, { type: "application/pdf" });
  }

  /** Builds a PDF from canvases, fitting the total under maxKB if given. */
  async function pdfFromCanvases(canvases, { maxKB, pageSize }) {
    const overhead = 600 + 520 * canvases.length;
    const capBytes = maxKB ? maxKB * 1000 * 0.97 : Infinity;
    let perPage = isFinite(capBytes) ? (capBytes - overhead) / canvases.length : Infinity;
    if (perPage < 4 * KB) throw new Error("That KB limit is too small for " + canvases.length + " page" + (canvases.length > 1 ? "s" : "") + ".");
    const pages = [];
    for (const c of canvases) {
      const res = isFinite(perPage)
        ? await encodeInBand(c, { maxKB: perPage / 1000, allowResize: true })
        : { blob: await canvasToBlob(c, "image/jpeg", 0.85), canvas: c };
      pages.push({ jpeg: res.blob, width: res.canvas.width, height: res.canvas.height });
    }
    return buildPdf(pages, pageSize);
  }

  /* ================================================================
     1. DOCUMENT SCANNER
     ================================================================ */

  /** Largest bright region → its four extreme corners. null if unsure. */
  function detectDocumentQuad(canvas) {
    const k = Math.min(1, 360 / Math.max(canvas.width, canvas.height));
    const W = Math.max(8, Math.round(canvas.width * k)), H = Math.max(8, Math.round(canvas.height * k));
    const small = makeCanvas(W, H);
    const sctx = small.getContext("2d", { willReadFrequently: true });
    sctx.filter = "blur(2px)";
    sctx.drawImage(canvas, 0, 0, W, H);
    const d = sctx.getImageData(0, 0, W, H).data;
    const N = W * H;
    const g = new Uint8Array(N);
    const hist = new Float64Array(256);
    // "Whiteness" = brightness × (1 − saturation). Paper stays white-ish
    // grey even under a shadow, while wood / cloth / coloured desks score
    // low — so a shadow across the page doesn't split it from the paper.
    for (let i = 0; i < N; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], bb = d[i * 4 + 2];
      const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
      const sat = mx ? (mx - mn) / mx : 0;
      const v = Math.round(mx * (1 - sat));
      g[i] = v; hist[v]++;
    }
    // Otsu
    let sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
    let wB = 0, sumB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = N - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumAll - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    const mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = g[i] > thr ? 1 : 0;

    // Largest 4-connected bright component
    const label = new Int32Array(N);
    const stack = new Int32Array(N);
    let bestLab = 0, bestArea = 0, lab = 0;
    for (let s = 0; s < N; s++) {
      if (!mask[s] || label[s]) continue;
      lab++;
      let sp = 0, area = 0;
      stack[sp++] = s; label[s] = lab;
      while (sp) {
        const p = stack[--sp]; area++;
        const x = p % W, y = (p / W) | 0;
        if (x > 0 && mask[p - 1] && !label[p - 1]) { label[p - 1] = lab; stack[sp++] = p - 1; }
        if (x < W - 1 && mask[p + 1] && !label[p + 1]) { label[p + 1] = lab; stack[sp++] = p + 1; }
        if (y > 0 && mask[p - W] && !label[p - W]) { label[p - W] = lab; stack[sp++] = p - W; }
        if (y < H - 1 && mask[p + W] && !label[p + W]) { label[p + W] = lab; stack[sp++] = p + W; }
      }
      if (area > bestArea) { bestArea = area; bestLab = lab; }
    }
    if (bestArea < N * 0.12 || bestArea > N * 0.97) return null;

    let tl = null, tr = null, br = null, bl = null;
    let mnS = Infinity, mxS = -Infinity, mxD = -Infinity, mnD = Infinity;
    for (let p = 0; p < N; p++) {
      if (label[p] !== bestLab) continue;
      const x = p % W, y = (p / W) | 0;
      const s = x + y, df = x - y;
      if (s < mnS) { mnS = s; tl = [x, y]; }
      if (s > mxS) { mxS = s; br = [x, y]; }
      if (df > mxD) { mxD = df; tr = [x, y]; }
      if (df < mnD) { mnD = df; bl = [x, y]; }
    }
    const quad = [tl, tr, br, bl].map(([x, y]) => [(x + 0.5) / k, (y + 0.5) / k]);
    // Must be a sensible convex-ish shape that the region mostly fills
    const area = polyArea(quad) * k * k;
    if (area < N * 0.12 || bestArea / area < 0.75) return null;
    return quad;
  }

  function polyArea(q) {
    let a = 0;
    for (let i = 0; i < q.length; i++) {
      const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % q.length];
      a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /** Homography mapping (u,v) in the output rectangle to source quad points. */
  function homography(quad, W, H) {
    const src = [[0, 0], [W, 0], [W, H], [0, H]];
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = src[i], [x, y] = quad[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    // Gaussian elimination
    for (let c = 0; c < 8; c++) {
      let piv = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }

  const SHAPES = { a4p: 210 / 297, a4l: 297 / 210, id: 85.6 / 54 };   // width / height

  /**
   * Straightens the quad region of `src` into a flat rectangle.
   * shape: "auto" keeps the photographed proportions; "a4p" / "a4l" / "id"
   * force the real document proportions, which undoes the squash a tilted
   * camera adds.
   */
  function warpQuad(src, quad, maxSide, shape) {
    let W = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
    let H = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
    if (shape && SHAPES[shape]) {
      const r = SHAPES[shape];
      const long = Math.max(W, H);
      if (r < 1) { H = long; W = long * r; } else { W = long; H = long / r; }
    }
    const k = Math.min(1, (maxSide || 2000) / Math.max(W, H));
    W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k));
    const h = homography(quad, W, H);
    const sw = src.width, sh = src.height;
    const sd = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, sw, sh).data;
    const out = makeCanvas(W, H);
    const octx = out.getContext("2d");
    const od = octx.createImageData(W, H);
    const o = od.data;
    for (let v = 0; v < H; v++) {
      for (let u = 0; u < W; u++) {
        const den = h[6] * u + h[7] * v + 1;
        const x = (h[0] * u + h[1] * v + h[2]) / den;
        const y = (h[3] * u + h[4] * v + h[5]) / den;
        const x0 = clamp(Math.floor(x), 0, sw - 1), y0 = clamp(Math.floor(y), 0, sh - 1);
        const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
        const fx = clamp(x - x0, 0, 1), fy = clamp(y - y0, 0, 1);
        const i00 = (y0 * sw + x0) * 4, i10 = (y0 * sw + x1) * 4, i01 = (y1 * sw + x0) * 4, i11 = (y1 * sw + x1) * 4;
        const oi = (v * W + u) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = sd[i00 + ch] * (1 - fx) + sd[i10 + ch] * fx;
          const bot = sd[i01 + ch] * (1 - fx) + sd[i11 + ch] * fx;
          o[oi + ch] = top * (1 - fy) + bot * fy;
        }
        o[oi + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  /**
   * Scan look. mode: "color" | "gray" | "bw".
   * Divides by a paper-brightness map so shadows and uneven light vanish.
   * The map is floored at 60% of the paper level so large dark areas
   * (an ID photo, a logo) are kept rather than washed out.
   */
  function enhanceScan(src, mode) {
    const W = src.width, H = src.height, N = W * H;
    const ctx = src.getContext("2d", { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, W, H).data;
    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let paper;
    if (window.UploadSureAI && window.UploadSureAI.estimatePaper) {
      paper = window.UploadSureAI.estimatePaper(gray, W, H);
    } else {
      paper = new Float32Array(N).fill(255);
    }
    // Paper level = 90th percentile of the map
    const sample = [];
    for (let i = 0; i < N; i += 97) sample.push(paper[i]);
    sample.sort((a, b) => a - b);
    const level = Math.max(60, sample[Math.floor(sample.length * 0.9)] || 255);
    const floor = level * 0.6;

    const out = makeCanvas(W, H);
    const octx = out.getContext("2d");
    const od = octx.createImageData(W, H);
    const o = od.data;
    const lo = 0.06, hi = 0.93;
    const curve = (v) => clamp((v - lo) / (hi - lo), 0, 1);
    for (let i = 0; i < N; i++) {
      const pmap = Math.max(paper[i], floor);
      const k = 255 / pmap;
      const oi = i * 4;
      if (mode === "color") {
        o[oi] = 255 * curve(d[oi] * k / 255);
        o[oi + 1] = 255 * curve(d[oi + 1] * k / 255);
        o[oi + 2] = 255 * curve(d[oi + 2] * k / 255);
      } else {
        const n = clamp(gray[i] * k / 255, 0, 1);
        let v;
        if (mode === "bw") v = 255 * clamp((n - 0.5) / 0.32, 0, 1);
        else v = 255 * Math.pow(curve(n), 1.15);
        o[oi] = o[oi + 1] = o[oi + 2] = v;
      }
      o[oi + 3] = 255;
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  /* ---------- corner editor ---------- */
  function CornerEditor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.src = null;
    this.quad = null;
    this.scale = 1;
    this.drag = -1;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [(t.clientX - r.left) * (canvas.width / r.width) / this.scale, (t.clientY - r.top) * (canvas.height / r.height) / this.scale];
    };
    const down = (e) => {
      if (!this.quad) return;
      const p = pos(e);
      const hit = 28 / this.scale * (canvas.width / canvas.getBoundingClientRect().width);
      let best = -1, bd = Infinity;
      this.quad.forEach((q, i) => { const dd = dist(q, p); if (dd < bd) { bd = dd; best = i; } });
      if (bd < hit * 1.6) { this.drag = best; e.preventDefault(); }
    };
    const move = (e) => {
      if (this.drag < 0) return;
      const p = pos(e);
      this.quad[this.drag] = [clamp(p[0], 0, this.src.width), clamp(p[1], 0, this.src.height)];
      this.draw();
      e.preventDefault();
    };
    const up = () => { this.drag = -1; };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    canvas.style.touchAction = "none";
  }
  CornerEditor.prototype.load = function (src, quad) {
    this.src = src;
    const maxW = Math.min(900, src.width), k = maxW / src.width;
    this.scale = Math.min(k, 700 / src.height);
    this.canvas.width = Math.round(src.width * this.scale);
    this.canvas.height = Math.round(src.height * this.scale);
    this.quad = quad.map((p) => p.slice());
    this.draw();
  };
  CornerEditor.prototype.draw = function () {
    const { ctx, canvas, scale } = this;
    ctx.drawImage(this.src, 0, 0, canvas.width, canvas.height);
    const q = this.quad.map(([x, y]) => [x * scale, y * scale]);
    ctx.save();
    ctx.fillStyle = "rgba(10,25,45,0.45)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(q[0][0], q[0][1]); for (let i = 3; i >= 1; i--) ctx.lineTo(q[i][0], q[i][1]); ctx.closePath();
    ctx.fill("evenodd");
    ctx.strokeStyle = "#22c3e6"; ctx.lineWidth = 2.5;
    ctx.beginPath(); q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    const r = Math.max(9, canvas.width / 70);
    q.forEach(([x, y]) => {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fff"; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = "#22c3e6"; ctx.stroke();
    });
    ctx.restore();
  };

  const SCAN_LIMITS = { none: null, "100": 100, "200": 200, "300": 300, "500": 500, "1024": 1024, "2048": 2048 };

  function initDocScannerTool() {
    const $ = (id) => document.getElementById(id);
    const drop = $("scanDrop"), input = $("scanFile");
    if (!drop) return;
    const editorWrap = $("scanEditor"), status = $("scanStatus");
    const pagesEl = $("scanPages"), out = $("scanOut");
    const editor = new CornerEditor($("scanCanvas"));
    const queue = [];      // pending source canvases
    const pages = [];      // { flat: canvas }
    let mode = "color", format = "pdf";

    const thumbOf = (flat) => enhanceScan(scaleCanvas(flat, Math.min(1, 220 / Math.max(flat.width, flat.height))), mode);

    function renderPages() {
      pagesEl.innerHTML = "";
      pages.forEach((pg, i) => {
        const fig = document.createElement("figure");
        fig.className = "scan-page";
        const t = thumbOf(pg.flat);
        fig.appendChild(t);
        const cap = document.createElement("figcaption");
        cap.innerHTML = `Page ${i + 1} <button class="scan-del" aria-label="Remove page ${i + 1}">×</button>`;
        cap.querySelector("button").onclick = () => { pages.splice(i, 1); renderPages(); };
        fig.appendChild(cap);
        pagesEl.appendChild(fig);
      });
      $("scanExportRow").hidden = pages.length === 0;
      $("scanExport").textContent = format === "pdf"
        ? `Download PDF (${pages.length} page${pages.length > 1 ? "s" : ""})`
        : `Download JPG${pages.length > 1 ? "s" : ""}`;
    }

    function openNext() {
      if (!queue.length) { editorWrap.hidden = true; return; }
      const src = queue[0];
      const auto = detectDocumentQuad(src);
      const inset = Math.min(src.width, src.height) * 0.03;
      const full = [[inset, inset], [src.width - inset, inset], [src.width - inset, src.height - inset], [inset, src.height - inset]];
      editor.load(src, auto || full);
      status.textContent = auto ? "Page edges found — drag the corners to adjust." : "Couldn't find the page edges — drag the corners onto the page.";
      $("scanQueueNote").textContent = queue.length > 1 ? `${queue.length - 1} more photo${queue.length > 2 ? "s" : ""} waiting` : "";
      editorWrap.hidden = false;
      editorWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    const addFiles = async (files) => {
      const list = files instanceof FileList || Array.isArray(files) ? Array.from(files) : [files];
      for (const f of list) {
        try { queue.push(imageToCanvas(await loadImageFromFile(f), 3000)); }
        catch (e) { showToast("Could not read " + f.name); }
      }
      if (editorWrap.hidden) openNext();
    };
    bindDropZone(drop, input, addFiles);

    // Camera buttons (shown on phones/tablets): capture="environment" opens
    // the rear camera directly; each shot goes into the same queue.
    document.querySelectorAll("#t-doc-scan .scan-camera input").forEach((cam) => {
      cam.addEventListener("change", () => {
        if (cam.files && cam.files.length) addFiles(cam.files);
        cam.value = "";
      });
    });

    $("scanAuto").onclick = () => {
      const q = detectDocumentQuad(editor.src);
      if (q) { editor.quad = q; editor.draw(); status.textContent = "Page edges found — drag the corners to adjust."; }
      else showToast("Couldn't find the edges — drag the corners yourself");
    };
    $("scanFull").onclick = () => {
      const s = editor.src;
      editor.quad = [[0, 0], [s.width, 0], [s.width, s.height], [0, s.height]];
      editor.draw();
    };
    $("scanRotate").onclick = () => {
      queue[0] = rotateCanvas90(queue[0]);
      openNext();
    };
    $("scanSkip").onclick = () => { queue.shift(); openNext(); };
    $("scanAdd").onclick = () => {
      const flat = warpQuad(editor.src, editor.quad, 2000, $("scanShape").value);
      pages.push({ flat });
      queue.shift();
      renderPages();
      openNext();
    };

    const seg = (id, set) => {
      $(id).querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        set(b.dataset.v);
        renderPages();
      }));
    };
    seg("scanMode", (v) => (mode = v));
    seg("scanFormat", (v) => (format = v));

    $("scanExport").onclick = async () => {
      if (!pages.length) return;
      const btn = $("scanExport");
      btn.disabled = true;
      out.className = "tool-out";
      out.textContent = "Preparing…";
      try {
        const limit = SCAN_LIMITS[$("scanLimit").value];
        const finals = pages.map((p) => enhanceScan(p.flat, mode));
        if (format === "pdf") {
          const blob = await pdfFromCanvases(finals, { maxKB: limit, pageSize: $("scanPage").value });
          triggerDownload(blob, "scan.pdf");
          out.className = "tool-out ok";
          out.textContent = `Saved scan.pdf — ${pages.length} page${pages.length > 1 ? "s" : ""}, ${formatKilobytes(blob.size)} KB${limit ? ` (limit ${limit >= 1024 ? limit / 1024 + " MB" : limit + " KB"})` : ""}.`;
        } else {
          const sizes = [];
          for (let i = 0; i < finals.length; i++) {
            const res = limit
              ? await encodeInBand(finals[i], { maxKB: limit, allowResize: true })
              : { blob: await canvasToBlob(finals[i], "image/jpeg", 0.88) };
            triggerDownload(res.blob, `scan_page${finals.length > 1 ? "_" + (i + 1) : ""}.jpg`);
            sizes.push(formatKilobytes(res.blob.size) + " KB");
            await new Promise((r) => setTimeout(r, 350));
          }
          out.className = "tool-out ok";
          out.textContent = `Saved ${finals.length} JPG${finals.length > 1 ? "s" : ""}: ${sizes.join(", ")}.`;
        }
      } catch (err) {
        out.className = "tool-out err";
        out.textContent = "Failed: " + err.message;
      } finally {
        btn.disabled = false;
      }
    };
  }

  /* ================================================================
     2. FIX FROM ERROR MESSAGE
     ================================================================ */
  const NUM = "(\\d+(?:\\.\\d+)?)";
  const SIZE_UNIT = "(kb|k\\.b\\.?|kbs|kilo\\s?bytes?|mb|m\\.b\\.?|mbs|mega\\s?bytes?)";
  const toKB = (n, unit) => /^m/i.test(unit || "") ? parseFloat(n) * 1024 : parseFloat(n);

  /**
   * Pulls upload requirements out of a rejection / instruction message.
   * Returns { minKB, maxKB, width, height, format, docType, dpi, notes[] }
   * with only the fields that were found.
   */
  function parseRequirements(raw) {
    const text = " " + String(raw || "").toLowerCase().replace(/[“”"']/g, " ").replace(/,(?=\d{3}\b)/g, "").replace(/\s+/g, " ") + " ";
    const req = { notes: [] };
    const taken = [];
    const overlaps = (a, b) => taken.some(([s, e]) => a < e && b > s);

    // --- KB ranges: "20 kb to 50 kb", "20-50kb", "between 10 and 20 KB"
    const rangeRe = new RegExp(`${NUM}\\s*${SIZE_UNIT}?\\s*(?:-|–|—|&|to|and|upto|up to)\\s*${NUM}\\s*${SIZE_UNIT}`, "gi");
    let m;
    const mins = [], maxs = [];
    while ((m = rangeRe.exec(text))) {
      const a = toKB(m[1], m[2] || m[4]), b = toKB(m[3], m[4]);
      if (a > 0 && b > 0) { mins.push(Math.min(a, b)); maxs.push(Math.max(a, b)); taken.push([m.index, m.index + m[0].length]); }
    }

    // --- single sizes with a cue before them
    const singleRe = new RegExp(`${NUM}\\s*${SIZE_UNIT}\\b`, "gi");
    const cued = [], uncued = [];
    while ((m = singleRe.exec(text))) {
      if (overlaps(m.index, m.index + m[0].length)) continue;
      const kb = toKB(m[1], m[2]);
      const before = text.slice(Math.max(0, m.index - 48), m.index);
      const clause = before.split(/[.;]|\bbut\b/).pop();
      if (/\b(your|uploaded|current|actual|selected)\b[^.]{0,25}$/.test(clause) && !/(should|must|allowed|limit|max|min)/.test(clause)) continue; // the user's own file size
      const requirement = /(should|must|need|required|has to|have to|allowed|accepted|permitted|acceptable|expected)/.test(clause);
      const negated = /\b(not|n't|cannot|can't)\b[^.]{0,20}$/.test(clause);
      let kind = null;
      if (/(minimum|\bmin\b|at least|atleast|not less than|no less than|smaller than the minimum)\s*(file\s*)?(size)?\s*(of|is|:|-|should be|must be|be)?\s*$/.test(clause)) kind = "min";
      else if (/(maximum|\bmax\b|up to|upto|within|limit|not exceed|exceed(s|ing|ed)?|not more than|no more than|not greater than|not larger than)\s*(file\s*)?(size)?\s*(of|is|:|-|should be|must be|be|the)?\s*(limit\s*(of)?)?\s*$/.test(clause)) kind = "max";
      else if (/(less than|lesser than|below|under|smaller than|lower than)\s*$/.test(clause)) kind = negated ? "min" : (requirement ? "max" : "min");
      else if (/(more than|greater than|above|over|larger than|bigger than|higher than)\s*$/.test(clause)) kind = negated ? "max" : (requirement ? "min" : "max");
      if (kind === "min") cued.push(["min", kb]);
      else if (kind === "max") cued.push(["max", kb]);
      else uncued.push(kb);
    }
    cued.forEach(([k, v]) => (k === "min" ? mins : maxs).push(v));
    if (!cued.length && !mins.length && uncued.length) {
      if (/(too small|smaller|less than the minimum|below the minimum|minimum)/.test(text)) mins.push(Math.max(...uncued));
      else maxs.push(Math.min(...uncued));
    }
    if (mins.length) req.minKB = Math.max(...mins);
    if (maxs.length) req.maxKB = Math.min(...maxs);
    if (req.minKB && req.maxKB && req.minKB > req.maxKB) [req.minKB, req.maxKB] = [req.maxKB, req.minKB];

    // --- DPI
    const dpiM = text.match(/(\d{2,4})\s*(dpi|ppi)\b/);
    if (dpiM) req.dpi = parseInt(dpiM[1], 10);

    // --- pixel sizes
    const swapHint = /\(\s*h(eight)?\s*[x×*]\s*w(idth)?\s*\)|height\s*[x×*]\s*width/.test(text);
    const pxRe = /(\d{2,4})\s*(?:px|pixels?)?\s*(?:\([^)]{0,14}\))?\s*(?:x|×|\*|by)\s*(\d{2,4})\s*(px|pixels?|pixel)?(?!\s*(?:cm|mm|inch|in\b))/g;
    while ((m = pxRe.exec(text))) {
      const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
      const hasPx = !!m[3] || /px|pixel/.test(text.slice(m.index, m.index + m[0].length + 10));
      if (!hasPx && (a < 40 || b < 40)) continue;
      [req.width, req.height] = swapHint ? [b, a] : [a, b];
      break;
    }
    if (!req.width) {
      const wm = text.match(/width\s*(?:of|:|=|-|should be|must be|is|be)?\s*(\d{2,4})\s*(?:px|pixels?)?/);
      const hm = text.match(/height\s*(?:of|:|=|-|should be|must be|is|be)?\s*(\d{2,4})\s*(?:px|pixels?)?/);
      if (wm && hm) { req.width = parseInt(wm[1], 10); req.height = parseInt(hm[1], 10); }
    }
    // --- physical sizes (cm / mm / inch) → pixels
    if (!req.width) {
      const cmRe = /(\d+(?:\.\d+)?)\s*(cm|mm|inch(?:es)?|in\b)?\s*(?:\([^)]{0,14}\))?\s*(?:x|×|\*|by)\s*(\d+(?:\.\d+)?)\s*(cm|mm|inch(?:es)?|in\b)/;
      const cm = text.match(cmRe);
      if (cm) {
        const unit = cm[4];
        const toIn = unit === "mm" ? 1 / 25.4 : unit === "cm" ? 1 / 2.54 : 1;
        const dpi = req.dpi || 200;
        let a = Math.round(parseFloat(cm[1]) * toIn * dpi), b = Math.round(parseFloat(cm[3]) * toIn * dpi);
        if (swapHint) [a, b] = [b, a];
        req.width = a; req.height = b;
        req.notes.push(`${cm[1]} × ${cm[3]} ${unit} converted at ${dpi} DPI`);
      }
    }
    if (req.width && (req.width > 6000 || req.height > 6000)) { delete req.width; delete req.height; }

    // --- format
    const fmtCue = text.match(/(?:only|format\s*(?:should be|must be|is|:|-)?|in|as a?|upload)\s*\.?(jpe?g|pdf|png)\b|\b(jpe?g|pdf|png)\s*(?:format|only|file|files)\b/);
    if (fmtCue) req.format = /pdf/.test(fmtCue[1] || fmtCue[2]) ? "pdf" : /png/.test(fmtCue[1] || fmtCue[2]) ? "png" : "jpg";
    else if (/\bjpe?g\b/.test(text)) req.format = "jpg";
    else if (/\bpdf\b/.test(text)) req.format = "pdf";

    // --- document type
    if (/signature|\bsign\b|signed/.test(text)) req.docType = "signature";
    else if (/thumb/.test(text)) req.docType = "thumb";
    else if (/photo|photograph|picture|selfie|face/.test(text)) req.docType = "photo";
    else if (/certificate|marksheet|mark sheet|document|aadhaa?r|caste|domicile|\bews\b|income|proof|\bid\b|pdf/.test(text)) req.docType = "document";

    return req;
  }

  const DOC_TYPES = { photo: "Photo", signature: "Signature", thumb: "Thumb impression", document: "Document / certificate" };

  function summarise(req) {
    const items = [];
    if (req.minKB && req.maxKB) items.push(`${fmtKB(req.minKB)}–${fmtKB(req.maxKB)}`);
    else if (req.maxKB) items.push(`max ${fmtKB(req.maxKB)}`);
    else if (req.minKB) items.push(`min ${fmtKB(req.minKB)}`);
    if (req.width) items.push(`${req.width}×${req.height} px`);
    if (req.format) items.push(req.format.toUpperCase());
    if (req.docType) items.push(DOC_TYPES[req.docType]);
    return items;
  }
  function fmtKB(kb) { return kb >= 1024 && kb % 1024 === 0 ? kb / 1024 + " MB" : Math.round(kb * 10) / 10 + " KB"; }

  let aiPromise = null;
  function loadUploadAI() {
    if (window.UploadSureAI) return Promise.resolve(window.UploadSureAI);
    if (!aiPromise) aiPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "js/upload-ai-checks.js";
      s.onload = () => resolve(window.UploadSureAI);
      s.onerror = () => { aiPromise = null; reject(new Error("Could not load the clean-up tool")); };
      document.head.appendChild(s);
    });
    return aiPromise;
  }

  /** Renders the "fix it here" panel into `container` (prepends). Returns false if nothing parsed. */
  function mountSpecFixer(container, messageText) {
    const req = parseRequirements(messageText);
    const found = summarise(req);
    const hasSpec = req.minKB || req.maxKB || req.width || req.format;
    if (!hasSpec) return false;

    const box = document.createElement("div");
    box.className = "spec-fixer";
    box.innerHTML = `
      <span class="fix-badge">Fix it right here</span>
      <h3>We read these requirements from your message</h3>
      <div class="spec-found">${found.map((f) => `<span class="spec-chip">${esc(f)}</span>`).join("")}</div>
      ${req.notes.length ? `<p class="spec-note">${req.notes.map(esc).join(" · ")}</p>` : ""}
      <div class="spec-fields">
        <label>File type<select data-f="docType">${Object.entries(DOC_TYPES).map(([k, v]) => `<option value="${k}"${(req.docType || "photo") === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>
        <label>Min KB<input type="number" min="0" step="1" data-f="minKB" value="${req.minKB ? Math.round(req.minKB * 10) / 10 : ""}" placeholder="none"></label>
        <label>Max KB<input type="number" min="1" step="1" data-f="maxKB" value="${req.maxKB ? Math.round(req.maxKB * 10) / 10 : ""}" placeholder="none"></label>
        <label>Width px<input type="number" min="10" step="1" data-f="width" value="${req.width || ""}" placeholder="keep"></label>
        <label>Height px<input type="number" min="10" step="1" data-f="height" value="${req.height || ""}" placeholder="keep"></label>
        <label>Save as<select data-f="format"><option value="jpg"${req.format !== "pdf" ? " selected" : ""}>JPG</option><option value="pdf"${req.format === "pdf" ? " selected" : ""}>PDF</option></select></label>
      </div>
      <label class="ai-opt spec-clean" hidden><input type="checkbox" checked>
        <span><b>Clean up paper &amp; shadows</b> — pure white background, darker ink.</span></label>
      <p class="spec-hint">Check the numbers above — edit any we got wrong — then drop the file the portal rejected.</p>
      <p class="spec-hint spec-scan-tip" hidden>Phone photo of a document? <a href="ai-tools.html#t-doc-scan">Scan it in the Document Scanner first</a> — it straightens the page and removes the table and shadows — then drop the scan here.</p>
      <label class="mini-drop">Drop or choose the rejected file<input type="file" accept="image/*,application/pdf"></label>
      <div class="spec-out"></div>`;
    container.prepend(box);

    const field = (f) => box.querySelector(`[data-f="${f}"]`);
    const cleanRow = box.querySelector(".spec-clean");
    const scanTip = box.querySelector(".spec-scan-tip");
    const syncClean = () => {
      cleanRow.hidden = !["signature", "thumb"].includes(field("docType").value);
      scanTip.hidden = field("docType").value !== "document";
    };
    field("docType").addEventListener("change", syncClean);
    syncClean();

    const out = box.querySelector(".spec-out");
    let lastFile = null;
    box.querySelectorAll("input[data-f], select[data-f], .spec-clean input").forEach((el) =>
      el.addEventListener("change", () => { if (lastFile) run(lastFile); }));

    const readSpec = () => {
      const num = (f) => { const v = parseFloat(field(f).value); return isFinite(v) && v > 0 ? v : null; };
      const spec = { docType: field("docType").value, minKB: num("minKB"), maxKB: num("maxKB"), width: num("width"), height: num("height"), format: field("format").value };
      if (!(spec.width && spec.height)) spec.width = spec.height = null;
      if (spec.minKB && spec.maxKB && spec.minKB > spec.maxKB) [spec.minKB, spec.maxKB] = [spec.maxKB, spec.minKB];
      return spec;
    };

    async function run(file) {
      lastFile = file;
      const spec = readSpec();
      out.className = "spec-out tool-out";
      out.textContent = "Fixing…";
      try {
        if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return pdfInput(file, spec);
        const image = await loadImageFromFile(file);
        let canvas;
        const clean = !cleanRow.hidden && cleanRow.querySelector("input").checked;
        let cleanedNote = "";
        if (clean) {
          const AI = await loadUploadAI();
          const res = AI.cleanSignatureImage(image, { aspect: spec.width ? spec.width / spec.height : null });
          if (!res.noInk) { canvas = res.canvas; cleanedNote = `paper & shadows removed · ${res.ink} ink`; }
          else cleanedNote = "no clear ink found — used your photo as is";
        }
        if (!canvas) canvas = imageToCanvas(image, spec.width ? 4000 : 2500);
        if (spec.width) {
          if (spec.docType === "document") {
            const c = makeCanvas(spec.width, spec.height);
            const ctx = c.getContext("2d");
            ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
            const k = Math.min(spec.width / canvas.width, spec.height / canvas.height);
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(canvas, (spec.width - canvas.width * k) / 2, (spec.height - canvas.height * k) / 2, canvas.width * k, canvas.height * k);
            canvas = c;
          } else {
            canvas = coverCropToCanvas(canvas, spec.width, spec.height);
          }
        }

        let blob, finalW = canvas.width, finalH = canvas.height, resized = false;
        if (spec.format === "pdf") {
          blob = await pdfFromCanvases([canvas], { maxKB: spec.maxKB, pageSize: spec.docType === "document" ? "a4" : "fit" });
        } else {
          const res = await encodeInBand(canvas, { minKB: spec.minKB, maxKB: spec.maxKB, allowResize: !spec.width });
          blob = res.blob; finalW = res.canvas.width; finalH = res.canvas.height; resized = res.resized;
        }
        const okMin = !spec.minKB || blob.size >= spec.minKB * KB;
        const okMax = !spec.maxKB || blob.size <= spec.maxKB * 1000;
        const checks = [
          { ok: true, label: "Format", value: spec.format.toUpperCase() },
          { ok: !spec.width || (finalW === spec.width && finalH === spec.height), label: "Dimensions", value: `${finalW}×${finalH}px${spec.width ? "" : resized ? " (scaled down to fit the KB limit)" : " (kept)"}` },
          { ok: okMin && okMax, label: "File size", value: `${formatKilobytes(blob.size)} KB${spec.minKB || spec.maxKB ? ` vs ${spec.minKB ? fmtKB(spec.minKB) : "0"}–${spec.maxKB ? fmtKB(spec.maxKB) : "any"}` : ""}` },
        ];
        if (cleanedNote) checks.push({ ok: !/no clear ink/.test(cleanedNote), label: "Clean-up", value: cleanedNote });
        const allOk = checks.every((c) => c.ok);
        const base = (file.name.replace(/\.[^.]+$/, "") || "file").replace(/[^\w-]+/g, "_").slice(0, 40);
        const name = `${base}_fixed${spec.width ? `_${spec.width}x${spec.height}` : ""}.${spec.format}`;
        const preview = spec.format === "jpg" ? `<img src="${URL.createObjectURL(blob)}" alt="fixed file">` : `<div class="spec-pdf-ic">PDF</div>`;
        out.className = "spec-out";
        out.innerHTML = `
          <div class="rfg-summary ${allOk ? "rfg-pass" : "rfg-warn"}"><div class="rfg-content"><strong class="rfg-title">${allOk ? "Fixed — matches the requirements" : "Check the flagged item"}</strong></div></div>
          <div class="preview">
            <div class="preview-thumb">${preview}</div>
            <ul class="checklist">${checks.map((c) => `<li class="check ${c.ok ? "ok" : "warn"}"><span class="ic">${c.ok ? checkmarkIcon() : warningIcon()}</span><span><span class="lbl">${esc(c.label)}</span> — <span class="val">${esc(c.value)}</span></span></li>`).join("")}</ul>
          </div>
          <div class="act-row"><button class="btn primary dl">Download ${spec.format.toUpperCase()}</button><span class="note-inline">${esc(name)}</span></div>`;
        out.querySelector(".dl").onclick = () => {
          triggerDownload(blob, name);
          showToast("Downloaded — upload this one");
          if (typeof gtag === "function") gtag("event", "fix_from_message_download", { type: spec.docType, format: spec.format });
        };
      } catch (err) {
        out.className = "spec-out tool-out err";
        out.textContent = "Couldn't fix that file: " + err.message;
      }
    }

    function pdfInput(file, spec) {
      const within = (!spec.maxKB || file.size <= spec.maxKB * 1000) && (!spec.minKB || file.size >= spec.minKB * KB);
      out.className = "spec-out tool-out" + (within ? " ok" : "");
      if (spec.format === "jpg") {
        out.innerHTML = `This is a PDF but the portal wants JPG. <a href="pdf-tools.html#t-pdf2jpg">Convert PDF to JPG →</a> then drop the JPG here.`;
      } else if (within) {
        out.textContent = `Your PDF is ${formatKilobytes(file.size)} KB — already within the limit. If the portal still rejects it, re-save it from a scan using the Document Scanner.`;
      } else {
        out.innerHTML = `Your PDF is ${formatKilobytes(file.size)} KB${spec.maxKB ? `, over the ${fmtKB(spec.maxKB)} limit` : ""}. <a href="pdf-tools.html#t-pdfcompress">Compress it in PDF Tools →</a> ${spec.maxKB ? `(aim for about ${Math.floor(spec.maxKB * 0.95)} KB)` : ""} — or, for a phone photo of a document, use the <a href="ai-tools.html#t-doc-scan">Document Scanner</a>, which saves straight to a KB limit.`;
      }
    }

    bindDropZone(box.querySelector(".mini-drop"), box.querySelector('.mini-drop input[type="file"]'), run);
    return true;
  }

  window.UploadSureDocs = {
    parseRequirements,
    mountSpecFixer,
    detectDocumentQuad,
    warpQuad,
    enhanceScan,
    buildPdf,
    pdfFromCanvases,
    encodeInBand,
    initDocScannerTool,
  };
})();
