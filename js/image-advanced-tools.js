/*
  image-advanced-tools.js
  -------------------------
  Upscale and Remove Background. Both are real, working operations —
  and both are honestly labeled as best-effort in the UI, because
  neither is what "AI upscale" or "AI background removal" usually
  means (no super-resolution model, no segmentation model). See the
  .disclaimer text next to each tool for the user-facing version of
  this same point.
*/

function initUpscaleTool() {
  let scaleFactor = 2;
  document.querySelectorAll("#upSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#upSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      scaleFactor = +button.dataset.s;
    };
  });

  bindDropZone(document.getElementById("uDrop"), document.getElementById("uFile"), async (file) => {
    const outputEl = document.getElementById("uOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Upscaling…";
    try {
      const image = await loadImageFromFile(file);
      const targetWidth = image.width * scaleFactor;
      const targetHeight = image.height * scaleFactor;

      // Two-pass scaling gives a visibly cleaner result than one big
      // stretch — still just smoothing, not invented detail.
      const midCanvas = document.createElement("canvas");
      midCanvas.width = Math.round(image.width * Math.sqrt(scaleFactor));
      midCanvas.height = Math.round(image.height * Math.sqrt(scaleFactor));
      const midCtx = midCanvas.getContext("2d");
      midCtx.imageSmoothingQuality = "high";
      midCtx.drawImage(image, 0, 0, midCanvas.width, midCanvas.height);

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = targetWidth;
      finalCanvas.height = targetHeight;
      const finalCtx = finalCanvas.getContext("2d");
      finalCtx.imageSmoothingQuality = "high";
      finalCtx.drawImage(midCanvas, 0, 0, targetWidth, targetHeight);
      finalCtx.filter = "contrast(1.05) saturate(1.03)";
      finalCtx.drawImage(finalCanvas, 0, 0);
      finalCtx.filter = "none";

      const blob = await canvasToBlob(finalCanvas, "image/jpeg", 0.92);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Upscaled to <b>${targetWidth}×${targetHeight}px</b> (${scaleFactor}×). `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download";
      downloadBtn.onclick = () => triggerDownload(blob, `upscaled_${scaleFactor}x.jpg`);
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not upscale that image.";
    }
  });
}

function initRemoveBackgroundTool() {
  bindDropZone(document.getElementById("bgDrop"), document.getElementById("bgFile"), async (file) => {
    const outputEl = document.getElementById("bgOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Removing background…";
    try {
      const image = await loadImageFromFile(file);
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);

      const tolerance = +document.getElementById("bgTol").value;
      const width = canvas.width, height = canvas.height;
      const cornerSamples = [[2, 2], [width - 3, 2], [2, height - 3], [width - 3, height - 3]];
      const imageData = ctx.getImageData(0, 0, width, height);

      let avgRed = 0, avgGreen = 0, avgBlue = 0;
      cornerSamples.forEach(([x, y]) => {
        const i = (y * width + x) * 4;
        avgRed += imageData.data[i];
        avgGreen += imageData.data[i + 1];
        avgBlue += imageData.data[i + 2];
      });
      avgRed /= 4; avgGreen /= 4; avgBlue /= 4;

      const pixels = imageData.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const distance = Math.sqrt(
          (pixels[i] - avgRed) ** 2 + (pixels[i + 1] - avgGreen) ** 2 + (pixels[i + 2] - avgBlue) ** 2
        );
        if (distance < tolerance) pixels[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);

      const blob = await canvasToBlob(canvas, "image/png");
      const objectUrl = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "Background removed where it was plain enough to detect. ";
      const previewImg = document.createElement("img");
      previewImg.src = objectUrl;
      previewImg.style.cssText = "width:56px;height:56px;object-fit:contain;border-radius:6px;border:1px solid var(--border);vertical-align:middle;margin:6px 8px 0 0;background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0 0/10px 10px";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PNG";
      downloadBtn.onclick = () => triggerDownload(blob, "no-bg.png");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(previewImg);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not process that image.";
    }
  });
}
