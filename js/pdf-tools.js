/*
  pdf-tools.js
  -------------
  Merge, Split, Compress. Merge and Split use pdf-lib to copy real
  pages — text and vectors stay intact, nothing is rasterized.
  Compress has three paths: Low re-saves through pdf-lib (lossless-ish,
  keeps text selectable); Medium/High rasterize each page at a fixed
  scale/quality; Custom size searches scale/quality combinations to
  land under a KB target the user picks. The rasterize path renders
  via pdf.js on the main thread (its render() call is async and yields
  on its own) but hands the actual JPEG encode to the worker — that's
  the step that gets slow across many pages, and it's exactly the kind
  of work OffscreenCanvas exists for.
*/

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

/* ---------- Merge PDF ---------- */
function initMergePdfTool() {
  let selectedFiles = [];
  const listEl = document.getElementById("mList");

  function renderList() {
    listEl.innerHTML = "";
    selectedFiles.forEach((file) => {
      const row = createReorderableRow(file.name, () => {
        selectedFiles = selectedFiles.filter((f) => f !== file);
        renderList();
      });
      listEl.appendChild(row);
    });
  }
  enableDragReorder(listEl, () => selectedFiles, (arr) => selectedFiles = arr, renderList);

  bindDropZone(document.getElementById("mDrop"), document.getElementById("mFile"), (files) => {
    const pdfFiles = Array.from(files).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    selectedFiles = selectedFiles.concat(pdfFiles);
    renderList();
  });

  document.getElementById("mMake").onclick = async () => {
    const outputEl = document.getElementById("mOut");
    const progressEl = document.getElementById("mProg");

    if (selectedFiles.length < 2) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Add at least two PDF files.";
      return;
    }
    if (!window.PDFLib) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "PDF engine did not load (offline?). Try again online.";
      return;
    }

    outputEl.className = "tool-out";
    outputEl.textContent = "Merging…";
    try {
      const { PDFDocument } = PDFLib;
      const mergedDoc = await PDFDocument.create();

      for (let i = 0; i < selectedFiles.length; i++) {
        setProgress(progressEl, Math.round((i / selectedFiles.length) * 100));
        const bytes = await readFileAsArrayBuffer(selectedFiles[i]);
        const sourceDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copiedPages = await mergedDoc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        copiedPages.forEach((page) => mergedDoc.addPage(page));
      }

      setProgress(progressEl, 100);
      const mergedBytes = await mergedDoc.save();
      const blob = new Blob([mergedBytes], { type: "application/pdf" });
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Merged ${selectedFiles.length} PDFs into one, ${formatKilobytes(blob.size)} KB. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download merged PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "merged.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not merge — one file may be encrypted or corrupt.";
    }
  };
}

/* ---------- Split PDF ---------- */
function initSplitPdfTool() {
  let loadedDoc = null;
  let loadedBytes = null;
  let selectedPages = new Set();

  bindDropZone(document.getElementById("sDrop"), document.getElementById("sFile"), async (file) => {
    const outputEl = document.getElementById("sOut");
    outputEl.className = "tool-out";
    outputEl.textContent = "";
    if (!window.PDFLib) { showToast("PDF engine did not load (offline?)"); return; }

    try {
      loadedBytes = await readFileAsArrayBuffer(file);
      loadedDoc = await PDFLib.PDFDocument.load(loadedBytes, { ignoreEncryption: true });
      const pageCount = loadedDoc.getPageCount();
      selectedPages = new Set();

      const thumbsEl = document.getElementById("sThumbs");
      thumbsEl.innerHTML = "";
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
        const thumbEl = document.createElement("div");
        thumbEl.className = "pg";
        thumbEl.innerHTML = `<span>${pageNumber}</span>`;
        thumbEl.onclick = () => {
          if (selectedPages.has(pageNumber)) selectedPages.delete(pageNumber);
          else selectedPages.add(pageNumber);
          thumbEl.classList.toggle("sel");
          syncRangeFieldFromSelection();
        };
        thumbsEl.appendChild(thumbEl);
      }
      document.getElementById("sEditor").style.display = "block";
      document.getElementById("sHint").textContent = `${pageCount} page(s) detected — click thumbnails or type a range below`;
    } catch (error) {
      showToast("Could not read that PDF — it may be encrypted or corrupt");
    }
  });

  function syncRangeFieldFromSelection() {
    const sortedPages = [...selectedPages].sort((a, b) => a - b);
    document.getElementById("sRange").value = compressPageListToRanges(sortedPages);
  }

  document.getElementById("sMake").onclick = async () => {
    const outputEl = document.getElementById("sOut");
    const progressEl = document.getElementById("sProg");

    if (!loadedDoc) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Choose a PDF first.";
      return;
    }
    const rangeText = document.getElementById("sRange").value;
    const pageCount = loadedDoc.getPageCount();
    const pageNumbers = parsePageRangeText(rangeText, pageCount);

    if (!pageNumbers.length) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Enter a valid page or range, e.g. 1-3,5";
      return;
    }

    outputEl.className = "tool-out";
    outputEl.textContent = "Extracting…";
    setProgress(progressEl, 30);
    try {
      const { PDFDocument } = PDFLib;
      const sourceDoc = await PDFDocument.load(loadedBytes, { ignoreEncryption: true });
      const outputDoc = await PDFDocument.create();
      const copiedPages = await outputDoc.copyPages(sourceDoc, pageNumbers.map((n) => n - 1));
      copiedPages.forEach((page) => outputDoc.addPage(page));

      setProgress(progressEl, 90);
      const outputBytes = await outputDoc.save();
      const blob = new Blob([outputBytes], { type: "application/pdf" });
      setProgress(progressEl, 100);

      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `Extracted ${pageNumbers.length} page(s): ${rangeText}. ${formatKilobytes(blob.size)} KB. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "extracted.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not extract those pages.";
    }
  };
}

/** Turns [1,2,3,5] into "1-3,5". */
function compressPageListToRanges(pageNumbers) {
  if (!pageNumbers.length) return "";
  const ranges = [];
  let rangeStart = pageNumbers[0];
  let previous = pageNumbers[0];
  for (let i = 1; i <= pageNumbers.length; i++) {
    if (i < pageNumbers.length && pageNumbers[i] === previous + 1) {
      previous = pageNumbers[i];
      continue;
    }
    ranges.push(rangeStart === previous ? `${rangeStart}` : `${rangeStart}-${previous}`);
    if (i < pageNumbers.length) { rangeStart = pageNumbers[i]; previous = pageNumbers[i]; }
  }
  return ranges.join(",");
}

/** Parses "1-3,5,8" into [1,2,3,5,8], clamped to maxPage and de-duplicated. */
function parsePageRangeText(rangeText, maxPage) {
  const pageSet = new Set();
  rangeText.split(",").map((s) => s.trim()).filter(Boolean).forEach((part) => {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let start = +rangeMatch[1], end = +rangeMatch[2];
      if (start > end) [start, end] = [end, start];
      for (let n = start; n <= end; n++) if (n >= 1 && n <= maxPage) pageSet.add(n);
    } else {
      const n = +part;
      if (n >= 1 && n <= maxPage) pageSet.add(n);
    }
  });
  return [...pageSet].sort((a, b) => a - b);
}

/* ---------- Compress PDF ---------- */
function initCompressPdfTool() {
  let compressionLevel = "low";
  const targetKbField = document.getElementById("pcTargetField");
  document.querySelectorAll("#pcSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#pcSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      compressionLevel = button.dataset.lvl;
      targetKbField.style.display = compressionLevel === "target" ? "" : "none";
    };
  });

  bindDropZone(document.getElementById("pcDrop"), document.getElementById("pcFile"), async (file) => {
    const outputEl = document.getElementById("pcOut");
    const progressEl = document.getElementById("pcProg");
    outputEl.className = "tool-out";
    outputEl.textContent = "Compressing…";

    try {
      const originalBytes = await readFileAsArrayBuffer(file);

      if (compressionLevel === "low") {
        await compressLossless(file, originalBytes, outputEl, progressEl);
      } else if (compressionLevel === "target") {
        const targetKilobytes = +document.getElementById("pcTargetKB").value || 500;
        await compressToTargetSize(file, originalBytes, targetKilobytes, outputEl, progressEl);
      } else {
        await compressByRasterizing(file, originalBytes, compressionLevel, outputEl, progressEl);
      }
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not compress that PDF — it may be encrypted.";
    }
  });
}

async function compressLossless(originalFile, originalBytes, outputEl, progressEl) {
  if (!window.PDFLib) {
    outputEl.className = "tool-out err";
    outputEl.textContent = "PDF engine did not load.";
    return;
  }
  setProgress(progressEl, 40);
  const pdfDoc = await PDFLib.PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const compressedBytes = await pdfDoc.save({ useObjectStreams: true });
  setProgress(progressEl, 100);

  const blob = new Blob([compressedBytes], { type: "application/pdf" });
  const savedPercent = Math.round((1 - blob.size / originalFile.size) * 100);
  outputEl.className = "tool-out ok";
  outputEl.innerHTML = `Compressed (Low, text stays selectable) — ${formatKilobytes(originalFile.size)} KB → <b>${formatKilobytes(blob.size)} KB</b>${savedPercent > 0 ? ` (${savedPercent}% smaller)` : " (already efficient)"}. `;
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn sm";
  downloadBtn.textContent = "Download PDF";
  downloadBtn.onclick = () => triggerDownload(blob, "compressed.pdf");
  outputEl.appendChild(document.createElement("br"));
  outputEl.appendChild(downloadBtn);
}

async function compressByRasterizing(originalFile, originalBytes, level, outputEl, progressEl) {
  if (!window.pdfjsLib || !(window.jspdf && window.jspdf.jsPDF)) {
    outputEl.className = "tool-out err";
    outputEl.textContent = "Renderer did not load (offline?).";
    return;
  }
  const renderScale = level === "medium" ? 1.3 : 0.9;
  const jpegQuality = level === "medium" ? 0.55 : 0.32;

  const blob = await rebuildAsRasterizedPdf(originalBytes, renderScale, jpegQuality, progressEl, 0, 100);
  const savedPercent = Math.round((1 - blob.size / originalFile.size) * 100);
  outputEl.className = "tool-out ok";
  outputEl.innerHTML = `Compressed (${level === "medium" ? "Medium" : "High"}, pages rasterized) — ${formatKilobytes(originalFile.size)} KB → <b>${formatKilobytes(blob.size)} KB</b>${savedPercent > 0 ? ` (${savedPercent}% smaller)` : ""}. Text is no longer selectable in this file. `;
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn sm";
  downloadBtn.textContent = "Download PDF";
  downloadBtn.onclick = () => triggerDownload(blob, "compressed.pdf");
  outputEl.appendChild(document.createElement("br"));
  outputEl.appendChild(downloadBtn);
}

/**
 * Renders every page at `scale`/`quality` and rebuilds a single-file PDF
 * from the results. Shared by the fixed Medium/High levels and by the
 * target-size search below, which calls this repeatedly at different
 * scale/quality combinations to find one that fits under the target.
 * `progressFrom`/`progressTo` let a caller doing multiple rebuild
 * attempts map this one rebuild onto its own slice of the progress bar.
 */
async function rebuildAsRasterizedPdf(originalBytes, scale, quality, progressEl, progressFrom, progressTo) {
  const loadingTask = pdfjsLib.getDocument({ data: originalBytes });
  const pdfDocument = await loadingTask.promise;
  const { jsPDF } = window.jspdf;
  const outputDoc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = outputDoc.internal.pageSize.getWidth();
  const pageHeight = outputDoc.internal.pageSize.getHeight();

  for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
    if (progressEl) {
      const fraction = pageNumber / pdfDocument.numPages;
      setProgress(progressEl, Math.round(progressFrom + fraction * (progressTo - progressFrom)));
    }

    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = viewport.width;
    renderCanvas.height = viewport.height;
    await page.render({ canvasContext: renderCanvas.getContext("2d"), viewport }).promise;

    const pageBitmap = await createImageBitmap(renderCanvas);
    const { blob: pageBlob } = await workerEncodePdfPage(pageBitmap, quality);
    const pageDataUrl = await blobToDataUrl(pageBlob);

    const fitScale = Math.min(pageWidth / renderCanvas.width, pageHeight / renderCanvas.height);
    const drawWidth = renderCanvas.width * fitScale;
    const drawHeight = renderCanvas.height * fitScale;
    if (pageNumber > 1) outputDoc.addPage();
    outputDoc.addImage(pageDataUrl, "JPEG", (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight);
  }

  return outputDoc.output("blob");
}

/**
 * Searches for a scale/quality combination that lands the rebuilt PDF
 * under targetKilobytes. Tries the lossless path first (free, keeps
 * text selectable) — only falls back to rasterizing if that alone
 * isn't enough. Each rasterize attempt re-renders every page, so this
 * is bounded to a handful of attempts rather than an open-ended search;
 * a large multi-page PDF may take a while regardless, since there's no
 * way to estimate the right settings without actually trying them.
 */
async function compressToTargetSize(originalFile, originalBytes, targetKilobytes, outputEl, progressEl) {
  if (!window.PDFLib) {
    outputEl.className = "tool-out err";
    outputEl.textContent = "PDF engine did not load.";
    return;
  }
  const targetBytes = targetKilobytes * 1024;

  // Free first attempt: lossless re-save keeps text selectable, and if
  // that alone already fits, rasterizing would only make it worse.
  setProgress(progressEl, 10);
  const pdfDoc = await PDFLib.PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const losslessBytes = await pdfDoc.save({ useObjectStreams: true });
  const losslessBlob = new Blob([losslessBytes], { type: "application/pdf" });

  if (losslessBlob.size <= targetBytes) {
    setProgress(progressEl, 100);
    reportTargetSizeResult(originalFile, losslessBlob, targetKilobytes, false, outputEl);
    return;
  }

  if (!window.pdfjsLib || !(window.jspdf && window.jspdf.jsPDF)) {
    outputEl.className = "tool-out err";
    outputEl.textContent = "Renderer did not load (offline?) — can't rasterize to shrink further.";
    return;
  }

  outputEl.textContent = "Searching for settings that hit your target size…";

  const scalesToTry = [1.1, 0.8, 0.6];
  const attemptsPerScale = 3; // binary-search steps on JPEG quality within each scale
  const totalAttempts = scalesToTry.length * attemptsPerScale;
  let attemptsDone = 0;
  let bestUnderTarget = null; // largest (best quality) blob that still fits
  let smallestSeen = losslessBlob; // fallback if nothing fits the target

  for (const scale of scalesToTry) {
    let low = 0.15, high = 0.85;
    for (let i = 0; i < attemptsPerScale; i++) {
      const quality = (low + high) / 2;
      attemptsDone++;
      const progressFrom = Math.round((attemptsDone - 1) / totalAttempts * 90);
      const progressTo = Math.round(attemptsDone / totalAttempts * 90);
      const blob = await rebuildAsRasterizedPdf(originalBytes, scale, quality, progressEl, progressFrom, progressTo);

      if (blob.size < smallestSeen.size) smallestSeen = blob;

      if (blob.size <= targetBytes) {
        if (!bestUnderTarget || blob.size > bestUnderTarget.size) bestUnderTarget = blob;
        low = quality; // fits — try pushing quality up within this scale
      } else {
        high = quality; // too big — back off quality
      }
    }
    if (bestUnderTarget) break; // found a fit at this scale; a smaller scale would only look worse for no size benefit
  }

  setProgress(progressEl, 100);
  const resultBlob = bestUnderTarget || smallestSeen;
  const hitTarget = resultBlob.size <= targetBytes;
  reportTargetSizeResult(originalFile, resultBlob, targetKilobytes, !hitTarget, outputEl);
}

function reportTargetSizeResult(originalFile, blob, targetKilobytes, missedTarget, outputEl) {
  outputEl.className = "tool-out ok";
  const sizeLine = `${formatKilobytes(originalFile.size)} KB → <b>${formatKilobytes(blob.size)} KB</b> (target was ${targetKilobytes} KB)`;
  outputEl.innerHTML = missedTarget
    ? `Could not fit under ${targetKilobytes} KB without the pages becoming unusably blurry — closest achievable size shown instead. ${sizeLine}. `
    : `Hit your target. ${sizeLine}. `;
  const downloadBtn = document.createElement("button");
  downloadBtn.className = "btn sm";
  downloadBtn.textContent = "Download PDF";
  downloadBtn.onclick = () => triggerDownload(blob, "compressed.pdf");
  outputEl.appendChild(document.createElement("br"));
  outputEl.appendChild(downloadBtn);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}