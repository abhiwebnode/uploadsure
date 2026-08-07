/*
  image-extra-tools.js
  ----------------------
  Social Media Resizer, Meme Generator, Favicon + App Icon Generator,
  SVG <-> PNG conversion, and Mobile Device Screenshot.

  Dependencies (all from utils.js / worker-client.js already loaded):
    loadImageFromFile, triggerDownload, canvasToBlob, showToast,
    bindDropZone, workerResizeExact, FORMAT_EXTENSIONS

  No additional CDN libraries needed.
*/

/* ============================================================
   SOCIAL MEDIA RESIZER
   One source image → every major platform size, batch download.
   ============================================================ */

const SOCIAL_PRESETS = [
  { group: "Instagram",  label: "Square post",       w: 1080, h: 1080 },
  { group: "Instagram",  label: "Portrait post",      w: 1080, h: 1350 },
  { group: "Instagram",  label: "Story / Reel",       w: 1080, h: 1920 },
  { group: "Instagram",  label: "Profile picture",    w: 320,  h: 320  },
  { group: "X (Twitter)", label: "Post image",        w: 1600, h: 900  },
  { group: "X (Twitter)", label: "Profile picture",   w: 400,  h: 400  },
  { group: "X (Twitter)", label: "Header",            w: 1500, h: 500  },
  { group: "Facebook",   label: "Post image",         w: 1200, h: 630  },
  { group: "Facebook",   label: "Cover photo",        w: 820,  h: 312  },
  { group: "Facebook",   label: "Profile picture",    w: 180,  h: 180  },
  { group: "LinkedIn",   label: "Post image",         w: 1200, h: 628  },
  { group: "LinkedIn",   label: "Profile picture",    w: 400,  h: 400  },
  { group: "LinkedIn",   label: "Cover photo",        w: 1584, h: 396  },
  { group: "YouTube",    label: "Thumbnail",          w: 1280, h: 720  },
  { group: "YouTube",    label: "Channel art",        w: 2560, h: 1440 },
  { group: "WhatsApp",   label: "Profile picture",    w: 500,  h: 500  },
  { group: "Pinterest",  label: "Pin image",          w: 1000, h: 1500 },
];

function initSocialResizerTool() {
  let selectedFile = null;
  let selectedPresets = new Set(SOCIAL_PRESETS.map((_, i) => i)); // all selected by default

  const listEl = document.getElementById("smrList");
  const outputEl = document.getElementById("smrOut");
  const progressEl = document.getElementById("smrProg");

  // Render the preset checklist
  function renderPresetList() {
    if (!listEl) return;
    listEl.innerHTML = "";
    let currentGroup = null;
    SOCIAL_PRESETS.forEach((preset, i) => {
      if (preset.group !== currentGroup) {
        currentGroup = preset.group;
        const groupLabel = document.createElement("li");
        groupLabel.className = "smr-group";
        groupLabel.textContent = preset.group;
        listEl.appendChild(groupLabel);
      }
      const row = document.createElement("li");
      row.className = "smr-row";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `smr-${i}`;
      checkbox.checked = true;
      checkbox.onchange = () => {
        if (checkbox.checked) selectedPresets.add(i);
        else selectedPresets.delete(i);
      };
      const lbl = document.createElement("label");
      lbl.htmlFor = `smr-${i}`;
      lbl.innerHTML = `${preset.label} <span class="smr-dim">${preset.w}×${preset.h}</span>`;
      row.appendChild(checkbox);
      row.appendChild(lbl);
      listEl.appendChild(row);
    });
  }
  renderPresetList();

  document.getElementById("smrSelectAll").onclick = () => {
    listEl.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = true;
      selectedPresets.add(+cb.id.replace("smr-", ""));
    });
  };
  document.getElementById("smrSelectNone").onclick = () => {
    listEl.querySelectorAll("input[type=checkbox]").forEach((cb) => {
      cb.checked = false;
      selectedPresets.delete(+cb.id.replace("smr-", ""));
    });
  };

  bindDropZone(document.getElementById("smrDrop"), document.getElementById("smrFile"), (file) => {
    selectedFile = file;
    outputEl.className = "tool-out";
    outputEl.textContent = "";
    showToast("Image loaded — pick sizes then export");
  });

  document.getElementById("smrExport").onclick = async () => {
    if (!selectedFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose an image first."; return; }
    if (!selectedPresets.size) { outputEl.className = "tool-out err"; outputEl.textContent = "Select at least one size."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Resizing…";
    setProgress(progressEl, 0);

    try {
      const image = await loadImageFromFile(selectedFile);
      const presetList = [...selectedPresets].sort((a, b) => a - b).map((i) => SOCIAL_PRESETS[i]);
      const results = [];

      for (let i = 0; i < presetList.length; i++) {
        const preset = presetList[i];
        setProgress(progressEl, Math.round((i / presetList.length) * 100));
        const bitmap = await createImageBitmap(image);
        const { blob } = await workerResizeExact(bitmap, "image/jpeg", preset.w, preset.h);
        const slug = preset.group.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const name = `${slug}_${preset.label.toLowerCase().replace(/[^a-z0-9]/g, "-")}_${preset.w}x${preset.h}.jpg`;
        results.push({ blob, name });
      }

      setProgress(progressEl, 100);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${results.length} image(s) ready. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download all";
      downloadBtn.onclick = () => {
        results.forEach((r, i) => setTimeout(() => triggerDownload(r.blob, r.name), i * 150));
        showToast(`Downloading ${results.length} images…`);
      };
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not resize that image.";
    }
  };
}

function setProgress(el, value) {
  if (!el) return;
  const bar = el.querySelector(".bar");
  if (bar) bar.style.width = value + "%";
}


/* ============================================================
   MEME GENERATOR
   Top/bottom text overlay with auto-fitting font size.
   ============================================================ */

function initMemeGeneratorTool() {
  let selectedFile = null;

  bindDropZone(document.getElementById("memeDrop"), document.getElementById("memeFile"), async (file) => {
    selectedFile = file;
    await renderMemePreview();
  });

  ["memeTop", "memeBottom", "memeFontSize", "memeColor"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => { if (selectedFile) renderMemePreview(); });
  });

  async function renderMemePreview() {
    const outputEl = document.getElementById("memeOut");
    if (!selectedFile) return;
    try {
      const image = await loadImageFromFile(selectedFile);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      const topText = document.getElementById("memeTop").value || "";
      const bottomText = document.getElementById("memeBottom").value || "";
      const userFontSize = +document.getElementById("memeFontSize").value || 0;
      const fontColor = document.getElementById("memeColor").value || "#ffffff";

      const margin = Math.round(canvas.width * 0.04);
      const autoSize = Math.max(24, Math.round(canvas.width / 12));
      const fontSize = userFontSize || autoSize;

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = `900 ${fontSize}px Impact, Arial Black, sans-serif`;

      function drawMemeText(text, y) {
        if (!text.trim()) return;
        // wrap text to fit width
        const maxWidth = canvas.width - margin * 2;
        const words = text.split(" ");
        const lines = [];
        let line = "";
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = testLine;
          }
        }
        if (line) lines.push(line);
        lines.forEach((l, i) => {
          const lineY = y + i * (fontSize * 1.2);
          ctx.strokeStyle = "rgba(0,0,0,0.85)";
          ctx.lineWidth = Math.max(2, fontSize / 10);
          ctx.strokeText(l.toUpperCase(), canvas.width / 2, lineY, maxWidth);
          ctx.fillStyle = fontColor;
          ctx.fillText(l.toUpperCase(), canvas.width / 2, lineY, maxWidth);
        });
      }

      drawMemeText(topText, margin);

      // bottom text: measure total height first then position from bottom
      if (bottomText.trim()) {
        const words = bottomText.split(" ");
        const maxWidth = canvas.width - margin * 2;
        let line = "", lineCount = 1;
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > maxWidth && line) { lineCount++; line = word; }
          else { line = testLine; }
        }
        const totalHeight = lineCount * fontSize * 1.2;
        const startY = canvas.height - margin - totalHeight;
        drawMemeText(bottomText, startY);
      }

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const previewUrl = URL.createObjectURL(blob);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "";
      const img = document.createElement("img");
      img.src = previewUrl;
      img.style.cssText = "max-width:100%;max-height:280px;border:1px solid var(--border);border-radius:var(--radius-sm);display:block;margin-bottom:10px";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn primary sm";
      downloadBtn.textContent = "Download meme";
      downloadBtn.onclick = () => triggerDownload(blob, "meme.jpg");
      outputEl.appendChild(img);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      document.getElementById("memeOut").className = "tool-out err";
      document.getElementById("memeOut").textContent = "Could not process that image.";
    }
  }
}


/* ============================================================
   FAVICON GENERATOR
   PNG/JPG → multi-size .ico file (16, 32, 48px).
   ICO format built from scratch — no external library needed.
   ============================================================ */

function initFaviconGeneratorTool() {
  bindDropZone(document.getElementById("faviconDrop"), document.getElementById("faviconFile"), async (file) => {
    const outputEl = document.getElementById("faviconOut");
    const progressEl = document.getElementById("faviconProg");
    outputEl.className = "tool-out";
    outputEl.textContent = "Generating…";
    setProgress(progressEl, 10);

    try {
      const image = await loadImageFromFile(file);
      const sizes = [16, 32, 48];
      const pngBuffers = [];

      for (let i = 0; i < sizes.length; i++) {
        setProgress(progressEl, 20 + i * 25);
        const size = sizes[i];
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, size, size);
        // get raw PNG bytes
        const dataUrl = canvas.toDataURL("image/png");
        const base64 = dataUrl.split(",")[1];
        const binary = atob(base64);
        const buffer = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) buffer[j] = binary.charCodeAt(j);
        pngBuffers.push({ size, buffer });
      }

      setProgress(progressEl, 90);
      const icoBlob = buildIco(pngBuffers);
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `favicon.ico built with 16×16, 32×32, and 48×48 layers. `;
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn sm";
      dlBtn.textContent = "Download favicon.ico";
      dlBtn.onclick = () => triggerDownload(icoBlob, "favicon.ico");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(dlBtn);

      // also offer individual PNGs
      const pngNotes = document.createElement("p");
      pngNotes.style.cssText = "margin:10px 0 4px;font-size:12.5px;color:var(--text-muted)";
      pngNotes.textContent = "Also download individual PNG sizes for <link rel=\"icon\"> and PWA manifests:";
      outputEl.appendChild(pngNotes);
      pngBuffers.forEach(({ size, buffer }) => {
        const btn = document.createElement("button");
        btn.className = "btn sm";
        btn.style.marginRight = "6px";
        btn.textContent = `${size}×${size} PNG`;
        btn.onclick = () => triggerDownload(new Blob([buffer], { type: "image/png" }), `favicon-${size}.png`);
        outputEl.appendChild(btn);
      });
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not process that image.";
    }
  });
}

/**
 * Builds a valid multi-image .ico file from an array of PNG byte buffers.
 * ICO format: 6-byte header + N×16-byte directory entries + PNG data.
 * Using PNG compression inside ICO (supported by all modern browsers/OS).
 */
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const directorySize = count * 16;
  const headerSize = 6;
  let dataOffset = headerSize + directorySize;

  const parts = [];

  // ICONDIR header: reserved(2) + type=1(2) + count(2)
  const header = new Uint8Array(6);
  const dv = new DataView(header.buffer);
  dv.setUint16(0, 0, true);     // reserved
  dv.setUint16(2, 1, true);     // type = 1 (icon)
  dv.setUint16(4, count, true); // image count
  parts.push(header);

  // Directory entries: 16 bytes each
  const directory = new Uint8Array(directorySize);
  const ddv = new DataView(directory.buffer);
  let dirOffset = 0;
  let fileOffset = headerSize + directorySize;

  pngBuffers.forEach(({ size, buffer }) => {
    ddv.setUint8(dirOffset + 0, size >= 256 ? 0 : size); // width (0 = 256)
    ddv.setUint8(dirOffset + 1, size >= 256 ? 0 : size); // height (0 = 256)
    ddv.setUint8(dirOffset + 2, 0);  // color count (0 = no palette)
    ddv.setUint8(dirOffset + 3, 0);  // reserved
    ddv.setUint16(dirOffset + 4, 1, true); // color planes
    ddv.setUint16(dirOffset + 6, 32, true); // bits per pixel
    ddv.setUint32(dirOffset + 8, buffer.byteLength, true); // image data size
    ddv.setUint32(dirOffset + 12, fileOffset, true);       // image data offset
    dirOffset += 16;
    fileOffset += buffer.byteLength;
  });
  parts.push(directory);

  // PNG data blobs
  pngBuffers.forEach(({ buffer }) => parts.push(buffer));

  return new Blob(parts, { type: "image/x-icon" });
}


/* ============================================================
   APP ICON GENERATOR
   One source image → iOS + Android icon set, named correctly.
   ============================================================ */

const APP_ICON_SIZES = [
  // Apple icons — exact names used by most web CMS and WordPress plugins
  { platform: "Apple",   label: "iPhone non-retina (legacy)",  size: 57,   filename: "apple-icon-57x57.png" },
  { platform: "Apple",   label: "iPhone retina (iOS 7–)",      size: 60,   filename: "apple-icon-60x60.png" },
  { platform: "Apple",   label: "iPad non-retina (legacy)",    size: 72,   filename: "apple-icon-72x72.png" },
  { platform: "Apple",   label: "iPad non-retina (iOS 7–)",    size: 76,   filename: "apple-icon-76x76.png" },
  { platform: "Apple",   label: "iPhone retina @2x (legacy)",  size: 114,  filename: "apple-icon-114x114.png" },
  { platform: "Apple",   label: "iPhone retina @2x",           size: 120,  filename: "apple-icon-120x120.png" },
  { platform: "Apple",   label: "iPad retina (legacy)",        size: 144,  filename: "apple-icon-144x144.png" },
  { platform: "Apple",   label: "iPad retina",                 size: 152,  filename: "apple-icon-152x152.png" },
  { platform: "Apple",   label: "iPhone @3x / Apple Touch",    size: 180,  filename: "apple-icon-180x180.png" },
  { platform: "Apple",   label: "Apple touch icon (bare)",     size: 180,  filename: "apple-touch-icon.png" },
  { platform: "Apple",   label: "App precomposed (bare)",      size: 180,  filename: "apple-touch-icon-precomposed.png" },

  // Android icons
  { platform: "Android", label: "Android launcher",            size: 192,  filename: "android-icon-192x192.png" },
  { platform: "Android", label: "Android hdpi",                size: 96,   filename: "android-icon-96x96.png" },
  { platform: "Android", label: "Android mdpi",                size: 72,   filename: "android-icon-72x72.png" },
  { platform: "Android", label: "Android xhdpi",               size: 96,   filename: "android-icon-96x96-xhdpi.png" },
  { platform: "Android", label: "Android xxhdpi",              size: 144,  filename: "android-icon-144x144.png" },

  // Favicons
  { platform: "Favicon", label: "Favicon 16×16",               size: 16,   filename: "favicon-16x16.png" },
  { platform: "Favicon", label: "Favicon 32×32",               size: 32,   filename: "favicon-32x32.png" },
  { platform: "Favicon", label: "Favicon 96×96",               size: 96,   filename: "favicon-96x96.png" },
  { platform: "Favicon", label: "Favicon 48×48",               size: 48,   filename: "favicon-48x48.png" },

  // Microsoft / Windows tiles
  { platform: "Windows", label: "MS tile 144×144",             size: 144,  filename: "ms-icon-144x144.png" },
  { platform: "Windows", label: "MS tile 70×70",               size: 70,   filename: "ms-icon-70x70.png" },
  { platform: "Windows", label: "MS tile 150×150",             size: 150,  filename: "ms-icon-150x150.png" },
  { platform: "Windows", label: "MS tile 310×310",             size: 310,  filename: "ms-icon-310x310.png" },

  // PWA manifest icons
  { platform: "PWA",     label: "PWA icon 192×192",            size: 192,  filename: "icon-192x192.png" },
  { platform: "PWA",     label: "PWA icon 512×512",            size: 512,  filename: "icon-512x512.png" },

  // General / open graph
  { platform: "General", label: "OG / social sharing",         size: 256,  filename: "icon-256x256.png" },
];

function initAppIconGeneratorTool() {
  bindDropZone(document.getElementById("appIconDrop"), document.getElementById("appIconFile"), async (file) => {
    const outputEl = document.getElementById("appIconOut");
    const progressEl = document.getElementById("appIconProg");
    outputEl.className = "tool-out";
    outputEl.textContent = "Generating icon set…";
    setProgress(progressEl, 0);

    try {
      const image = await loadImageFromFile(file);
      const results = [];

      for (let i = 0; i < APP_ICON_SIZES.length; i++) {
        setProgress(progressEl, Math.round((i / APP_ICON_SIZES.length) * 90));
        const { size, filename } = APP_ICON_SIZES[i];
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(image, 0, 0, size, size);
        const blob = await canvasToBlob(canvas, "image/png");
        results.push({ blob, filename });
      }

      setProgress(progressEl, 100);
      const byPlatform = APP_ICON_SIZES.reduce((acc, s) => { acc[s.platform] = (acc[s.platform] || 0) + 1; return acc; }, {});
      const summary = Object.entries(byPlatform).map(([p, n]) => `${n} ${p}`).join(", ");
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${results.length} icons generated — ${summary}. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download all icons";
      downloadBtn.onclick = () => {
        results.forEach((r, i) => setTimeout(() => triggerDownload(r.blob, r.filename.replace("/", "_")), i * 100));
        showToast(`Downloading ${results.length} icons…`);
      };
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not process that image.";
    }
  });
}


/* ============================================================
   SVG ↔ PNG CONVERSION
   SVG → PNG: real rasterization via canvas.
   PNG → SVG: honest embed (PNG data wrapped in SVG — not vectorization).
   ============================================================ */

function initSvgPngConvertTool() {
  let selectedFile = null;
  let conversionDirection = "svg-to-png";

  document.querySelectorAll("#svgConvSeg button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#svgConvSeg button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      conversionDirection = btn.dataset.dir;
      document.getElementById("svgConvNote").textContent =
        conversionDirection === "png-to-svg"
          ? "Note: this wraps the PNG inside an SVG container — it does not vectorize or trace the image. True vectorization requires software like Inkscape."
          : "";
      if (selectedFile) runConversion(selectedFile);
    };
  });

  bindDropZone(document.getElementById("svgConvDrop"), document.getElementById("svgConvFile"), (file) => {
    selectedFile = file;
    runConversion(file);
  });

  document.querySelectorAll("#svgScaleSeg button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#svgScaleSeg button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      if (selectedFile) runConversion(selectedFile);
    };
  });

  async function runConversion(file) {
    const outputEl = document.getElementById("svgConvOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Converting…";

    try {
      if (conversionDirection === "svg-to-png") {
        const scaleBtn = document.querySelector("#svgScaleSeg button.on");
        const scale = scaleBtn ? +scaleBtn.dataset.scale : 1;
        const svgText = await file.text();
        const blob = new Blob([svgText], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        // SVG may not have intrinsic pixel dimensions — fall back to 512px
        const baseW = img.naturalWidth || 512;
        const baseH = img.naturalHeight || 512;
        canvas.width = Math.round(baseW * scale);
        canvas.height = Math.round(baseH * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const pngBlob = await canvasToBlob(canvas, "image/png");
        const name = file.name.replace(/\.svg$/i, "") + (scale !== 1 ? `@${scale}x` : "") + ".png";
        outputEl.className = "tool-out ok";
        outputEl.innerHTML = `Rendered at ${canvas.width}×${canvas.height}px. `;
        const dlBtn = document.createElement("button");
        dlBtn.className = "btn sm";
        dlBtn.textContent = "Download PNG";
        dlBtn.onclick = () => triggerDownload(pngBlob, name);
        outputEl.appendChild(document.createElement("br"));
        outputEl.appendChild(dlBtn);
      } else {
        // PNG → SVG: embed as data URL inside an SVG shell
        const imgEl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const i = new Image();
            i.onload = () => resolve(i);
            i.onerror = reject;
            i.src = reader.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const dataUrl = imgEl.src;
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        const svgString = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${dataUrl}" width="${w}" height="${h}"/></svg>`;
        const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
        const name = file.name.replace(/\.\w+$/, "") + ".svg";
        outputEl.className = "tool-out ok";
        outputEl.innerHTML = `Wrapped as SVG (${w}×${h}). This is an embedded image, not vectorized. `;
        const dlBtn = document.createElement("button");
        dlBtn.className = "btn sm";
        dlBtn.textContent = "Download SVG";
        dlBtn.onclick = () => triggerDownload(svgBlob, name);
        outputEl.appendChild(document.createElement("br"));
        outputEl.appendChild(dlBtn);
      }
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Conversion failed — check the file is a valid SVG or PNG.";
    }
  }
}


/* ============================================================
   MOBILE DEVICE SCREENSHOT
   Wraps an uploaded screenshot inside a realistic device frame.
   Each device is an SVG embedded as a data URI so no external
   image files are needed — crisp at any resolution, fully offline.

   Real device proportions used (portrait orientation):
   iPhone 15:       71.5 × 147.5 mm body, 19.5:9 screen, Dynamic Island
   Galaxy S24:      70.6 × 147.0 mm body, 19.5:9 screen, punch-hole camera
   iPad Pro 13" M4: 281.6 × 215.5 mm landscape, 4:3 screen  (landscape)
   Galaxy Tab S9+:  185.4 × 285.4 mm body, 16:10 screen
   ============================================================ */

/*
  Each entry has:
    svgFrame(color)  → function that returns an SVG string for the device body
                       (screen area is left transparent / filled with #000 so
                        the screenshot drawn underneath shows through)
    screenX/Y/W/H    → where to draw the screenshot within the SVG viewport
    viewW/viewH      → SVG viewport dimensions (in SVG user units)
    aspect           → portrait or landscape
*/
const DEVICE_CONFIGS = {
  iphone: {
    label: "iPhone 15",
    viewW: 320, viewH: 640,
    screenX: 18, screenY: 44, screenW: 284, screenH: 552, screenR: 12,
    aspect: "portrait",
    svgFrame: (color) => {
      const body = color === "silver" ? "#E8E8E8" : color === "navy" ? "#1B2B4B" : "#1C1C1E";
      const shine = color === "silver" ? "#FFFFFF" : color === "navy" ? "#2D4580" : "#3A3A3C";
      const btn = color === "silver" ? "#C8C8C8" : "#48484A";
      const isLight = color === "silver";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 640" width="320" height="640">
  <defs>
    <linearGradient id="bodyGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${body}"/>
      <stop offset="40%" stop-color="${shine}"/>
      <stop offset="100%" stop-color="${body}"/>
    </linearGradient>
    <linearGradient id="sideShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${shine}"/>
      <stop offset="100%" stop-color="${body}"/>
    </linearGradient>
    <mask id="screenHole">
      <rect x="0" y="0" width="320" height="640" fill="white"/>
      <rect x="18" y="44" width="284" height="552" rx="12" ry="12" fill="black"/>
    </mask>
  </defs>
  <!-- body, with the screen area masked out so the screenshot shows through -->
  <g mask="url(#screenHole)">
    <rect x="0" y="0" width="320" height="640" rx="46" ry="46" fill="url(#bodyGrad)"/>
    <rect x="0" y="0" width="320" height="640" rx="46" ry="46" fill="none" stroke="${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.12)"}" stroke-width="2"/>
  </g>
  <!-- screen recess shadow (drawn over the screenshot edge for depth) -->
  <rect x="18" y="44" width="284" height="552" rx="12" ry="12" fill="none" stroke="rgba(0,0,0,0.45)" stroke-width="2"/>
  <!-- dynamic island - pill shape at top center -->
  <rect x="117" y="52" width="86" height="26" rx="13" ry="13" fill="${isLight ? "#C0C0C0" : "#000000"}"/>
  <!-- camera dot inside dynamic island -->
  <circle cx="185" cy="65" r="7" fill="${isLight ? "#A0A0A0" : "#0A0A0A"}"/>
  <circle cx="185" cy="65" r="4" fill="${isLight ? "#888" : "#1A1A1A"}"/>
  <!-- action button (left side, above volume) -->
  <rect x="-3" y="158" width="5" height="36" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- volume up (left) -->
  <rect x="-3" y="212" width="5" height="58" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- volume down (left) -->
  <rect x="-3" y="282" width="5" height="58" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- power / side button (right) -->
  <rect x="318" y="212" width="5" height="82" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- bottom speaker grille -->
  <g fill="${isLight ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.18)"}">
    <circle cx="134" cy="622" r="2.5"/>
    <circle cx="143" cy="622" r="2.5"/>
    <circle cx="152" cy="622" r="2.5"/>
    <circle cx="161" cy="622" r="2.5"/>
    <circle cx="170" cy="622" r="2.5"/>
    <circle cx="179" cy="622" r="2.5"/>
    <circle cx="188" cy="622" r="2.5"/>
  </g>
  <!-- USB-C port -->
  <rect x="143" y="632" width="34" height="5" rx="2.5" ry="2.5" fill="${isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.15)"}"/>
</svg>`;
    },
  },

  android: {
    label: "Samsung Galaxy S24",
    viewW: 320, viewH: 648,
    screenX: 14, screenY: 32, screenW: 292, screenH: 584, screenR: 28,
    aspect: "portrait",
    svgFrame: (color) => {
      const body = color === "silver" ? "#D8D8DA" : color === "navy" ? "#1B2B4B" : "#1C1C1E";
      const shine = color === "silver" ? "#F5F5F5" : color === "navy" ? "#2D4580" : "#2C2C2E";
      const btn = color === "silver" ? "#B8B8BA" : "#48484A";
      const isLight = color === "silver";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 648" width="320" height="648">
  <defs>
    <radialGradient id="androidBodyGrad" cx="35%" cy="20%" r="80%">
      <stop offset="0%" stop-color="${shine}"/>
      <stop offset="100%" stop-color="${body}"/>
    </radialGradient>
    <mask id="androidScreenHole">
      <rect x="0" y="0" width="320" height="648" fill="white"/>
      <rect x="14" y="32" width="292" height="584" rx="28" ry="28" fill="black"/>
    </mask>
  </defs>
  <!-- body, screen area masked out so the screenshot shows through -->
  <g mask="url(#androidScreenHole)">
    <rect x="0" y="0" width="320" height="648" rx="38" ry="38" fill="url(#androidBodyGrad)"/>
    <rect x="0" y="0" width="320" height="648" rx="38" ry="38" fill="none" stroke="${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}" stroke-width="1.5"/>
  </g>
  <!-- screen recess -->
  <rect x="14" y="32" width="292" height="584" rx="28" ry="28" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
  <!-- punch-hole camera — top center -->
  <circle cx="160" cy="54" r="14" fill="${isLight ? "#C0C0C0" : "#0C0C0C"}"/>
  <circle cx="160" cy="54" r="9" fill="${isLight ? "#909090" : "#1A1A1A"}"/>
  <circle cx="160" cy="54" r="5" fill="${isLight ? "#707070" : "#0A0A0A"}"/>
  <!-- camera lens glint -->
  <circle cx="157" cy="51" r="1.5" fill="${isLight ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)"}"/>
  <!-- volume buttons (left) -->
  <rect x="-3" y="198" width="5" height="56" rx="2.5" ry="2.5" fill="${btn}"/>
  <rect x="-3" y="268" width="5" height="56" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- power button (right) -->
  <rect x="318" y="226" width="5" height="72" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- bottom USB-C -->
  <rect x="138" y="638" width="44" height="6" rx="3" ry="3" fill="${isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.12)"}"/>
  <!-- speaker dots -->
  <g fill="${isLight ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.15)"}">
    <circle cx="126" cy="630" r="2.2"/><circle cx="135" cy="630" r="2.2"/><circle cx="144" cy="630" r="2.2"/>
    <circle cx="176" cy="630" r="2.2"/><circle cx="185" cy="630" r="2.2"/><circle cx="194" cy="630" r="2.2"/>
  </g>
</svg>`;
    },
  },

  ipad: {
    label: "iPad Pro 13\" (M4)",
    // 4:3 landscape — real ratio 281.6:215.5 ≈ 1.307, use 580×444
    viewW: 580, viewH: 444,
    screenX: 36, screenY: 28, screenW: 508, screenH: 388, screenR: 8,
    aspect: "landscape",
    svgFrame: (color) => {
      const body = color === "silver" ? "#E0E0E0" : color === "navy" ? "#1B2B4B" : "#1C1C1E";
      const shine = color === "silver" ? "#F8F8F8" : color === "navy" ? "#2D4580" : "#2C2C2E";
      const btn = color === "silver" ? "#C0C0C0" : "#48484A";
      const isLight = color === "silver";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 444" width="580" height="444">
  <defs>
    <linearGradient id="ipadGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${shine}"/>
      <stop offset="100%" stop-color="${body}"/>
    </linearGradient>
    <mask id="ipadScreenHole">
      <rect x="0" y="0" width="580" height="444" fill="white"/>
      <rect x="36" y="28" width="508" height="388" rx="8" ry="8" fill="black"/>
    </mask>
  </defs>
  <!-- body, screen area masked out -->
  <g mask="url(#ipadScreenHole)">
    <rect x="0" y="0" width="580" height="444" rx="24" ry="24" fill="url(#ipadGrad)"/>
    <rect x="0" y="0" width="580" height="444" rx="24" ry="24" fill="none" stroke="${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}" stroke-width="1.5"/>
  </g>
  <rect x="36" y="28" width="508" height="388" rx="8" ry="8" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
  <!-- landscape Face ID camera strip — top edge center -->
  <rect x="264" y="6" width="52" height="16" rx="8" ry="8" fill="${isLight ? "#C8C8C8" : "#141414"}"/>
  <circle cx="295" cy="14" r="5" fill="${isLight ? "#A0A0A0" : "#0E0E0E"}"/>
  <circle cx="295" cy="14" r="3" fill="${isLight ? "#808080" : "#1E1E1E"}"/>
  <!-- top button (power, right side in landscape = top) -->
  <rect x="540" y="-3" width="36" height="5" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- volume buttons (top edge, left cluster) -->
  <rect x="84" y="-3" width="28" height="5" rx="2.5" ry="2.5" fill="${btn}"/>
  <rect x="120" y="-3" width="28" height="5" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- USB-C (bottom edge center) -->
  <rect x="264" y="438" width="52" height="6" rx="3" ry="3" fill="${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}"/>
  <!-- Apple Pencil magnetic strip hint (right short edge) -->
  <rect x="573" y="100" width="5" height="244" rx="2.5" ry="2.5" fill="${isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}"/>
</svg>`;
    },
  },

  tablet: {
    label: "Samsung Galaxy Tab S9+",
    // 16:10 portrait — real ratio 285.4:185.4 ≈ 1.54, use 420×648
    viewW: 420, viewH: 648,
    screenX: 22, screenY: 38, screenW: 376, screenH: 572, screenR: 10,
    aspect: "portrait",
    svgFrame: (color) => {
      const body = color === "silver" ? "#D0D0D2" : color === "navy" ? "#1B2B4B" : "#1C1C1E";
      const shine = color === "silver" ? "#F0F0F0" : color === "navy" ? "#2D4580" : "#2C2C2E";
      const btn = color === "silver" ? "#B4B4B6" : "#48484A";
      const isLight = color === "silver";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 648" width="420" height="648">
  <defs>
    <linearGradient id="tabGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${shine}"/>
      <stop offset="100%" stop-color="${body}"/>
    </linearGradient>
    <mask id="tabScreenHole">
      <rect x="0" y="0" width="420" height="648" fill="white"/>
      <rect x="22" y="38" width="376" height="572" rx="10" ry="10" fill="black"/>
    </mask>
  </defs>
  <g mask="url(#tabScreenHole)">
    <rect x="0" y="0" width="420" height="648" rx="28" ry="28" fill="url(#tabGrad)"/>
    <rect x="0" y="0" width="420" height="648" rx="28" ry="28" fill="none" stroke="${isLight ? "rgba(0,0,0,0.1)" : "rgba(255,255,255,0.08)"}" stroke-width="1.5"/>
  </g>
  <rect x="22" y="38" width="376" height="572" rx="10" ry="10" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
  <!-- punch-hole camera — top center -->
  <circle cx="210" cy="58" r="13" fill="${isLight ? "#C0C0C0" : "#0C0C0C"}"/>
  <circle cx="210" cy="58" r="8" fill="${isLight ? "#909090" : "#1A1A1A"}"/>
  <circle cx="210" cy="58" r="4.5" fill="${isLight ? "#707070" : "#0A0A0A"}"/>
  <!-- power + fingerprint (right side) -->
  <rect x="418" y="198" width="5" height="56" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- volume (right side) -->
  <rect x="418" y="272" width="5" height="48" rx="2.5" ry="2.5" fill="${btn}"/>
  <rect x="418" y="328" width="5" height="48" rx="2.5" ry="2.5" fill="${btn}"/>
  <!-- USB-C bottom -->
  <rect x="188" y="640" width="44" height="5" rx="2.5" ry="2.5" fill="${isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)"}"/>
  <!-- speaker grille top/bottom -->
  <g fill="${isLight ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.14)"}">
    <circle cx="30" cy="20" r="2"/><circle cx="40" cy="20" r="2"/><circle cx="50" cy="20" r="2"/>
    <circle cx="370" cy="20" r="2"/><circle cx="380" cy="20" r="2"/><circle cx="390" cy="20" r="2"/>
    <circle cx="30" cy="628" r="2"/><circle cx="40" cy="628" r="2"/><circle cx="50" cy="628" r="2"/>
    <circle cx="370" cy="628" r="2"/><circle cx="380" cy="628" r="2"/><circle cx="390" cy="628" r="2"/>
  </g>
</svg>`;
    },
  },
};

/* ── New device configs added for Screenshot Studio ── */
const DEVICE_CONFIGS_EXTRA = {
  macbook: {
    label: "MacBook Pro",
    viewW: 780, viewH: 500,
    screenX: 80, screenY: 28, screenW: 620, screenH: 390, screenR: 4,
    aspect: "landscape",
    svgFrame: (color) => {
      const body = color === "silver" ? "#D0D0D0" : color === "navy" ? "#1B2B4B" : "#1C1C1E";
      const shine = color === "silver" ? "#F0F0F0" : color === "navy" ? "#2D4580" : "#2C2C2E";
      const isLight = color === "silver";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 500" width="780" height="500">
  <defs>
    <linearGradient id="mbGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${shine}"/><stop offset="100%" stop-color="${body}"/>
    </linearGradient>
    <mask id="mbHole">
      <rect x="0" y="0" width="780" height="500" fill="white"/>
      <rect x="80" y="28" width="620" height="390" rx="4" fill="black"/>
    </mask>
  </defs>
  <!-- lid body -->
  <g mask="url(#mbHole)">
    <rect x="0" y="0" width="780" height="440" rx="14" ry="14" fill="url(#mbGrad)"/>
    <rect x="0" y="0" width="780" height="440" rx="14" ry="14" fill="none" stroke="${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)"}" stroke-width="1.5"/>
  </g>
  <!-- screen border -->
  <rect x="80" y="28" width="620" height="390" rx="4" fill="none" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
  <!-- camera -->
  <circle cx="390" cy="16" r="4" fill="${isLight ? "#A0A0A0" : "#0A0A0A"}"/>
  <!-- base/keyboard -->
  <rect x="-20" y="436" width="820" height="28" rx="4" fill="${isLight ? "#C8C8C8" : "#2A2A2C"}"/>
  <rect x="260" y="452" width="260" height="8" rx="4" fill="${isLight ? "#B0B0B0" : "#1A1A1C"}"/>
  <!-- notch at bottom of base -->
  <rect x="330" y="464" width="120" height="6" rx="3" fill="${isLight ? "#B8B8BA" : "#222224"}"/>
</svg>`;
    },
  },

  browser: {
    label: "Browser Chrome",
    viewW: 680, viewH: 460,
    screenX: 8, screenY: 58, screenW: 664, screenH: 394, screenR: 0,
    aspect: "landscape",
    svgFrame: (color) => {
      const chrome = color === "silver" ? "#F5F5F5" : color === "navy" ? "#1A2A44" : "#2C2C2E";
      const bar = color === "silver" ? "#E8E8E8" : color === "navy" ? "#233355" : "#3A3A3C";
      const dot1 = "#FF5F56", dot2 = "#FFBD2E", dot3 = "#27C93F";
      const urlBg = color === "silver" ? "#FFFFFF" : color === "navy" ? "#2D4060" : "#48484A";
      const isLight = color === "silver";
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 460" width="680" height="460">
  <defs>
    <mask id="browserHole">
      <rect x="0" y="0" width="680" height="460" fill="white"/>
      <rect x="8" y="58" width="664" height="394" fill="black"/>
    </mask>
  </defs>
  <!-- window body -->
  <g mask="url(#browserHole)">
    <rect x="0" y="0" width="680" height="460" rx="10" ry="10" fill="${chrome}"/>
  </g>
  <!-- top chrome bar -->
  <rect x="0" y="0" width="680" height="58" rx="10" ry="10" fill="${bar}"/>
  <rect x="0" y="40" width="680" height="18" fill="${bar}"/>
  <!-- traffic lights -->
  <circle cx="26" cy="18" r="7" fill="${dot1}"/>
  <circle cx="48" cy="18" r="7" fill="${dot2}"/>
  <circle cx="70" cy="18" r="7" fill="${dot3}"/>
  <!-- URL bar -->
  <rect x="120" y="8" width="440" height="20" rx="10" fill="${urlBg}"/>
  <rect x="200" y="12.5" width="200" height="11" rx="5.5" fill="${isLight ? "#D0D0D0" : "#5A5A5C"}"/>
  <!-- tab bar -->
  <rect x="8" y="36" width="180" height="22" rx="6" ry="6" fill="${urlBg}"/>
  <rect x="8" y="52" width="180" height="6" fill="${urlBg}"/>
  <rect x="8" y="55" width="680" height="3" fill="${bar}"/>
  <!-- window border -->
  <rect x="0" y="0" width="680" height="460" rx="10" ry="10" fill="none" stroke="${isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.08)"}" stroke-width="1.5"/>
</svg>`;
    },
  },
};

/* Merge extra devices into the main config */
Object.assign(DEVICE_CONFIGS, DEVICE_CONFIGS_EXTRA);

/* ── Gradient presets ── */
const BG_GRADIENTS = {
  "cyberpunk":  { name: "Cyberpunk",    stops: ["#7B2FFF","#00E5FF"], angle: 135 },
  "sunset":     { name: "Sunset Glow",  stops: ["#FF6B9D","#FFB347"], angle: 135 },
  "dark":       { name: "Dark Obsidian",stops: ["#0F0F1A","#1A1A2E"], angle: 180 },
  "mint":       { name: "Mint Emerald", stops: ["#00B894","#0984E3"], angle: 135 },
  "midnight":   { name: "Midnight Neon",stops: ["#2D1B69","#11998E"], angle: 135 },
  "cosmic":     { name: "Cosmic Purple",stops: ["#6C3483","#E91E8C"], angle: 135 },
  "ocean":      { name: "Ocean Breeze", stops: ["#0099F7","#F11712"], angle: 135 },
  "solar":      { name: "Solar Flare",  stops: ["#F7971E","#FFD200"], angle: 135 },
  "light":      { name: "Clean White",  stops: ["#F5F7FA","#C3CFE2"], angle: 180 },
  "none":       { name: "None (transparent)", stops: null, angle: 0 },
};

/* Quick style presets — device + color + gradient + text combo */
const QUICK_STYLES = [
  { label: "📱 App Store Hero",   device: "iphone",  color: "black",  gradient: "cyberpunk", headline: "Your App Name", sub: "Download on the App Store" },
  { label: "🤖 Play Store",       device: "android", color: "black",  gradient: "mint",      headline: "Available on Android", sub: "Get it on Google Play" },
  { label: "💻 SaaS Laptop",      device: "macbook", color: "silver", gradient: "dark",      headline: "Build Faster", sub: "Professional tools for your workflow" },
  { label: "🌐 Browser Showcase", device: "browser", color: "silver", gradient: "light",     headline: "Powerful in the browser", sub: "No downloads needed" },
  { label: "📱 Neon Dark",        device: "iphone",  color: "black",  gradient: "midnight",  headline: "Go Pro", sub: "Upgrade your experience" },
  { label: "🌅 Warm Launch",      device: "iphone",  color: "silver", gradient: "sunset",    headline: "Introducing", sub: "The next generation" },
];

function initDeviceScreenshotTool() {
  let selectedFile   = null;
  let selectedDevice = "iphone";
  let selectedColor  = "black";
  let selectedGrad   = "cyberpunk";
  let headline       = "";
  let subtitle       = "";
  let tilt3d         = 0;
  let showStatusBar  = false;
  let bulkFiles      = [];

  const outputEl = document.getElementById("deviceOut");

  /* ── wire device seg ── */
  document.querySelectorAll("#deviceSeg button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#deviceSeg button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      selectedDevice = btn.dataset.dev;
      if (selectedFile) renderStudio();
    };
  });

  /* ── wire color seg ── */
  document.querySelectorAll("#deviceColorSeg button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#deviceColorSeg button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      selectedColor = btn.dataset.color;
      if (selectedFile) renderStudio();
    };
  });

  /* ── wire gradient seg ── */
  document.querySelectorAll("#gradientSeg button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#gradientSeg button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      selectedGrad = btn.dataset.grad;
      if (selectedFile) renderStudio();
    };
  });

  /* ── text inputs ── */
  const headlineEl = document.getElementById("deviceHeadline");
  const subtitleEl = document.getElementById("deviceSubtitle");
  if (headlineEl) headlineEl.addEventListener("input", () => { headline = headlineEl.value; if (selectedFile) renderStudio(); });
  if (subtitleEl) subtitleEl.addEventListener("input", () => { subtitle = subtitleEl.value; if (selectedFile) renderStudio(); });

  /* ── tilt ── */
  const tiltEl = document.getElementById("deviceTilt");
  const tiltValEl = document.getElementById("deviceTiltVal");
  if (tiltEl) {
    tiltEl.addEventListener("input", () => {
      tilt3d = +tiltEl.value;
      if (tiltValEl) tiltValEl.textContent = tilt3d + "°";
      if (selectedFile) renderStudio();
    });
  }

  /* ── status bar toggle ── */
  const statusBarEl = document.getElementById("deviceStatusBar");
  if (statusBarEl) statusBarEl.addEventListener("change", () => { showStatusBar = statusBarEl.checked; if (selectedFile) renderStudio(); });

  /* ── quick styles ── */
  document.querySelectorAll("#quickStyleSeg button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#quickStyleSeg button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      const idx = +btn.dataset.style;
      const s = QUICK_STYLES[idx];
      selectedDevice = s.device;
      selectedColor  = s.color;
      selectedGrad   = s.gradient;
      headline       = s.headline;
      subtitle       = s.sub;
      if (headlineEl) headlineEl.value = headline;
      if (subtitleEl) subtitleEl.value = subtitle;
      // sync UI segs
      document.querySelectorAll("#deviceSeg button").forEach(b => b.classList.toggle("on", b.dataset.dev === selectedDevice));
      document.querySelectorAll("#deviceColorSeg button").forEach(b => b.classList.toggle("on", b.dataset.color === selectedColor));
      document.querySelectorAll("#gradientSeg button").forEach(b => b.classList.toggle("on", b.dataset.grad === selectedGrad));
      if (selectedFile) renderStudio();
    };
  });

  /* ── main drop zone ── */
  bindDropZone(document.getElementById("deviceDrop"), document.getElementById("deviceFile"), file => {
    selectedFile = file;
    bulkFiles = [file];
    document.getElementById("deviceBulkCount").textContent = "";
    renderStudio();
  });

  /* ── bulk upload ── */
  const bulkInput = document.getElementById("deviceBulkFile");
  if (bulkInput) {
    bulkInput.addEventListener("change", () => {
      bulkFiles = Array.from(bulkInput.files);
      if (!bulkFiles.length) return;
      selectedFile = bulkFiles[0];
      document.getElementById("deviceBulkCount").textContent = `${bulkFiles.length} files loaded`;
      renderStudio();
    });
  }

  /* ── bulk export ── */
  const bulkExportBtn = document.getElementById("deviceBulkExport");
  if (bulkExportBtn) {
    bulkExportBtn.onclick = async () => {
      if (!bulkFiles.length) return;
      outputEl.className = "tool-out";
      outputEl.textContent = `Rendering ${bulkFiles.length} images…`;
      try {
        const blobs = [];
        for (let i = 0; i < bulkFiles.length; i++) {
          selectedFile = bulkFiles[i];
          const blob = await renderToBlob();
          blobs.push({ blob, name: `screenshot-${i + 1}-${selectedDevice}.png` });
        }
        // Build ZIP using a tiny self-contained CRC32 + ZIP writer
        const zipBlob = buildZip(blobs);
        triggerDownload(zipBlob, "screenshots.zip");
        showToast(`Downloaded ${blobs.length} screenshots as ZIP`);
        outputEl.className = "tool-out ok";
        outputEl.textContent = `${blobs.length} screenshots exported.`;
      } catch (err) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Export failed: " + err.message;
      }
    };
  }

  /* ── RENDER ── */
  async function renderStudio() {
    outputEl.className = "tool-out";
    outputEl.textContent = "Rendering…";
    try {
      const blob = await renderToBlob();
      const url  = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "";
      const cfg = DEVICE_CONFIGS[selectedDevice];
      // preview (max 380px wide)
      const maxW = 380;
      const totalW = cfg.viewW + 40; // device + padding
      const previewScale = Math.min(1, maxW / totalW);
      const img = document.createElement("img");
      img.src = url;
      img.style.cssText = `max-width:100%;display:block;margin-bottom:12px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.18)`;
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn primary sm";
      dlBtn.textContent = `Download PNG`;
      dlBtn.onclick = () => triggerDownload(blob, `screenshot-${selectedDevice}.png`);
      outputEl.appendChild(img);
      outputEl.appendChild(dlBtn);
    } catch (err) {
      console.error(err);
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not render: " + err.message;
    }
  }

  async function renderToBlob() {
    const cfg   = DEVICE_CONFIGS[selectedDevice];
    const scale = 3; // 3× → ~1080px wide phone = retina quality
    const PAD   = 80 * scale; // padding around device
    const EXTRA_TOP = (headline || subtitle) ? 160 * scale : 60 * scale;

    const totalW = cfg.viewW * scale + PAD * 2;
    const totalH = cfg.viewH * scale + PAD * 2 + EXTRA_TOP;

    const canvas = document.createElement("canvas");
    canvas.width  = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext("2d");

    // ── 1. Background ──
    const grad = BG_GRADIENTS[selectedGrad];
    if (grad.stops) {
      const rad = (grad.angle * Math.PI) / 180;
      const x1 = totalW / 2 - Math.cos(rad) * totalW / 2;
      const y1 = totalH / 2 - Math.sin(rad) * totalH / 2;
      const x2 = totalW / 2 + Math.cos(rad) * totalW / 2;
      const y2 = totalH / 2 + Math.sin(rad) * totalH / 2;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, grad.stops[0]);
      g.addColorStop(1, grad.stops[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, totalW, totalH);
    } else {
      ctx.clearRect(0, 0, totalW, totalH);
    }

    // ── 2. Headline / subtitle text ──
    if (headline || subtitle) {
      ctx.textAlign = "center";
      if (headline) {
        const fs = Math.round(38 * scale);
        ctx.font = `800 ${fs}px "IBM Plex Sans", "Inter", system-ui, sans-serif`;
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = "rgba(0,0,0,0.3)";
        ctx.shadowBlur = 8 * scale;
        ctx.fillText(headline, totalW / 2, 68 * scale);
        ctx.shadowBlur = 0;
      }
      if (subtitle) {
        const fs = Math.round(18 * scale);
        ctx.font = `500 ${fs}px "IBM Plex Sans", "Inter", system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.78)";
        ctx.fillText(subtitle, totalW / 2, (headline ? 108 : 80) * scale);
      }
    }

    // ── 3. Device frame ──
    const deviceX = PAD;
    const deviceY = EXTRA_TOP;
    const cw = cfg.viewW * scale;
    const ch = cfg.viewH * scale;

    // Draw screenshot into screen area
    const screenshot = await loadImageFromFile(selectedFile);
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width  = cfg.screenW * scale;
    screenCanvas.height = cfg.screenH * scale;
    const sCtx = screenCanvas.getContext("2d");

    // Status bar overlay (9:41 style) on portrait phone screens
    if (showStatusBar && cfg.aspect === "portrait") {
      sCtx.fillStyle = "#000";
      sCtx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
    }

    const imgAspect    = screenshot.width / screenshot.height;
    const screenAspect = cfg.screenW / cfg.screenH;
    let dw, dh, dx, dy;
    if (imgAspect > screenAspect) {
      dh = screenCanvas.height; dw = dh * imgAspect;
      dx = -(dw - screenCanvas.width) / 2; dy = 0;
    } else {
      dw = screenCanvas.width; dh = dw / imgAspect;
      dx = 0; dy = -(dh - screenCanvas.height) / 2;
    }
    sCtx.drawImage(screenshot, dx, dy, dw, dh);

    if (showStatusBar && cfg.aspect === "portrait") {
      const barH = 20 * scale;
      sCtx.fillStyle = "rgba(0,0,0,0.55)";
      sCtx.fillRect(0, 0, screenCanvas.width, barH);
      sCtx.font = `700 ${11 * scale}px "IBM Plex Mono", monospace`;
      sCtx.fillStyle = "#fff";
      sCtx.textAlign = "left";
      sCtx.fillText("9:41", 12 * scale, 14 * scale);
      sCtx.textAlign = "right";
      sCtx.fillText("WiFi ▪ 100%", screenCanvas.width - 10 * scale, 14 * scale);
    }

    // Load SVG frame
    const svgString = cfg.svgFrame(selectedColor);
    const svgBlob   = new Blob([svgString], { type: "image/svg+xml" });
    const svgUrl    = URL.createObjectURL(svgBlob);
    const frameImg  = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = svgUrl;
    });

    // Apply 3D perspective tilt using CSS transform simulation on canvas
    if (tilt3d !== 0) {
      ctx.save();
      const tiltRad = (tilt3d * Math.PI) / 180;
      const perspective = 800 * scale;
      // Simple Y-axis rotation approximation
      const shrinkFactor = Math.cos(tiltRad);
      const xShift = (1 - shrinkFactor) * cw / 2;
      ctx.translate(deviceX + xShift, deviceY);
      ctx.transform(shrinkFactor, Math.sin(tiltRad) * 0.08, 0, 1, 0, 0);
      // Black screen backing
      ctx.save();
      roundRect(ctx, cfg.screenX * scale, cfg.screenY * scale, cfg.screenW * scale * shrinkFactor + xShift, cfg.screenH * scale, (cfg.screenR || 8) * scale);
      ctx.fillStyle = "#000"; ctx.fill();
      ctx.restore();
      // Screenshot clipped
      ctx.save();
      roundRect(ctx, cfg.screenX * scale, cfg.screenY * scale, cfg.screenW * scale, cfg.screenH * scale, (cfg.screenR || 8) * scale);
      ctx.clip();
      ctx.drawImage(screenCanvas, cfg.screenX * scale, cfg.screenY * scale);
      ctx.restore();
      ctx.drawImage(frameImg, 0, 0, cw, ch);
      ctx.restore();
    } else {
      // Flat (no tilt)
      ctx.save();
      roundRect(ctx, deviceX + cfg.screenX * scale, deviceY + cfg.screenY * scale,
                cfg.screenW * scale, cfg.screenH * scale, (cfg.screenR || 8) * scale);
      ctx.fillStyle = "#000"; ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(ctx, deviceX + cfg.screenX * scale, deviceY + cfg.screenY * scale,
                cfg.screenW * scale, cfg.screenH * scale, (cfg.screenR || 8) * scale);
      ctx.clip();
      ctx.drawImage(screenCanvas, deviceX + cfg.screenX * scale, deviceY + cfg.screenY * scale);
      ctx.restore();
      ctx.drawImage(frameImg, deviceX, deviceY, cw, ch);
    }

    URL.revokeObjectURL(svgUrl);
    return await canvasToBlob(canvas, "image/png");
  }
}

/* ── Minimal ZIP builder — no external library ── */
function buildZip(files) {
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = buildCrcTable();
    for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xFF];
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function buildCrcTable() {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  }
  function u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
  function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; }

  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const { blob, name } of files) {
    const data = new Uint8Array(blob._buf || (() => {
      // We need sync access — caller must have pre-converted blobs to ArrayBuffers
      throw new Error("Use renderToBlobSync");
    })());
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = new Uint8Array([
      0x50,0x4B,0x03,0x04, // local file header sig
      20,0, // version needed
      0,0,  // flags
      0,0,  // compression (stored)
      0,0,0,0, // mod time/date
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      0,0,  // extra length
    ]);
    const headerAndData = new Uint8Array(local.length + nameBytes.length + data.length);
    headerAndData.set(local);
    headerAndData.set(nameBytes, local.length);
    headerAndData.set(data, local.length + nameBytes.length);
    parts.push(headerAndData);

    const cd = new Uint8Array([
      0x50,0x4B,0x01,0x02, // central dir sig
      20,0, 20,0, 0,0, 0,0, 0,0,0,0,
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      0,0,0,0,0,0,0,0,0,0,0,0,
      ...u32(offset),
    ]);
    const cdFull = new Uint8Array(cd.length + nameBytes.length);
    cdFull.set(cd); cdFull.set(nameBytes, cd.length);
    centralDir.push(cdFull);
    offset += headerAndData.length;
  }

  const cdSize = centralDir.reduce((s, b) => s + b.length, 0);
  const eocd = new Uint8Array([
    0x50,0x4B,0x05,0x06, 0,0, 0,0,
    ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset),
    0,0,
  ]);

  return new Blob([...parts, ...centralDir, eocd], { type: "application/zip" });
}


/** Draws a rounded rectangle path. Works as a clip region too. */
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
