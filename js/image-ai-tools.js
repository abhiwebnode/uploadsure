/*
  image-ai-tools.js
  -------------------
  Tools powered by on-device AI and OpenCV.
*/

/* ── CDN URLs ────────────────────────────────────────────────────── */
const ORT_CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.min.js";
const U2NET_URL = "https://huggingface.co/Heliosoph/u2net-onnx/resolve/main/u2netp.onnx";
const ULTRAFACE_URL = "https://cdn.jsdelivr.net/gh/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB@master/models/onnx/version-RFB-640.onnx";
const OPENCV_CDN = "https://docs.opencv.org/4.x/opencv.js";

/* ── Shared cache ──────────────────────────────────────────── */
let ortLoaded = false;
let u2netSession = null;
let ultrafaceSession = null;

async function ensureOrt() {
  if (ortLoaded) return;
  await new Promise((resolve, reject) => {
    if (typeof ort !== "undefined") { ortLoaded = true; resolve(); return; }
    const s = document.createElement("script");
    s.src = ORT_CDN;
    s.onload = () => { ortLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Could not load ONNX Runtime."));
    document.head.appendChild(s);
  });
}

async function ensureOpenCV(statusEl) {
  if (window.cv && window.cv.Mat) return;
  // Load silently

  await new Promise((resolve, reject) => {
    // Must define Module hook BEFORE attaching script tag to prevent initialization race conditions
    window.Module = {
      onRuntimeInitialized: () => {
        if (statusEl) statusEl.textContent = "";
        resolve();
      }
    };

    const s = document.createElement("script");
    s.src = OPENCV_CDN;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load OpenCV engine — check your network connection."));
    document.head.appendChild(s);
  });
}

async function loadModel(url, statusEl, label) {
  await ensureOrt();
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Could not fetch model: ${resp.status}`);
  const reader = resp.body.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const buffer = await new Blob(chunks).arrayBuffer();
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/`;
  const session = await ort.InferenceSession.create(buffer, { executionProviders: ["wasm"] });
  return session;
}

async function getU2Net(statusEl) {
  if (!u2netSession) u2netSession = await loadModel(U2NET_URL, statusEl, "U²-Net model (4.7 MB)");
  return u2netSession;
}

async function getUltraface(statusEl) {
  if (!ultrafaceSession) ultrafaceSession = await loadModel(ULTRAFACE_URL, statusEl, "Face detector (1.2 MB)");
  return ultrafaceSession;
}

/* ── U²-Net & Ultraface Helpers ─────────────────────────────────────────────── */
function u2netPreprocess(canvas) {
  const MEAN = [0.485, 0.456, 0.406];
  const STD  = [0.229, 0.224, 0.225];
  const tmp = document.createElement("canvas");
  tmp.width = tmp.height = 320;
  tmp.getContext("2d").drawImage(canvas, 0, 0, 320, 320);
  const pixels = tmp.getContext("2d").getImageData(0, 0, 320, 320).data;
  const input = new Float32Array(3 * 320 * 320);
  for (let i = 0; i < 320 * 320; i++) {
    input[i]               = (pixels[i * 4]     / 255 - MEAN[0]) / STD[0]; 
    input[i + 320 * 320]   = (pixels[i * 4 + 1] / 255 - MEAN[1]) / STD[1]; 
    input[i + 2 * 320 * 320] = (pixels[i * 4 + 2] / 255 - MEAN[2]) / STD[2]; 
  }
  return new ort.Tensor("float32", input, [1, 3, 320, 320]);
}

function u2netMask(outputData) {
  const d0 = Array.from(outputData);
  const min = Math.min(...d0), max = Math.max(...d0);
  return d0.map(v => (v - min) / (max - min + 1e-8));
}

function applyMaskToCanvas(srcCanvas, mask, threshold = 0.5) {
  const { width: W, height: H } = srcCanvas;
  const out = document.createElement("canvas");
  out.width = W; out.height = H;
  const ctx = out.getContext("2d");
  ctx.drawImage(srcCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mx = x / W * 319, my = y / H * 319;
      const x0 = Math.floor(mx), y0 = Math.floor(my);
      const x1 = Math.min(x0 + 1, 319), y1 = Math.min(y0 + 1, 319);
      const fx = mx - x0, fy = my - y0;
      const v = mask[y0 * 320 + x0] * (1 - fx) * (1 - fy)
              + mask[y0 * 320 + x1] * fx * (1 - fy)
              + mask[y1 * 320 + x0] * (1 - fx) * fy
              + mask[y1 * 320 + x1] * fx * fy;
      imgData.data[(y * W + x) * 4 + 3] = Math.round(Math.min(1, v / threshold) * 255);
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return out;
}

async function runU2Net(session, srcCanvas) {
  const tensor = u2netPreprocess(srcCanvas);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  const mask = u2netMask(results[session.outputNames[0]].data);
  return applyMaskToCanvas(srcCanvas, mask);
}

async function detectFaces(session, srcCanvas) {
  const W = srcCanvas.width, H = srcCanvas.height;
  const INPUT_W = 640, INPUT_H = 480;
  const tmp = document.createElement("canvas");
  tmp.width = INPUT_W; tmp.height = INPUT_H;
  tmp.getContext("2d").drawImage(srcCanvas, 0, 0, INPUT_W, INPUT_H);
  const pixels = tmp.getContext("2d").getImageData(0, 0, INPUT_W, INPUT_H).data;
  const input = new Float32Array(3 * INPUT_W * INPUT_H);
  const MEAN = 127, NORM = 128;
  for (let i = 0; i < INPUT_W * INPUT_H; i++) {
    input[i]                       = (pixels[i * 4]     - MEAN) / NORM;
    input[i + INPUT_W * INPUT_H]   = (pixels[i * 4 + 1] - MEAN) / NORM;
    input[i + 2 * INPUT_W * INPUT_H] = (pixels[i * 4 + 2] - MEAN) / NORM;
  }
  const tensor = new ort.Tensor("float32", input, [1, 3, INPUT_H, INPUT_W]);
  const results = await session.run({ [session.inputNames[0]]: tensor });
  const scores = results[session.outputNames[0]].data;
  const boxes  = results[session.outputNames[1]].data;
  const N = scores.length / 2;
  const CONF_THRESH = 0.7, IOU_THRESH = 0.3;
  const faces = [];
  for (let i = 0; i < N; i++) {
    const conf = scores[i * 2 + 1];
    if (conf < CONF_THRESH) continue;
    faces.push({
      score: conf,
      x1: boxes[i * 4]     * W,
      y1: boxes[i * 4 + 1] * H,
      x2: boxes[i * 4 + 2] * W,
      y2: boxes[i * 4 + 3] * H,
    });
  }
  return nms(faces, IOU_THRESH);
}

function nms(boxes, iouThresh) {
  boxes.sort((a, b) => b.score - a.score);
  const keep = [];
  const suppressed = new Set();
  for (let i = 0; i < boxes.length; i++) {
    if (suppressed.has(i)) continue;
    keep.push(boxes[i]);
    for (let j = i + 1; j < boxes.length; j++) {
      if (iou(boxes[i], boxes[j]) > iouThresh) suppressed.add(j);
    }
  }
  return keep;
}

function iou(a, b) {
  const ix1 = Math.max(a.x1, b.x1), iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2), iy2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
  const ua = (a.x2-a.x1)*(a.y2-a.y1) + (b.x2-b.x1)*(b.y2-b.y1) - inter;
  return inter / (ua + 1e-8);
}

function blurRegion(ctx, x1, y1, x2, y2, radius) {
  x1 = Math.max(0, Math.floor(x1));
  y1 = Math.max(0, Math.floor(y1));
  x2 = Math.min(ctx.canvas.width,  Math.ceil(x2));
  y2 = Math.min(ctx.canvas.height, Math.ceil(y2));
  if (x2 <= x1 || y2 <= y1) return;
  ctx.save();
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(ctx.canvas, x1, y1, x2-x1, y2-y1, x1, y1, x2-x1, y2-y1);
  ctx.restore();
}

/* ================================================================
   1. BACKGROUND REMOVER
   ================================================================ */
function initAiBgRemoverTool() {
  const outputEl = document.getElementById("aiBgOut");
  const statusEl = document.getElementById("aiBgStatus");

  bindDropZone(document.getElementById("aiBgDrop"), document.getElementById("aiBgFile"), async (file) => {
    outputEl.className = "tool-out";
    outputEl.innerHTML = "";
    statusEl.textContent = "";
    try {
      const session = await getU2Net(statusEl);
      const image = await loadImageFromFile(file);
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = image.width; srcCanvas.height = image.height;
      srcCanvas.getContext("2d").drawImage(image, 0, 0);

      statusEl.textContent = "Removing background…";
      const resultCanvas = await runU2Net(session, srcCanvas);
      statusEl.textContent = "";

      const blob = await canvasToBlob(resultCanvas, "image/png");
      const previewUrl = URL.createObjectURL(blob);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px";
      const makeThumb = (src, label, bg) => {
        const wrap = document.createElement("div");
        wrap.style.cssText = `position:relative;width:120px;height:120px;border-radius:var(--radius-sm);border:1px solid var(--border);overflow:hidden;background:${bg}`;
        const img = document.createElement("img");
        img.src = src; img.style.cssText = "width:100%;height:100%;object-fit:contain";
        const cap = document.createElement("span");
        cap.style.cssText = "position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.45);color:#fff;font-size:9px;text-align:center;padding:2px";
        cap.textContent = label;
        wrap.appendChild(img); wrap.appendChild(cap);
        return wrap;
      };
      row.appendChild(makeThumb(URL.createObjectURL(file), "Original", "var(--surface-2)"));
      row.appendChild(makeThumb(previewUrl, "Background removed", "repeating-conic-gradient(#ccc 0% 25%,#fff 0% 50%) 0 0/14px 14px"));
      outputEl.appendChild(row);
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn primary sm";
      dlBtn.textContent = "Download PNG";
      dlBtn.onclick = () => triggerDownload(blob, file.name.replace(/\.\w+$/, "") + "_nobg.png");
      outputEl.appendChild(dlBtn);
    } catch (err) {
      statusEl.textContent = "";
      outputEl.className = "tool-out err";
      outputEl.textContent = `Failed: ${err.message}`;
    }
  });
}

/* ================================================================
   2. FACE BLUR & PHOTO ANONYMIZER
   ================================================================ */
function initFaceBlurAiTool() {
  const outputEl = document.getElementById("faceBlurAiOut");
  const statusEl = document.getElementById("faceBlurAiStatus");

  bindDropZone(document.getElementById("faceBlurAiDrop"), document.getElementById("faceBlurAiFile"), async (file) => {
    outputEl.className = "tool-out";
    outputEl.innerHTML = "";
    statusEl.textContent = "";
    try {
      const session = await getUltraface(statusEl);
      const image = await loadImageFromFile(file);
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      statusEl.textContent = "Detecting faces…";
      const faces = await detectFaces(session, canvas);
      statusEl.textContent = "";

      if (!faces.length) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "No faces detected. Try a clearer photo with visible faces.";
        return;
      }

      const blurRadius = +document.getElementById("faceBlurRadius").value || 18;
      faces.forEach(f => {
        const pad = (f.x2 - f.x1) * 0.08;
        blurRegion(ctx, f.x1 - pad, f.y1 - pad, f.x2 + pad, f.y2 + pad, blurRadius);
        blurRegion(ctx, f.x1 - pad, f.y1 - pad, f.x2 + pad, f.y2 + pad, blurRadius * 0.6);
      });

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.93);
      const previewUrl = URL.createObjectURL(blob);

      outputEl.className = "tool-out ok";
      const previewImg = document.createElement("img");
      previewImg.src = previewUrl;
      previewImg.style.cssText = "max-width:100%;max-height:260px;border:1px solid var(--border);border-radius:var(--radius-sm);display:block;margin-bottom:10px";
      const info = document.createElement("p");
      info.style.cssText = "margin:0 0 10px;font-size:13px;color:var(--text-muted)";
      info.textContent = `${faces.length} face${faces.length > 1 ? "s" : ""} detected and blurred.`;
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn primary sm";
      dlBtn.textContent = "Download";
      dlBtn.onclick = () => triggerDownload(blob, file.name.replace(/\.\w+$/, "") + "_blurred.jpg");
      outputEl.appendChild(previewImg);
      outputEl.appendChild(info);
      outputEl.appendChild(dlBtn);
    } catch (err) {
      statusEl.textContent = "";
      outputEl.className = "tool-out err";
      outputEl.textContent = `Failed: ${err.message}`;
    }
  });
}

/* ================================================================
   3. PASSPORT & ID PHOTO MAKER (With Drag & Pan)
   ================================================================ */
const PASSPORT_SPECS = [
  { label: "India (51×51 mm)",           w: 600,  h: 600,  bg: "#ffffff" },
  { label: "US Passport (2×2 in)",        w: 600,  h: 600,  bg: "#ffffff" },
  { label: "UK (35×45 mm)",               w: 413,  h: 531,  bg: "#ffffff" },
  { label: "Schengen / EU (35×45 mm)",    w: 413,  h: 531,  bg: "#ffffff" },
  { label: "Canada (50×70 mm)",           w: 591,  h: 827,  bg: "#ffffff" },
  { label: "Australia (35×45 mm)",        w: 413,  h: 531,  bg: "#ffffff" },
  { label: "China (33×48 mm)",            w: 390,  h: 567,  bg: "#ffffff" },
  { label: "Japan (35×45 mm)",            w: 413,  h: 531,  bg: "#ffffff" },
];

function initPassportPhotoTool() {
  const outputEl  = document.getElementById("passportOut");
  const statusEl  = document.getElementById("passportStatus");
  const specSel   = document.getElementById("passportSpec");
  const bgColorEl = document.getElementById("passportBg");
  
  let activeCutoutCanvas = null;
  let panX = 0, panY = 0;
  let isDragging = false, dragStartX = 0, dragStartY = 0;
  
  PASSPORT_SPECS.forEach((s, i) => {
    const opt = document.createElement("option");
    opt.value = i; opt.textContent = s.label;
    specSel.appendChild(opt);
  });

  const renderComposite = () => {
    if (!activeCutoutCanvas) return;
    const spec = PASSPORT_SPECS[+specSel.value];
    const bgColor = bgColorEl.value || spec.bg;

    // Reset layout elements
    outputEl.innerHTML = "";
    outputEl.className = "tool-out ok";

    // Setup interactive canvas container
    const canvasWrap = document.createElement("div");
    canvasWrap.style.cssText = "position:relative;display:inline-block;margin-bottom:10px;";
    
    const previewCanvas = document.createElement("canvas");
    previewCanvas.width = spec.w; 
    previewCanvas.height = spec.h;
    // Visually scale the canvas in UI
    const displayHeight = 240; 
    const displayWidth = Math.round(spec.w / spec.h * displayHeight);
    previewCanvas.style.cssText = `height:${displayHeight}px;width:${displayWidth}px;border:1px solid var(--border);border-radius:var(--radius-sm);display:block;cursor:grab;touch-action:none;`;
    
    // Scale for panning movement relative to display size
    const moveRatio = spec.h / displayHeight; 

    const ctx = previewCanvas.getContext("2d");

    const draw = () => {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, spec.w, spec.h);
      const scale = Math.max(spec.w / activeCutoutCanvas.width, spec.h / activeCutoutCanvas.height);
      const drawW = activeCutoutCanvas.width * scale;
      const drawH = activeCutoutCanvas.height * scale;
      
      const baseX = (spec.w - drawW) / 2;
      const baseY = spec.h - drawH; // Align bottom natively
      
      ctx.drawImage(activeCutoutCanvas, baseX + panX, baseY + panY, drawW, drawH);
    };

    draw(); // Initial draw

    // Setup Drag Events
    const startDrag = (x, y) => {
      isDragging = true;
      dragStartX = x;
      dragStartY = y;
      previewCanvas.style.cursor = "grabbing";
    };
    const moveDrag = (x, y) => {
      if (!isDragging) return;
      const dx = (x - dragStartX) * moveRatio;
      const dy = (y - dragStartY) * moveRatio;
      panX += dx;
      panY += dy;
      dragStartX = x;
      dragStartY = y;
      draw();
    };
    const endDrag = () => {
      isDragging = false;
      previewCanvas.style.cursor = "grab";
    };

    previewCanvas.addEventListener("mousedown", e => startDrag(e.clientX, e.clientY));
    window.addEventListener("mousemove", e => moveDrag(e.clientX, e.clientY));
    window.addEventListener("mouseup", endDrag);

    // Touch support
    previewCanvas.addEventListener("touchstart", e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
    window.addEventListener("touchmove", e => { if (isDragging) moveDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive: false});
    window.addEventListener("touchend", endDrag);

    const info = document.createElement("p");
    info.style.cssText = "margin:0 0 10px;font-size:13px;color:var(--text-muted)";
    info.textContent = `Drag to adjust alignment. ${spec.label} — ${spec.w}×${spec.h}px`;
    
    const dlBtn = document.createElement("button");
    dlBtn.className = "btn primary sm";
    dlBtn.textContent = "Download JPEG";
    dlBtn.onclick = async () => {
      const blob = await canvasToBlob(previewCanvas, "image/jpeg", 0.95);
      triggerDownload(blob, "passport-photo.jpg");
    };

    canvasWrap.appendChild(previewCanvas);
    outputEl.appendChild(canvasWrap);
    outputEl.appendChild(info);
    outputEl.appendChild(dlBtn);
  };

  specSel.addEventListener("change", () => { panX = 0; panY = 0; renderComposite(); });
  bgColorEl.addEventListener("input", renderComposite);

  bindDropZone(document.getElementById("passportDrop"), document.getElementById("passportFile"), async (file) => {
    outputEl.className = "tool-out";
    outputEl.innerHTML = "";
    statusEl.textContent = "";
    try {
      const session = await getU2Net(statusEl);
      const image = await loadImageFromFile(file);
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = image.width; srcCanvas.height = image.height;
      srcCanvas.getContext("2d").drawImage(image, 0, 0);

      statusEl.textContent = "Removing background…";
      activeCutoutCanvas = await runU2Net(session, srcCanvas);
      statusEl.textContent = "";
      panX = 0; panY = 0; // Reset pan on new image

      renderComposite();
    } catch (err) {
      statusEl.textContent = "";
      outputEl.className = "tool-out err";
      outputEl.textContent = `Failed: ${err.message}`;
    }
  });
}

/* ================================================================
   4. AI OBJECT REMOVER (OpenCV Telea Inpainting)
   ================================================================ */
function initObjectRemoverTool() {
  const outputEl = document.getElementById("objRemoveOut");
  let srcCanvas = null;
  let maskCanvas = null;
  let painting = false;
  let brushSize = 24;

  const mainCanvas  = document.getElementById("objRemoveCanvas");
  const mainCtx     = mainCanvas.getContext("2d");
  const brushSizeEl = document.getElementById("objBrushSize");
  const brushValEl  = document.getElementById("objBrushVal");

  if (brushSizeEl) {
    brushSizeEl.addEventListener("input", () => {
      brushSize = +brushSizeEl.value;
      if (brushValEl) brushValEl.textContent = brushSize + "px";
    });
  }

  const clearBtn = document.getElementById("objRemoveClear");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (!maskCanvas) return;
      maskCanvas.getContext("2d").clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      renderComposite();
    };
  }

  const fillBtn = document.getElementById("objRemoveFill");
  if (fillBtn) {
    fillBtn.onclick = async () => {
      if (!srcCanvas || !maskCanvas) return;
      outputEl.className = "tool-out";
      outputEl.textContent = "Initializing removal engine…";
      
      try {
        await ensureOpenCV(outputEl);
        outputEl.textContent = "Removing object…";
        
        // Yield execution to allow DOM to refresh processing text
        await new Promise(r => setTimeout(r, 40)); 
        
        const W = srcCanvas.width;
        const H = srcCanvas.height;

        // Extract raw ImageData buffers
        const srcCtx = srcCanvas.getContext("2d");
        const maskCtx = maskCanvas.getContext("2d");
        const srcImgData = srcCtx.getImageData(0, 0, W, H);
        const maskImgData = maskCtx.getImageData(0, 0, W, H);

        // Convert ImageData to OpenCV Mat memory space
        let srcRGBA = cv.matFromImageData(srcImgData);
        let maskRGBA = cv.matFromImageData(maskImgData);

        // Convert source to 3-channel RGB (CV_8UC3)
        let srcRGB = new cv.Mat();
        cv.cvtColor(srcRGBA, srcRGB, cv.COLOR_RGBA2RGB);

        // Convert mask to Grayscale (CV_8UC1)
        let maskGray = new cv.Mat();
        cv.cvtColor(maskRGBA, maskGray, cv.COLOR_RGBA2GRAY);

        // Binarize mask: convert any painted pixel (>10) to solid white (255)
        cv.threshold(maskGray, maskGray, 10, 255, cv.THRESH_BINARY);

        // Execute Telea Inpainting algorithm
        let dstRGB = new cv.Mat();
        cv.inpaint(srcRGB, maskGray, dstRGB, 3, cv.INPAINT_TELEA);

        // Convert output RGB back to RGBA
        let dstRGBA = new cv.Mat();
        cv.cvtColor(dstRGB, dstRGBA, cv.COLOR_RGB2RGBA);

        // Render result to canvas
        const resultCanvas = document.createElement("canvas");
        resultCanvas.width = W;
        resultCanvas.height = H;
        cv.imshow(resultCanvas, dstRGBA);

        // Memory cleanup to prevent WebAssembly heap memory leaks
        srcRGBA.delete(); 
        maskRGBA.delete(); 
        srcRGB.delete(); 
        maskGray.delete(); 
        dstRGB.delete(); 
        dstRGBA.delete();

        const blob = await canvasToBlob(resultCanvas, "image/jpeg", 0.95);
        const previewUrl = URL.createObjectURL(blob);

        outputEl.className = "tool-out ok";
        outputEl.innerHTML = "";
        
        const previewImg = document.createElement("img");
        previewImg.src = previewUrl;
        previewImg.style.cssText = "max-width:100%;max-height:260px;border:1px solid var(--border);border-radius:var(--radius-sm);display:block;margin-bottom:10px";
        
        const dlBtn = document.createElement("button");
        dlBtn.className = "btn primary sm";
        dlBtn.textContent = "Download";
        dlBtn.onclick = () => triggerDownload(blob, "object-removed.jpg");
        
        outputEl.appendChild(previewImg);
        outputEl.appendChild(dlBtn);
      } catch (err) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Fill failed: " + (err.message || "Engine Error");
        console.error("Object Removal Error:", err);
      }
    };
  }

  bindDropZone(document.getElementById("objRemoveDrop"), document.getElementById("objRemoveFile"), async (file) => {
    const image = await loadImageFromFile(file);
    const MAX = 1000; // Cap resolution at 1000px for optimal browser WASM speed
    let w = image.width, h = image.height;
    if (Math.max(w, h) > MAX) {
      const s = MAX / Math.max(w, h);
      w = Math.round(w * s); h = Math.round(h * s);
    }

    srcCanvas = document.createElement("canvas");
    srcCanvas.width = w; srcCanvas.height = h;
    const sCtx = srcCanvas.getContext("2d");
    sCtx.drawImage(image, 0, 0, w, h);

    maskCanvas = document.createElement("canvas");
    maskCanvas.width = w; maskCanvas.height = h;

    const cardW = mainCanvas.parentElement.clientWidth - 32 || 500;
    const scale = Math.min(1, cardW / w);
    mainCanvas.width = Math.round(w * scale);
    mainCanvas.height = Math.round(h * scale);
    mainCanvas.dataset.scale = scale;
    mainCanvas.style.display = "block";
    mainCanvas.style.cursor = "crosshair";
    renderComposite();

    const controls = document.getElementById("objRemoveControls");
    if (controls) controls.style.display = "flex";
    outputEl.className = "tool-out";
    outputEl.textContent = "";
  });

  function getPos(e) {
    const r = mainCanvas.getBoundingClientRect();
    const scale = +mainCanvas.dataset.scale || 1;
    const cx = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / scale;
    const cy = ((e.touches ? e.touches[0].clientY : e.clientY) - r.top) / scale;
    return { x: cx, y: cy };
  }

  function paint(e) {
    if (!painting || !maskCanvas) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    const mCtx = maskCanvas.getContext("2d");
    mCtx.save();
    mCtx.fillStyle = "#ffffff";
    mCtx.beginPath();
    mCtx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    mCtx.fill();
    mCtx.restore();
    renderComposite();
  }

  mainCanvas.addEventListener("mousedown", e => { painting = true; paint(e); });
  mainCanvas.addEventListener("mousemove", paint);
  mainCanvas.addEventListener("mouseup", () => { painting = false; });
  mainCanvas.addEventListener("mouseleave", () => { painting = false; });
  mainCanvas.addEventListener("touchstart", e => { painting = true; paint(e); }, { passive: false });
  mainCanvas.addEventListener("touchmove", paint, { passive: false });
  mainCanvas.addEventListener("touchend", () => { painting = false; });

  function renderComposite() {
    if (!srcCanvas) return;
    const scale = +mainCanvas.dataset.scale || 1;
    mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
    mainCtx.save();
    mainCtx.scale(scale, scale);
    mainCtx.drawImage(srcCanvas, 0, 0);
    
    if (maskCanvas) {
      // Draw mask overlay with visual red tinting for UI feedback
      const tmp = document.createElement("canvas");
      tmp.width = maskCanvas.width; tmp.height = maskCanvas.height;
      const tCtx = tmp.getContext("2d");
      tCtx.drawImage(maskCanvas, 0, 0);
      tCtx.globalCompositeOperation = "source-in";
      tCtx.fillStyle = "rgba(239, 68, 68, 0.7)";
      tCtx.fillRect(0, 0, tmp.width, tmp.height);

      mainCtx.drawImage(tmp, 0, 0);
    }
    mainCtx.restore();
  }
}

/* ================================================================
   5. PHOTO COMPOSITE — place a person (bg removed) on any background
   ================================================================
   Flow:
     Step 1 — user uploads their photo → U²-Net removes background
     Step 2 — user uploads a background image
     Step 3 — drag the cutout to reposition, corner handles to resize
     Step 4 — export composited flat PNG

   The cutout layer has 8 handles: 4 corners + 4 midpoints.
   Dragging the body moves; dragging handles scales around the
   opposite corner (standard Canva-style resize behaviour).
*/
function initPhotoCompositeTool() {
  const statusEl   = document.getElementById("compositeStatus");
  const step1El    = document.getElementById("compositeStep1");
  const step2El    = document.getElementById("compositeStep2");
  const editorEl   = document.getElementById("compositeEditor");
  const outputEl   = document.getElementById("compositeOut");
  const canvas     = document.getElementById("compositeCanvas");
  const ctx        = canvas.getContext("2d");

  let bgImage    = null;  // background Image element
  let cutout     = null;  // cutout Image element (transparent PNG blob URL)
  let cutoutBlob = null;  // saved for download

  // Cutout transform state (in canvas-pixel space)
  let layer = { x: 0, y: 0, w: 0, h: 0 };

  // Drag state
  let drag = null; // { type: "move"|"handle", handleIdx, startX, startY, startLayer }
  const HANDLE_R  = 9; // hit radius for handles
  const MIN_SIZE  = 40;

  // ── Step 1: upload person photo ──
  bindDropZone(document.getElementById("compositeDrop1"), document.getElementById("compositeFile1"), async (file) => {
    document.getElementById("compositeOut1").className = "tool-out";
    document.getElementById("compositeOut1").textContent = "Removing background…";
    statusEl.textContent = "";
    try {
      const session = await getU2Net(statusEl);
      statusEl.textContent = "";
      const img = await loadImageFromFile(file);
      const src = document.createElement("canvas");
      src.width = img.width; src.height = img.height;
      src.getContext("2d").drawImage(img, 0, 0);
      const masked = await runU2Net(session, src);
      // Store as blob URL
      const blob = await canvasToBlob(masked, "image/png");
      cutout = new Image();
      cutout.src = URL.createObjectURL(blob);
      await new Promise(r => { cutout.onload = r; });
      document.getElementById("compositeOut1").className = "tool-out ok";
      document.getElementById("compositeOut1").textContent = "Background removed ✓";
      document.getElementById("compositeOut1").style.color = "var(--pass)";
      // If background already loaded, go straight to editor
      if (bgImage) openEditor();
    } catch (err) {
      statusEl.textContent = "";
      document.getElementById("compositeOut1").className = "tool-out err";
      document.getElementById("compositeOut1").textContent = "Failed: " + err.message;
    }
  });

  // ── Step 2: upload background image ──
  bindDropZone(document.getElementById("compositeDrop2"), document.getElementById("compositeFile2"), async (file) => {
    bgImage = await loadImageFromFile(file);
    document.getElementById("compositeOut2").className = "tool-out ok";
    document.getElementById("compositeOut2").textContent = "Background loaded ✓";
    document.getElementById("compositeOut2").style.color = "var(--pass)";
    if (cutout) openEditor();
  });

  // ── Initial fit buttons ──
  document.getElementById("compositeFitHeight").onclick  = () => { applyFit("height");  };
  document.getElementById("compositeFitWidth").onclick   = () => { applyFit("width");   };
  document.getElementById("compositeFitCustom").onclick  = () => { applyFit("custom");  };

  function applyFit(mode) {
    if (!cutout || !bgImage) return;
    const BW = canvas.width, BH = canvas.height;
    const aspect = cutout.naturalWidth / cutout.naturalHeight;
    let w, h;
    if (mode === "height") {
      h = BH * 0.9; w = h * aspect;
    } else if (mode === "width") {
      w = BW * 0.6; h = w / aspect;
    } else {
      // custom: 50% of background height
      h = BH * 0.5; w = h * aspect;
    }
    layer = {
      x: (BW - w) / 2,
      y: (BH - h) / 2,
      w, h,
    };
    render();
  }

  function openEditor() {
    // Set canvas to background's natural size (capped at 1200px)
    const MAX = 1200;
    let bw = bgImage.naturalWidth, bh = bgImage.naturalHeight;
    if (Math.max(bw, bh) > MAX) {
      const s = MAX / Math.max(bw, bh);
      bw = Math.round(bw * s); bh = Math.round(bh * s);
    }
    canvas.width  = bw;
    canvas.height = bh;

    // Scale canvas display to fit the card
    const maxDisplayW = (editorEl.clientWidth || 700) - 16;
    const displayScale = Math.min(1, maxDisplayW / bw);
    canvas.style.width  = Math.round(bw * displayScale) + "px";
    canvas.style.height = Math.round(bh * displayScale) + "px";
    canvas.style.display = "block";

    editorEl.style.display = "block";
    // Default fit: fill height
    applyFit("height");
  }

  // ── Render ──
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Background
    if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    // Cutout
    if (cutout && layer.w > 0) {
      ctx.drawImage(cutout, layer.x, layer.y, layer.w, layer.h);
    }
    // Selection handles
    if (cutout) drawHandles();
  }

  // 8 handles: corners (0-3) and midpoints (4-7)
  function getHandles() {
    const { x, y, w, h } = layer;
    return [
      { x: x,         y: y         }, // 0 TL
      { x: x + w,     y: y         }, // 1 TR
      { x: x + w,     y: y + h     }, // 2 BR
      { x: x,         y: y + h     }, // 3 BL
      { x: x + w / 2, y: y         }, // 4 T
      { x: x + w,     y: y + h / 2 }, // 5 R
      { x: x + w / 2, y: y + h     }, // 6 B
      { x: x,         y: y + h / 2 }, // 7 L
    ];
  }

  function drawHandles() {
    const handles = getHandles();
    ctx.save();
    // Dashed selection border
    ctx.strokeStyle = "rgba(49,60,160,0.9)";
    ctx.lineWidth   = 2 / (canvas.offsetWidth / canvas.width || 1);
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(layer.x, layer.y, layer.w, layer.h);
    ctx.setLineDash([]);
    // Handle dots
    handles.forEach(h => {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "rgba(49,60,160,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(h.x, h.y, HANDLE_R / (canvas.offsetWidth / canvas.width || 1), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    });
    ctx.restore();
  }

  // ── Coordinate mapping (display → canvas pixel) ──
  function toCanvas(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const sx = canvas.width  / r.width;
    const sy = canvas.height / r.height;
    return {
      x: (clientX - r.left) * sx,
      y: (clientY - r.top)  * sy,
    };
  }

  function hitTest(cx, cy) {
    const handles = getHandles();
    const HIT = HANDLE_R * (canvas.width / (canvas.offsetWidth || canvas.width));
    for (let i = 0; i < handles.length; i++) {
      const dx = cx - handles[i].x, dy = cy - handles[i].y;
      if (Math.sqrt(dx*dx + dy*dy) <= HIT * 1.6) return { type: "handle", handleIdx: i };
    }
    if (cx >= layer.x && cx <= layer.x + layer.w &&
        cy >= layer.y && cy <= layer.y + layer.h) return { type: "move" };
    return null;
  }

  function onPointerDown(e) {
    if (!cutout) return;
    const { x, y } = toCanvas(e.touches ? e.touches[0].clientX : e.clientX,
                               e.touches ? e.touches[0].clientY : e.clientY);
    const hit = hitTest(x, y);
    if (!hit) return;
    e.preventDefault();
    drag = { ...hit, startX: x, startY: y, startLayer: { ...layer } };
    canvas.style.cursor = hit.type === "move" ? "grabbing" : "nwse-resize";
  }

  function onPointerMove(e) {
    if (!drag) {
      // Update cursor on hover
      if (!cutout) return;
      const { x, y } = toCanvas(e.touches ? e.touches[0].clientX : e.clientX,
                                 e.touches ? e.touches[0].clientY : e.clientY);
      const hit = hitTest(x, y);
      canvas.style.cursor = !hit ? "default" : hit.type === "move" ? "grab" : "nwse-resize";
      return;
    }
    e.preventDefault();
    const { x, y } = toCanvas(e.touches ? e.touches[0].clientX : e.clientX,
                               e.touches ? e.touches[0].clientY : e.clientY);
    const dx = x - drag.startX, dy = y - drag.startY;
    const sl = drag.startLayer;

    if (drag.type === "move") {
      layer.x = sl.x + dx;
      layer.y = sl.y + dy;
    } else {
      // Resize from opposite corner
      const idx = drag.handleIdx;
      let nx = sl.x, ny = sl.y, nw = sl.w, nh = sl.h;
      // Which edges does this handle move?
      const movesLeft   = idx === 0 || idx === 3 || idx === 7;
      const movesRight  = idx === 1 || idx === 2 || idx === 5;
      const movesTop    = idx === 0 || idx === 1 || idx === 4;
      const movesBottom = idx === 2 || idx === 3 || idx === 6;

      if (movesLeft)   { nx = sl.x + dx; nw = sl.w - dx; }
      if (movesRight)  { nw = sl.w + dx; }
      if (movesTop)    { ny = sl.y + dy; nh = sl.h - dy; }
      if (movesBottom) { nh = sl.h + dy; }

      // Corner handles: lock aspect ratio
      if (idx <= 3) {
        const aspect = sl.w / sl.h;
        if (Math.abs(dx) > Math.abs(dy)) {
          nh = nw / aspect;
          if (movesTop) ny = sl.y + sl.h - nh;
        } else {
          nw = nh * aspect;
          if (movesLeft) nx = sl.x + sl.w - nw;
        }
      }

      if (nw >= MIN_SIZE && nh >= MIN_SIZE) {
        layer = { x: nx, y: ny, w: nw, h: nh };
      }
    }
    render();
  }

  function onPointerUp() {
    drag = null;
    canvas.style.cursor = "default";
  }

  canvas.addEventListener("mousedown",  onPointerDown);
  canvas.addEventListener("mousemove",  onPointerMove);
  canvas.addEventListener("mouseup",    onPointerUp);
  canvas.addEventListener("mouseleave", onPointerUp);
  canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  canvas.addEventListener("touchmove",  onPointerMove, { passive: false });
  canvas.addEventListener("touchend",   onPointerUp);

  // ── Export: render without handles, download ──
  document.getElementById("compositeExport").onclick = async () => {
    // Draw clean version (no handles)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgImage) ctx.drawImage(bgImage, 0, 0, canvas.width, canvas.height);
    if (cutout)  ctx.drawImage(cutout, layer.x, layer.y, layer.w, layer.h);

    const blob = await canvasToBlob(canvas, "image/jpeg", 0.96);
    triggerDownload(blob, "composite.jpg");
    showToast("Downloading composite image");

    // Redraw with handles after export
    render();

    outputEl.className = "tool-out ok";
    outputEl.textContent = "Downloaded ✓";
  };
}
