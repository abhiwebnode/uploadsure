/*
  image-basic-tools.js
  ----------------------
  Compress, Resize, and Convert. All three are batch-capable and
  hand the actual pixel work to the worker (js/image-worker.js) via
  worker-client.js, so a batch of many images doesn't freeze the tab
  on a low-end phone. The main thread here just orchestrates:
  decode the file, hand a bitmap to the worker, wire up the result.
*/

function initCompressTool() {
  const dropZone = document.getElementById("cDrop");
  const fileInput = document.getElementById("cFile");
  const progressEl = document.getElementById("cProg");
  const listEl = document.getElementById("cList");
  const outputEl = document.getElementById("cOut");

  bindDropZone(dropZone, fileInput, (files) => {
    outputEl.className = "tool-out";
    outputEl.textContent = "";
    const maxKilobytes = +document.getElementById("cKB").value || 50;

    processFilesInBatch(files, progressEl, listEl, async (file) => {
      const image = await loadImageFromFile(file);
      const bitmap = await createImageBitmap(image);
      const { blob } = await workerCompressUnderSize(bitmap, "image/jpeg", maxKilobytes);
      return {
        blob,
        name: file.name.replace(/\.\w+$/, "") + `_${maxKilobytes}kb.jpg`,
        label: `${formatKilobytes(blob.size)} KB`,
      };
    }, (results) => {
      if (!results.length) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Could not process those images.";
        return;
      }
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${results.length} image(s) compressed. `;
      const downloadAllBtn = document.createElement("button");
      downloadAllBtn.className = "btn sm";
      downloadAllBtn.style.marginLeft = "6px";
      downloadAllBtn.textContent = "Download all";
      downloadAllBtn.onclick = () => {
        results.forEach((r) => triggerDownload(r.blob, r.name));
        showToast("Downloading " + results.length + " file(s)");
      };
      outputEl.appendChild(downloadAllBtn);
    });
  });
}

function initResizeTool() {
  const dropZone = document.getElementById("rDrop");
  const fileInput = document.getElementById("rFile");
  const progressEl = document.getElementById("rProg");
  const listEl = document.getElementById("rList");
  const outputEl = document.getElementById("rOut");

  bindDropZone(dropZone, fileInput, (files) => {
    outputEl.className = "tool-out";
    outputEl.textContent = "";
    const targetWidth = +document.getElementById("rW").value;
    const targetHeight = +document.getElementById("rH").value;

    processFilesInBatch(files, progressEl, listEl, async (file) => {
      const mimeType = detectImageMimeType(file);
      const image = await loadImageFromFile(file);
      const bitmap = await createImageBitmap(image);
      const { blob } = await workerResizeExact(bitmap, mimeType, targetWidth, targetHeight);
      return {
        blob,
        name: file.name.replace(/\.\w+$/, "") + `_${targetWidth}x${targetHeight}.` + FORMAT_EXTENSIONS[mimeType],
        label: `${targetWidth}×${targetHeight}`,
      };
    }, (results) => {
      if (!results.length) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Could not process those images.";
        return;
      }
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${results.length} image(s) resized. `;
      const downloadAllBtn = document.createElement("button");
      downloadAllBtn.className = "btn sm";
      downloadAllBtn.style.marginLeft = "6px";
      downloadAllBtn.textContent = "Download all";
      downloadAllBtn.onclick = () => {
        results.forEach((r) => triggerDownload(r.blob, r.name));
        showToast("Downloading " + results.length + " file(s)");
      };
      outputEl.appendChild(downloadAllBtn);
    });
  });
}

function initConvertTool() {
  const dropZone = document.getElementById("vDrop");
  const fileInput = document.getElementById("vFile");
  const progressEl = document.getElementById("vProg");
  const listEl = document.getElementById("vList");
  const outputEl = document.getElementById("vOut");

  // Format definitions — mime: what canvas.toBlob uses, ext: file extension,
  // note: shown if browser support is not universal
  const FORMATS = [
    { id: "jpeg",  label: "JPG",  mime: "image/jpeg",  ext: "jpg" },
    { id: "png",   label: "PNG",  mime: "image/png",   ext: "png" },
    { id: "webp",  label: "WebP", mime: "image/webp",  ext: "webp" },
    { id: "avif",  label: "AVIF", mime: "image/avif",  ext: "avif", note: "Chrome/Firefox only" },
    { id: "bmp",   label: "BMP",  mime: "image/bmp",   ext: "bmp",  note: "Chrome only" },
    { id: "ico",   label: "ICO",  mime: "__ico__",     ext: "ico",  note: "Favicon format" },
    { id: "svg",   label: "SVG",  mime: "__svg__",     ext: "svg",  note: "Embeds image in SVG" },
  ];

  let selectedFormat = FORMATS[0];

  // Populate seg buttons dynamically
  const seg = document.getElementById("convSeg");
  seg.innerHTML = "";
  FORMATS.forEach((f, i) => {
    const btn = document.createElement("button");
    btn.textContent = f.label;
    btn.title = f.note || "";
    if (i === 0) btn.classList.add("on");
    btn.onclick = () => {
      seg.querySelectorAll("button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      selectedFormat = f;
      // Show note if any
      const noteEl = document.getElementById("vConvNote");
      if (noteEl) noteEl.textContent = f.note ? `Note: ${f.note}` : "";
    };
    seg.appendChild(btn);
  });

  bindDropZone(dropZone, fileInput, (files) => {
    outputEl.className = "tool-out";
    outputEl.textContent = "";

    processFilesInBatch(files, progressEl, listEl, async (file) => {
      const image = await loadImageFromFile(file);

      // ICO: reuse our existing buildIco function
      if (selectedFormat.mime === "__ico__") {
        const sizes = [16, 32, 48];
        const pngBuffers = [];
        for (const size of sizes) {
          const c = document.createElement("canvas");
          c.width = c.height = size;
          c.getContext("2d").drawImage(image, 0, 0, size, size);
          const dataUrl = c.toDataURL("image/png");
          const binary = atob(dataUrl.split(",")[1]);
          const buf = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) buf[j] = binary.charCodeAt(j);
          pngBuffers.push({ size, buffer: buf });
        }
        const blob = buildIco(pngBuffers);
        return {
          blob,
          name: file.name.replace(/\.\w+$/, "") + ".ico",
          label: "ICO (16/32/48px)",
        };
      }

      // SVG embed
      if (selectedFormat.mime === "__svg__") {
        const canvas = document.createElement("canvas");
        canvas.width = image.width; canvas.height = image.height;
        canvas.getContext("2d").drawImage(image, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}"><image href="${dataUrl}" width="${image.width}" height="${image.height}"/></svg>`;
        const blob = new Blob([svg], { type: "image/svg+xml" });
        return {
          blob,
          name: file.name.replace(/\.\w+$/, "") + ".svg",
          label: "SVG (embedded)",
        };
      }

      // All other formats: canvas toBlob
      const bitmap = await createImageBitmap(image);
      // For JPEG output, white-fill needed (no alpha); others keep transparency
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      if (selectedFormat.mime === "image/jpeg" || selectedFormat.mime === "image/bmp") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(bitmap, 0, 0);

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error(`Browser does not support ${selectedFormat.label} output`)),
          selectedFormat.mime, 0.95);
      });

      return {
        blob,
        name: file.name.replace(/\.\w+$/, "") + "." + selectedFormat.ext,
        label: selectedFormat.label,
      };
    }, (results) => {
      if (!results.length) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Could not convert those images. If you chose AVIF or BMP, try a different browser.";
        return;
      }
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${results.length} image(s) converted. `;
      const downloadAllBtn = document.createElement("button");
      downloadAllBtn.className = "btn sm";
      downloadAllBtn.style.marginLeft = "6px";
      downloadAllBtn.textContent = "Download all";
      downloadAllBtn.onclick = () => {
        results.forEach((r) => triggerDownload(r.blob, r.name));
        showToast("Downloading " + results.length + " file(s)");
      };
      outputEl.appendChild(downloadAllBtn);
    });
  });
}

/*
  Rotate and Watermark stay on the main thread on purpose: they run on
  one image at a time and need to redraw instantly as the user moves a
  slider, which is exactly the case where handing off to a worker would
  add latency (a postMessage round-trip) without solving a real freeze
  risk. The worker is reserved for batches and large re-encodes.
*/

function initRotateTool() {
  let quickAngle = 0;
  let flipHorizontal = false;
  let selectedFile = null;

  document.querySelectorAll("#rotSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#rotSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      quickAngle = +button.dataset.a;
      document.getElementById("rotFine").value = 0;
      if (selectedFile) applyRotation();
    };
  });

  document.getElementById("rotFlip").onclick = (e) => {
    e.preventDefault();
    flipHorizontal = !flipHorizontal;
    document.getElementById("rotFlip").style.color = flipHorizontal ? "var(--ink)" : "";
    showToast(flipHorizontal ? "Flip enabled" : "Flip disabled");
    if (selectedFile) applyRotation();
  };

  bindDropZone(document.getElementById("oDrop"), document.getElementById("oFile"), (file) => {
    selectedFile = file;
    applyRotation();
  });
  document.getElementById("rotFine").addEventListener("input", () => { if (selectedFile) applyRotation(); });

  async function applyRotation() {
    const outputEl = document.getElementById("oOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Rotating…";
    try {
      const image = await loadImageFromFile(selectedFile);
      const fineAngle = +document.getElementById("rotFine").value;
      const totalRadians = (quickAngle + fineAngle) * Math.PI / 180;
      const cos = Math.abs(Math.cos(totalRadians));
      const sin = Math.abs(Math.sin(totalRadians));
      const outWidth = Math.round(image.width * cos + image.height * sin);
      const outHeight = Math.round(image.width * sin + image.height * cos);

      const canvas = document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, outWidth, outHeight);
      ctx.translate(outWidth / 2, outHeight / 2);
      ctx.rotate(totalRadians);
      if (flipHorizontal) ctx.scale(-1, 1);
      ctx.drawImage(image, -image.width / 2, -image.height / 2);

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const objectUrl = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Rotated ${quickAngle + fineAngle}°${flipHorizontal ? " + flipped" : ""}. `;
      const previewImg = document.createElement("img");
      previewImg.src = objectUrl;
      previewImg.style.cssText = "width:56px;height:56px;object-fit:contain;border-radius:6px;border:1px solid var(--border);vertical-align:middle;margin:6px 8px 0 0;background:var(--surface-2)";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download";
      downloadBtn.onclick = () => triggerDownload(blob, "rotated.jpg");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(previewImg);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not rotate that image.";
    }
  }
}

function initWatermarkTool() {
  let selectedPosition = "center";
  document.querySelectorAll("#wmSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#wmSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      selectedPosition = button.dataset.p;
    };
  });

  bindDropZone(document.getElementById("wDrop"), document.getElementById("wFile"), async (file) => {
    const outputEl = document.getElementById("wOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Stamping…";
    try {
      const image = await loadImageFromFile(file);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      const text = document.getElementById("wmText").value || "SAMPLE";
      const opacity = (+document.getElementById("wmOpacity").value) / 100;
      const fontSize = Math.max(16, Math.round(image.width / 14));
      ctx.globalAlpha = opacity;
      ctx.fillStyle = "#808080";
      ctx.textBaseline = "middle";
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textAlign = "center";

      if (selectedPosition === "center") {
        ctx.save();
        ctx.translate(image.width / 2, image.height / 2);
        ctx.rotate(-Math.PI / 12);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      } else if (selectedPosition === "corner") {
        ctx.font = `700 ${Math.round(fontSize * 0.5)}px sans-serif`;
        ctx.textAlign = "right";
        ctx.fillText(text, image.width - 14, image.height - 14);
      } else {
        ctx.save();
        ctx.rotate(-Math.PI / 12);
        const stepX = fontSize * text.length * 0.62 + 40;
        const stepY = fontSize * 2.4;
        for (let y = -image.height; y < image.height * 2; y += stepY) {
          for (let x = -image.width; x < image.width * 2; x += stepX) {
            ctx.fillText(text, x, y);
          }
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const objectUrl = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "Watermark applied. ";
      const previewImg = document.createElement("img");
      previewImg.src = objectUrl;
      previewImg.style.cssText = "width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);vertical-align:middle;margin:6px 8px 0 0";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download";
      downloadBtn.onclick = () => triggerDownload(blob, "watermarked.jpg");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(previewImg);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not watermark that image.";
    }
  });
}
