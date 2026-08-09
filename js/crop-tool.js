/*
  crop-tool.js
  -------------
  The interactive crop box needs to redraw on every pointer-move
  event, so its dragging/resizing logic stays on the main thread —
  that's cheap DOM/CSS work, not pixel processing. Only the final
  "Apply crop" step, which decodes and re-encodes the full-resolution
  image, is handed to the worker.
*/

function initCropTool() {
  const imageEl = document.getElementById("xImg");
  const stageEl = document.getElementById("xStage");
  const boxEl = document.getElementById("xBox");
  const handleEl = document.getElementById("xHandle");

  let sourceImage = null;
  let box = { x: 40, y: 40, width: 120, height: 120 };
  let activeDrag = null;

  bindDropZone(document.getElementById("xDrop"), document.getElementById("xFile"), async (file) => {
    try {
      sourceImage = await loadImageFromFile(file);
      imageEl.src = sourceImage.src;
      document.getElementById("xEditor").style.display = "block";
      await new Promise((resolve) => { if (imageEl.complete) resolve(); else imageEl.onload = resolve; });
      resetBoxToDefault();
    } catch (error) {
      showToast("Could not read that image");
    }
  });

  function targetAspectRatio() {
    const width = Math.max(1, +document.getElementById("xW").value || 1);
    const height = Math.max(1, +document.getElementById("xH").value || 1);
    return width / height;
  }

  function resetBoxToDefault() {
    const displayWidth = imageEl.clientWidth;
    const displayHeight = imageEl.clientHeight;
    const zoomFraction = +document.getElementById("xZoom").value / 100;
    const aspect = targetAspectRatio();

    let boxWidth = displayWidth * zoomFraction;
    let boxHeight = boxWidth / aspect;
    if (boxHeight > displayHeight) {
      boxHeight = displayHeight * zoomFraction;
      boxWidth = boxHeight * aspect;
    }
    box = { x: (displayWidth - boxWidth) / 2, y: (displayHeight - boxHeight) / 2, width: boxWidth, height: boxHeight };
    paintBox();
  }

  function paintBox() {
    boxEl.style.left = box.x + "px";
    boxEl.style.top = box.y + "px";
    boxEl.style.width = box.width + "px";
    boxEl.style.height = box.height + "px";
  }

  ["xW", "xH", "xZoom"].forEach((inputId) =>
    document.getElementById(inputId).addEventListener("input", () => { if (sourceImage) resetBoxToDefault(); })
  );

  boxEl.addEventListener("pointerdown", (e) => {
    if (e.target === handleEl) return;
    activeDrag = { mode: "move", startX: e.clientX, startY: e.clientY, originX: box.x, originY: box.y };
    boxEl.setPointerCapture(e.pointerId);
  });
  handleEl.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    activeDrag = { mode: "resize", startX: e.clientX, startY: e.clientY, originWidth: box.width, originHeight: box.height };
    handleEl.setPointerCapture(e.pointerId);
  });
  window.addEventListener("pointermove", (e) => {
    if (!activeDrag) return;
    const displayWidth = imageEl.clientWidth;
    const displayHeight = imageEl.clientHeight;

    if (activeDrag.mode === "move") {
      let newX = activeDrag.originX + (e.clientX - activeDrag.startX);
      let newY = activeDrag.originY + (e.clientY - activeDrag.startY);
      newX = Math.max(0, Math.min(displayWidth - box.width, newX));
      newY = Math.max(0, Math.min(displayHeight - box.height, newY));
      box.x = newX;
      box.y = newY;
      paintBox();
    } else if (activeDrag.mode === "resize") {
      const aspect = targetAspectRatio();
      let newWidth = Math.max(24, activeDrag.originWidth + (e.clientX - activeDrag.startX));
      newWidth = Math.min(newWidth, displayWidth - box.x, (displayHeight - box.y) * aspect);
      box.width = newWidth;
      box.height = newWidth / aspect;
      paintBox();
    }
  });
  window.addEventListener("pointerup", () => { activeDrag = null; });

  document.getElementById("xApply").onclick = async () => {
    const outputEl = document.getElementById("xOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Cropping…";
    try {
      const displayToNaturalScale = sourceImage.naturalWidth / imageEl.clientWidth;
      const sourceX = box.x * displayToNaturalScale;
      const sourceY = box.y * displayToNaturalScale;
      const sourceWidth = box.width * displayToNaturalScale;
      const sourceHeight = box.height * displayToNaturalScale;

      const outputWidth = Math.max(10, +document.getElementById("xW").value || 400);
      const outputHeight = Math.max(10, +document.getElementById("xH").value || 400);
      const maxKilobytes = +document.getElementById("xKB").value || 0;

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = outputWidth;
      cropCanvas.height = outputHeight;
      const ctx = cropCanvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sourceImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

      let blob;
      if (maxKilobytes > 0) {
        const bitmap = await createImageBitmap(cropCanvas);
        ({ blob } = await workerCompressFixedDimensions(bitmap, "image/jpeg", maxKilobytes));
      } else {
        blob = await canvasToBlob(cropCanvas, "image/jpeg", 0.92);
      }

      const objectUrl = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Cropped to <b>${outputWidth}×${outputHeight}px</b>, ${formatKilobytes(blob.size)} KB${maxKilobytes ? ` (target ≤${maxKilobytes}KB)` : ""}. `;
      const previewImg = document.createElement("img");
      previewImg.src = objectUrl;
      previewImg.style.cssText = "width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);vertical-align:middle;margin:6px 8px 0 0";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download";
      downloadBtn.onclick = () => triggerDownload(blob, `crop_${outputWidth}x${outputHeight}.jpg`);
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(previewImg);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not crop that image.";
    }
  };
}
