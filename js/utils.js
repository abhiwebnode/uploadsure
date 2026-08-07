/*
  utils.js
  ---------
  Small helpers shared across every tool. Nothing here is specific
  to one feature — if a function is only used by the crop tool, it
  lives in crop-tool.js instead.
*/

const FORMAT_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** The image formats this app can actually re-encode to via canvas/OffscreenCanvas. */
const SUPPORTED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Figures out an uploaded image's real format, so a tool can output the
 * same format it was given instead of silently converting everything to
 * JPEG. Falls back to the file extension if the browser didn't set a
 * `type` (some sources omit it), and falls back to PNG — a lossless,
 * universally-supported format — if the source is something the canvas
 * pipeline can't re-encode to (e.g. GIF, BMP, TIFF).
 */
function detectImageMimeType(file) {
  if (file.type && SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) return file.type;

  const extension = (file.name.split(".").pop() || "").toLowerCase();
  const extensionMap = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  if (extensionMap[extension]) return extensionMap[extension];

  return "image/png"; // safest lossless fallback for a format we can't re-encode natively
}

/** Reads a File into an <img>, resolved once it's decoded and ready to draw. */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Reads a File as raw bytes (used for PDF files, not images). */
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function formatKilobytes(bytes) {
  return (bytes / 1024).toFixed(1);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Draws `image` onto a canvas of exactly width×height, cover-cropping
    so the frame fills without stretching. Used wherever the app needs
    an instant on-screen preview; the worker does the same operation
    off-thread for the real batch/export path. */
function coverCropToCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const scale = Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

/** Best-effort read of the border pixels to guess whether a background
    is plain and light — used by the Application Pack's photo checklist.
    This is intentionally simple; it is not real background segmentation. */
function sampleBorderForPlainBackground(canvas) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const samplePoints = [
    [2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3],
    [width >> 1, 2], [width >> 1, height - 3], [2, height >> 1], [width - 3, height >> 1],
  ];
  const reds = [], greens = [], blues = [];
  for (const [x, y] of samplePoints) {
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    reds.push(pixel[0]);
    greens.push(pixel[1]);
    blues.push(pixel[2]);
  }
  const spreadOf = (values) => Math.max(...values) - Math.min(...values);
  const averageSpread = (spreadOf(reds) + spreadOf(greens) + spreadOf(blues)) / 3;
  const averageBrightness = reds.reduce((sum, v) => sum + v, 0) / reds.length;
  return { isPlain: averageSpread < 26, isLight: averageBrightness > 150 };
}

/* ---------- icons used inline in status messages ---------- */
function checkmarkIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>';
}
function warningIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 8v5m0 3h.01"/></svg>';
}

/* ---------- toast ---------- */
let toastTimeout;
function showToast(message) {
  const toastEl = document.getElementById("toast");
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

/* ---------- theme toggle (light / dark / follow system) ---------- */
function initThemeToggle() {
  const root = document.documentElement;
  const button = document.getElementById("themeBtn");
  const sunIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  const moonIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z"/></svg>';

  function isDarkActive() {
    const mode = root.getAttribute("data-theme");
    return mode === "dark" || (mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  }
  function syncIcon() {
    button.innerHTML = isDarkActive() ? sunIcon : moonIcon;
  }

  button.onclick = () => {
    const newTheme = isDarkActive() ? "light" : "dark";
    root.setAttribute("data-theme", newTheme);
    try { localStorage.setItem("uploadsure-theme", newTheme); } catch (e) { /* storage blocked — toggle still works for this page view */ }
    syncIcon();
  };
  document.addEventListener("keydown", (e) => {
    const typing = /input|select|textarea/i.test(e.target.tagName);
    if ((e.key === "d" || e.key === "D") && !typing) button.click();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncIcon);
  syncIcon();
}

/* ---------- drag-and-drop file input binding ---------- */
/** Wires a drop zone + its hidden <input type=file> together.
    `handler` receives a single File, or a FileList if the input allows multiple. */
function bindDropZone(dropZoneEl, inputEl, handler) {
  dropZoneEl.addEventListener("click", () => inputEl.click());
  inputEl.addEventListener("change", () => {
    if (inputEl.files && inputEl.files.length) {
      handler(inputEl.multiple ? inputEl.files : inputEl.files[0]);
    }
    inputEl.value = "";
  });
  ["dragover", "dragenter"].forEach((eventName) =>
    dropZoneEl.addEventListener(eventName, (e) => { e.preventDefault(); dropZoneEl.classList.add("over"); })
  );
  ["dragleave", "drop"].forEach((eventName) =>
    dropZoneEl.addEventListener(eventName, (e) => { e.preventDefault(); dropZoneEl.classList.remove("over"); })
  );
  dropZoneEl.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length) handler(inputEl.multiple ? files : files[0]);
  });
}

/* ---------- progress bar ---------- */
function setProgress(progressEl, percent) {
  progressEl.classList.add("show");
  progressEl.querySelector(".bar").style.width = percent + "%";
  if (percent >= 100) setTimeout(() => progressEl.classList.remove("show"), 500);
}

/* ---------- batch processing over a FileList with per-item progress ---------- */
/**
 * Runs `processOneFile` over every file, updating a progress bar and a
 * list of filename rows as it goes. `processOneFile` should return
 * { blob, name, label } for a successful file.
 */
async function processFilesInBatch(files, progressEl, listEl, processOneFile, onAllDone) {
  const fileArray = Array.from(files);
  listEl.innerHTML = "";

  const rows = fileArray.map((file) => {
    const row = document.createElement("li");
    row.className = "filerow";
    row.innerHTML = `<span class="nm">${file.name}</span><span class="mono" style="color:var(--text-faint)">…</span>`;
    listEl.appendChild(row);
    return row;
  });

  const results = [];
  for (let i = 0; i < fileArray.length; i++) {
    setProgress(progressEl, Math.round((i / fileArray.length) * 100));
    const statusSpan = rows[i].querySelector("span.mono");
    try {
      const result = await processOneFile(fileArray[i]);
      results.push(result);
      statusSpan.textContent = result.label;
      statusSpan.style.color = "var(--pass)";
    } catch (error) {
      // Log the real cause — without this, a failure surfaces only as the
      // generic "Could not process those images" message, which is very hard
      // to diagnose (e.g. a stale image-worker.js missing a task type).
      console.error("Batch processing failed for", fileArray[i].name, error);
      statusSpan.textContent = "failed";
      statusSpan.style.color = "var(--fail)";
    }
  }
  setProgress(progressEl, 100);
  onAllDone(results, fileArray);
}

/* ---------- drag-to-reorder list rows (used by Merge PDF and Images→PDF) ---------- */
function createReorderableRow(displayName, onRemove) {
  const row = document.createElement("li");
  row.className = "filerow";
  row.draggable = true;
  row.innerHTML = `<span class="gr">⠿</span><span class="nm">${displayName}</span><button class="rm" title="remove">×</button>`;
  row.querySelector(".rm").onclick = onRemove;
  return row;
}

/** Lets the user drag rows within `listEl` to reorder the backing array.
    `getArray`/`setArray` read and write that array; `rerender` redraws the DOM. */
function enableDragReorder(listEl, getArray, setArray, rerender) {
  let draggedIndex = null;

  listEl.addEventListener("dragstart", (e) => {
    const row = e.target.closest(".filerow");
    if (!row) return;
    draggedIndex = [...listEl.children].indexOf(row);
    row.classList.add("drag");
  });

  listEl.addEventListener("dragend", (e) => {
    const row = e.target.closest(".filerow");
    if (row) row.classList.remove("drag");
  });

  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    const row = e.target.closest(".filerow");
    if (!row || draggedIndex === null) return;
    const overIndex = [...listEl.children].indexOf(row);
    if (overIndex === draggedIndex) return;

    const array = getArray();
    const [movedItem] = array.splice(draggedIndex, 1);
    array.splice(overIndex, 0, movedItem);
    setArray(array);
    draggedIndex = overIndex;
    rerender();
  });
}

/* ── Scroll to top button ──
   Creates one button, appended to body, shown after the user
   scrolls down 400px. Works on every page automatically. */
function initScrollToTop() {
  const btn = document.createElement("button");
  btn.id = "scrollTopBtn";
  btn.setAttribute("aria-label", "Back to top");
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><path d="M18 15l-6-6-6 6"/></svg>`;
  btn.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
  document.body.appendChild(btn);

  window.addEventListener("scroll", () => {
    btn.classList.toggle("visible", window.scrollY > 400);
  }, { passive: true });
}
