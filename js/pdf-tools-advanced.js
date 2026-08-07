/*
  pdf-tools-advanced.js
  -----------------------
  Second wave of PDF tools, kept in their own file since pdf-tools.js
  (Merge/Split/Compress) was already a full module on its own.

  Every tool here is a real pdf-lib/pdf.js operation on the actual
  document — no flattening/rasterizing except where the tool's whole
  point is producing an image (PDF → JPG). Deliberately NOT included:
  password protection (pdf-lib has no real encryption support — faking
  it would be worse than not having it) and redaction (a covered-but-
  still-selectable "redaction" is a genuine privacy trap, not a
  shortcut worth taking).
*/

/* ---------- Rotate PDF ---------- */
function initRotatePdfTool() {
  let selectedFile = null;
  let rotationDegrees = 90;

  document.querySelectorAll("#rotPdfSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#rotPdfSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      rotationDegrees = +button.dataset.a;
    };
  });

  bindDropZone(document.getElementById("rpDrop"), document.getElementById("rpFile"), (file) => {
    selectedFile = file;
    document.getElementById("rpOut").className = "tool-out";
    document.getElementById("rpOut").textContent = "";
    showToast("PDF loaded — pick a rotation and apply");
  });

  document.getElementById("rpApply").onclick = async () => {
    const outputEl = document.getElementById("rpOut");
    const progressEl = document.getElementById("rpProg");
    if (!selectedFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a PDF first."; return; }
    if (!window.PDFLib) { outputEl.className = "tool-out err"; outputEl.textContent = "PDF engine did not load (offline?)."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Rotating…";
    setProgress(progressEl, 30);
    try {
      const bytes = await readFileAsArrayBuffer(selectedFile);
      const pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
      pdfDoc.getPages().forEach((page) => {
        const currentAngle = page.getRotation().angle;
        page.setRotation(PDFLib.degrees((currentAngle + rotationDegrees) % 360));
      });
      setProgress(progressEl, 90);
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Rotated all pages ${rotationDegrees}°, ${formatKilobytes(blob.size)} KB. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "rotated.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not rotate that PDF — it may be encrypted.";
    }
  };
}

/* ---------- Organize / reorder pages ---------- */
function initOrganizePdfTool() {
  let loadedBytes = null;
  let pageOrder = []; // array of original 1-based page numbers, in current display order

  bindDropZone(document.getElementById("orgDrop"), document.getElementById("orgFile"), async (file) => {
    const outputEl = document.getElementById("orgOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "";
    if (!window.PDFLib) { showToast("PDF engine did not load (offline?)"); return; }

    try {
      loadedBytes = await readFileAsArrayBuffer(file);
      const pdfDoc = await PDFLib.PDFDocument.load(loadedBytes, { ignoreEncryption: true });
      const pageCount = pdfDoc.getPageCount();
      pageOrder = Array.from({ length: pageCount }, (_, i) => i + 1);
      renderThumbs();
      document.getElementById("orgEditor").style.display = "block";
    } catch (error) {
      showToast("Could not read that PDF — it may be encrypted or corrupt");
    }
  });

  function renderThumbs() {
    const thumbsEl = document.getElementById("orgThumbs");
    thumbsEl.innerHTML = "";
    pageOrder.forEach((originalPageNumber, displayIndex) => {
      const thumbEl = document.createElement("div");
      thumbEl.className = "pg";
      thumbEl.draggable = true;
      thumbEl.dataset.displayIndex = displayIndex;
      thumbEl.innerHTML = `<span>${originalPageNumber}</span>`;
      thumbEl.title = "Drag to reorder";

      const removeBtn = document.createElement("button");
      removeBtn.textContent = "×";
      removeBtn.title = "Remove this page";
      removeBtn.style.cssText = "position:absolute;top:2px;right:2px;width:16px;height:16px;border:0;border-radius:50%;background:var(--fail);color:#fff;font-size:11px;line-height:1;cursor:pointer;padding:0;z-index:1";
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        pageOrder = pageOrder.filter((p) => p !== originalPageNumber);
        renderThumbs();
      };
      thumbEl.style.position = "relative";
      thumbEl.appendChild(removeBtn);
      thumbsEl.appendChild(thumbEl);
    });
    attachThumbDragReorder(thumbsEl);
  }

  function attachThumbDragReorder(thumbsEl) {
    let draggedIndex = null;
    thumbsEl.querySelectorAll(".pg").forEach((el) => {
      el.addEventListener("dragstart", () => {
        draggedIndex = +el.dataset.displayIndex;
        el.classList.add("drag");
      });
      el.addEventListener("dragend", () => el.classList.remove("drag"));
      el.addEventListener("dragover", (e) => {
        e.preventDefault();
        const overIndex = +el.dataset.displayIndex;
        if (draggedIndex === null || overIndex === draggedIndex) return;
        const [moved] = pageOrder.splice(draggedIndex, 1);
        pageOrder.splice(overIndex, 0, moved);
        draggedIndex = overIndex;
        renderThumbs();
      });
    });
  }

  document.getElementById("orgMake").onclick = async () => {
    const outputEl = document.getElementById("orgOut");
    const progressEl = document.getElementById("orgProg");
    if (!loadedBytes) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a PDF first."; return; }
    if (!pageOrder.length) { outputEl.className = "tool-out err"; outputEl.textContent = "At least one page must remain."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Rebuilding…";
    setProgress(progressEl, 30);
    try {
      const { PDFDocument } = PDFLib;
      const sourceDoc = await PDFDocument.load(loadedBytes, { ignoreEncryption: true });
      const outputDoc = await PDFDocument.create();
      const copiedPages = await outputDoc.copyPages(sourceDoc, pageOrder.map((n) => n - 1));
      copiedPages.forEach((page) => outputDoc.addPage(page));
      setProgress(progressEl, 90);
      const outputBytes = await outputDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Rebuilt with ${pageOrder.length} page(s) in the new order, ${formatKilobytes(blob.size)} KB. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "organized.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not rebuild that PDF.";
    }
  };
}

/* ---------- PDF to JPG ---------- */
function initPdfToJpgTool() {
  bindDropZone(document.getElementById("p2jDrop"), document.getElementById("p2jFile"), async (file) => {
    const outputEl = document.getElementById("p2jOut");
    const progressEl = document.getElementById("p2jProg");
    outputEl.className = "tool-out";
    outputEl.textContent = "Rendering pages…";

    if (!window.pdfjsLib) { outputEl.className = "tool-out err"; outputEl.textContent = "Renderer did not load (offline?)."; return; }

    try {
      const bytes = await readFileAsArrayBuffer(file);
      const pdfDocument = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pageImages = [];

      for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
        setProgress(progressEl, Math.round((pageNumber / pdfDocument.numPages) * 100));
        const page = await pdfDocument.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        const blob = await canvasToBlob(canvas, "image/jpeg", 0.9);
        pageImages.push({ blob, name: `page-${String(pageNumber).padStart(2, "0")}.jpg` });
      }

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `${pageImages.length} page(s) rendered. Browsers may ask permission for multiple downloads. `;
      const downloadAllBtn = document.createElement("button");
      downloadAllBtn.className = "btn sm";
      downloadAllBtn.textContent = "Download all as JPG";
      downloadAllBtn.onclick = () => {
        pageImages.forEach((img, i) => setTimeout(() => triggerDownload(img.blob, img.name), i * 200));
        showToast("Downloading " + pageImages.length + " image(s)");
      };
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadAllBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not render that PDF.";
    }
  });
}

/* ---------- Add page numbers ---------- */
function initPageNumbersTool() {
  let selectedFile = null;
  let position = "bottom-center";

  document.querySelectorAll("#pnPosSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#pnPosSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      position = button.dataset.pos;
    };
  });

  bindDropZone(document.getElementById("pnDrop"), document.getElementById("pnFile"), (file) => {
    selectedFile = file;
    document.getElementById("pnOut").className = "tool-out";
    document.getElementById("pnOut").textContent = "";
    showToast("PDF loaded — set a starting number and apply");
  });

  document.getElementById("pnApply").onclick = async () => {
    const outputEl = document.getElementById("pnOut");
    const progressEl = document.getElementById("pnProg");
    if (!selectedFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a PDF first."; return; }
    if (!window.PDFLib) { outputEl.className = "tool-out err"; outputEl.textContent = "PDF engine did not load (offline?)."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Numbering pages…";
    setProgress(progressEl, 30);
    try {
      const { PDFDocument, StandardFonts, rgb } = PDFLib;
      const startNumber = +document.getElementById("pnStart").value || 1;
      const bytes = await readFileAsArrayBuffer(selectedFile);
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

      pdfDoc.getPages().forEach((page, index) => {
        const { width, height } = page.getSize();
        const label = String(startNumber + index);
        const fontSize = 10;
        const textWidth = font.widthOfTextAtSize(label, fontSize);
        const margin = 24;
        let x, y;
        if (position === "bottom-center") { x = width / 2 - textWidth / 2; y = margin / 1.5; }
        else if (position === "bottom-right") { x = width - margin - textWidth; y = margin / 1.5; }
        else { x = margin; y = margin / 1.5; } // bottom-left
        page.drawText(label, { x, y, size: fontSize, font, color: rgb(0.35, 0.35, 0.35) });
      });

      setProgress(progressEl, 90);
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Page numbers added starting at ${startNumber}. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "numbered.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not number that PDF — it may be encrypted.";
    }
  };
}

/* ---------- Watermark PDF ---------- */
function initWatermarkPdfTool() {
  let selectedFile = null;

  bindDropZone(document.getElementById("wpDrop"), document.getElementById("wpFile"), (file) => {
    selectedFile = file;
    document.getElementById("wpOut").className = "tool-out";
    document.getElementById("wpOut").textContent = "";
    showToast("PDF loaded — set watermark text and apply");
  });

  document.getElementById("wpApply").onclick = async () => {
    const outputEl = document.getElementById("wpOut");
    const progressEl = document.getElementById("wpProg");
    if (!selectedFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a PDF first."; return; }
    if (!window.PDFLib) { outputEl.className = "tool-out err"; outputEl.textContent = "PDF engine did not load (offline?)."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Stamping…";
    setProgress(progressEl, 30);
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
      const text = document.getElementById("wpText").value || "SAMPLE";
      const opacity = (+document.getElementById("wpOpacity").value) / 100;
      const bytes = await readFileAsArrayBuffer(selectedFile);
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      pdfDoc.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        const fontSize = Math.max(24, Math.round(width / 10));
        const textWidth = font.widthOfTextAtSize(text, fontSize);
        page.drawText(text, {
          x: width / 2 - textWidth / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: rgb(0.5, 0.5, 0.5),
          opacity,
          rotate: degrees(-30),
        });
      });

      setProgress(progressEl, 90);
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = "Watermark applied to every page. ";
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "watermarked.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not watermark that PDF — it may be encrypted.";
    }
  };
}

/* ---------- Crop PDF margins ---------- */
function initCropPdfMarginsTool() {
  let selectedFile = null;

  bindDropZone(document.getElementById("cpDrop"), document.getElementById("cpFile"), (file) => {
    selectedFile = file;
    document.getElementById("cpOut").className = "tool-out";
    document.getElementById("cpOut").textContent = "";
    showToast("PDF loaded — set a margin and apply");
  });

  document.getElementById("cpApply").onclick = async () => {
    const outputEl = document.getElementById("cpOut");
    const progressEl = document.getElementById("cpProg");
    if (!selectedFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a PDF first."; return; }
    if (!window.PDFLib) { outputEl.className = "tool-out err"; outputEl.textContent = "PDF engine did not load (offline?)."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Cropping…";
    setProgress(progressEl, 30);
    try {
      const marginPercent = Math.max(0, Math.min(40, +document.getElementById("cpMargin").value || 0)) / 100;
      const bytes = await readFileAsArrayBuffer(selectedFile);
      const pdfDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });

      pdfDoc.getPages().forEach((page) => {
        const { width, height } = page.getSize();
        const marginX = width * marginPercent;
        const marginY = height * marginPercent;
        page.setCropBox(marginX, marginY, width - marginX * 2, height - marginY * 2);
      });

      setProgress(progressEl, 90);
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Margins cropped by ${Math.round(marginPercent * 100)}% on every side. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "cropped.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not crop that PDF — it may be encrypted.";
    }
  };
}

/* ---------- Sign PDF (place a signature image) ---------- */
function initSignPdfTool() {
  let selectedPdfFile = null;
  let selectedSignatureFile = null;
  let position = "bottom-right";

  document.querySelectorAll("#spPosSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#spPosSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      position = button.dataset.pos;
    };
  });

  bindDropZone(document.getElementById("spPdfDrop"), document.getElementById("spPdfFile"), (file) => {
    selectedPdfFile = file;
    showToast("PDF loaded");
  });
  bindDropZone(document.getElementById("spSigDrop"), document.getElementById("spSigFile"), (file) => {
    selectedSignatureFile = file;
    showToast("Signature image loaded");
  });

  document.getElementById("spApply").onclick = async () => {
    const outputEl = document.getElementById("spOut");
    const progressEl = document.getElementById("spProg");
    if (!selectedPdfFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a PDF first."; return; }
    if (!selectedSignatureFile) { outputEl.className = "tool-out err"; outputEl.textContent = "Choose a signature image."; return; }
    if (!window.PDFLib) { outputEl.className = "tool-out err"; outputEl.textContent = "PDF engine did not load (offline?)."; return; }

    outputEl.className = "tool-out";
    outputEl.textContent = "Placing signature…";
    setProgress(progressEl, 30);
    try {
      const { PDFDocument } = PDFLib;
      const targetPageNumber = Math.max(1, +document.getElementById("spPage").value || 1);
      const widthPoints = +document.getElementById("spSize").value || 120;

      const pdfBytes = await readFileAsArrayBuffer(selectedPdfFile);
      const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();
      const pageIndex = Math.min(targetPageNumber, pages.length) - 1;
      const page = pages[pageIndex];
      const { width: pageWidth, height: pageHeight } = page.getSize();

      const sigBytes = await readFileAsArrayBuffer(selectedSignatureFile);
      const isPng = selectedSignatureFile.type === "image/png" || /\.png$/i.test(selectedSignatureFile.name);
      const embeddedImage = isPng ? await pdfDoc.embedPng(sigBytes) : await pdfDoc.embedJpg(sigBytes);
      const aspectRatio = embeddedImage.height / embeddedImage.width;
      const drawWidth = widthPoints;
      const drawHeight = widthPoints * aspectRatio;
      const margin = 28;

      let x, y;
      if (position === "bottom-right") { x = pageWidth - margin - drawWidth; y = margin; }
      else if (position === "bottom-left") { x = margin; y = margin; }
      else if (position === "bottom-center") { x = pageWidth / 2 - drawWidth / 2; y = margin; }
      else { x = pageWidth / 2 - drawWidth / 2; y = pageHeight / 2 - drawHeight / 2; } // center

      page.drawImage(embeddedImage, { x, y, width: drawWidth, height: drawHeight });

      setProgress(progressEl, 90);
      const outputBytes = await pdfDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Signature placed on page ${pageIndex + 1}. This places an image — it is not a legally-binding digital signature. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "signed.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not place the signature — check both files and try again.";
    }
  };
}