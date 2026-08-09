/*
  blur-and-html-tools.js
  ------------------------
  Blur Face: manual click-and-drag regions, no automatic face
  detection — labeled as such in the UI. HTML-to-image: renders a
  pasted HTML/CSS snippet via html2canvas inside a sandboxed iframe.
*/

function initBlurFaceTool() {
  const imageEl = document.getElementById("fImg");
  const stageEl = document.getElementById("fStage");
  let sourceImage = null;
  let regions = [];
  let activeDrag = null;

  bindDropZone(document.getElementById("fDrop"), document.getElementById("fFile"), async (file) => {
    try {
      sourceImage = await loadImageFromFile(file);
      imageEl.src = sourceImage.src;
      document.getElementById("fEditor").style.display = "block";
      regions = [];
      document.querySelectorAll(".blur-region").forEach((el) => el.remove());
    } catch (error) {
      showToast("Could not read that image");
    }
  });

  document.getElementById("fAddBtn").onclick = () => {
    if (!sourceImage) { showToast("Add an image first"); return; }
    const displayWidth = imageEl.clientWidth;
    const displayHeight = imageEl.clientHeight;
    const regionWidth = Math.max(40, displayWidth * 0.22);
    const regionHeight = Math.max(40, displayHeight * 0.22);
    const region = { x: (displayWidth - regionWidth) / 2, y: (displayHeight - regionHeight) / 2, width: regionWidth, height: regionHeight, el: null };

    const regionEl = document.createElement("div");
    regionEl.className = "blur-region";
    regionEl.innerHTML = '<button class="rm" title="remove">×</button>';
    stageEl.appendChild(regionEl);
    region.el = regionEl;
    paintRegion(region);

    regionEl.querySelector(".rm").onclick = (e) => {
      e.stopPropagation();
      regionEl.remove();
      regions = regions.filter((r) => r !== region);
    };
    regionEl.addEventListener("pointerdown", (e) => {
      if (e.target.classList.contains("rm")) return;
      activeDrag = { region, startX: e.clientX, startY: e.clientY, originX: region.x, originY: region.y };
      regionEl.setPointerCapture(e.pointerId);
    });
    regions.push(region);
  };

  function paintRegion(region) {
    region.el.style.left = region.x + "px";
    region.el.style.top = region.y + "px";
    region.el.style.width = region.width + "px";
    region.el.style.height = region.height + "px";
  }

  window.addEventListener("pointermove", (e) => {
    if (!activeDrag) return;
    const displayWidth = imageEl.clientWidth;
    const displayHeight = imageEl.clientHeight;
    const region = activeDrag.region;
    let newX = activeDrag.originX + (e.clientX - activeDrag.startX);
    let newY = activeDrag.originY + (e.clientY - activeDrag.startY);
    newX = Math.max(0, Math.min(displayWidth - region.width, newX));
    newY = Math.max(0, Math.min(displayHeight - region.height, newY));
    region.x = newX;
    region.y = newY;
    paintRegion(region);
  });
  window.addEventListener("pointerup", () => { activeDrag = null; });

  document.getElementById("fApply").onclick = async () => {
    const outputEl = document.getElementById("fOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Blurring…";
    try {
      if (!regions.length) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Add at least one region first.";
        return;
      }
      const displayToNaturalScale = sourceImage.naturalWidth / imageEl.clientWidth;
      const canvas = document.createElement("canvas");
      canvas.width = sourceImage.naturalWidth;
      canvas.height = sourceImage.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(sourceImage, 0, 0);

      regions.forEach((region) => {
        const sx = region.x * displayToNaturalScale;
        const sy = region.y * displayToNaturalScale;
        const sw = region.width * displayToNaturalScale;
        const sh = region.height * displayToNaturalScale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sx, sy, sw, sh);
        ctx.clip();
        ctx.filter = "blur(" + Math.max(8, sw * 0.08) + "px)";
        ctx.drawImage(canvas, 0, 0);
        ctx.restore();
      });

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      const objectUrl = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${regions.length} region(s) blurred. `;
      const previewImg = document.createElement("img");
      previewImg.src = objectUrl;
      previewImg.style.cssText = "width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--border);vertical-align:middle;margin:6px 8px 0 0";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download";
      downloadBtn.onclick = () => triggerDownload(blob, "blurred.jpg");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(previewImg);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not apply blur.";
    }
  };
}

function initHtmlToImageTool() {
  document.getElementById("htmlRender").onclick = async () => {
    const outputEl = document.getElementById("htmlOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "Rendering…";
    try {
      if (!window.html2canvas) {
        outputEl.className = "tool-out err";
        outputEl.textContent = "Renderer did not load (offline?). Try again online.";
        return;
      }
      const htmlSource = document.getElementById("htmlSrc").value;
      const sandboxFrame = document.createElement("iframe");
      sandboxFrame.style.cssText = "position:fixed;left:-9999px;top:0;border:0;width:900px;height:600px;background:#fff";
      document.body.appendChild(sandboxFrame);
      sandboxFrame.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;display:inline-block">${htmlSource}</body></html>`;
      await new Promise((resolve) => { sandboxFrame.onload = resolve; });
      await new Promise((resolve) => setTimeout(resolve, 80));

      const renderedBody = sandboxFrame.contentDocument.body;
      const canvas = await html2canvas(renderedBody, { backgroundColor: null, scale: 2 });
      document.body.removeChild(sandboxFrame);

      const blob = await canvasToBlob(canvas, "image/png");
      const objectUrl = URL.createObjectURL(blob);
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "Rendered. ";
      const previewImg = document.createElement("img");
      previewImg.src = objectUrl;
      previewImg.style.cssText = "max-width:100%;border-radius:8px;border:1px solid var(--border);margin-top:8px;display:block";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.style.marginTop = "8px";
      downloadBtn.textContent = "Download PNG";
      downloadBtn.onclick = () => triggerDownload(blob, "rendered.png");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(previewImg);
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not render that HTML.";
    }
  };
}
