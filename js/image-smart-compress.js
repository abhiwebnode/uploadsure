/*
  image-smart-compress.js
  --------------------------
  Smart Compress: quality-based compression with user control over output
  format. For JPEG/WebP uploads a quality slider does the work. For PNG
  uploads the user picks the output format — PNG (lossless, unchanged if
  not smaller), JPEG, or WebP — so there's no silent format switching and
  no mystery about why a file did or didn't shrink.
*/

function initSmartCompressTool() {
  const outputEl  = document.getElementById("scOut");
  const qualityEl = document.getElementById("scQuality");
  const qualityValEl = document.getElementById("scQualityVal");

  // live quality value label
  if (qualityEl) {
    qualityEl.addEventListener("input", () => {
      if (qualityValEl) qualityValEl.textContent = qualityEl.value + "%";
    });
  }

  // format seg toggle
  document.querySelectorAll("#scFormatSeg button").forEach((btn) => {
    btn.onclick = () => {
      document.querySelectorAll("#scFormatSeg button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
    };
  });

  function getSelectedOutputMime() {
    const btn = document.querySelector("#scFormatSeg button.on");
    return btn ? btn.dataset.mime : null; // null = keep original format
  }

  function getQuality() {
    return qualityEl ? +qualityEl.value / 100 : 0.82;
  }

  bindDropZone(document.getElementById("scDrop"), document.getElementById("scFile"), (files) => {
    outputEl.className = "tool-out";
    outputEl.textContent = "";

    processFilesInBatch(files, document.getElementById("scProg"), document.getElementById("scList"), async (file) => {
      const sourceMimeType = detectImageMimeType(file);
      const isPng = sourceMimeType === "image/png";
      // The format selector only governs PNG uploads — a JPEG or WebP upload
      // is always compressed in its own format. Without this check, the
      // selector's default ("Keep PNG") would convert every JPEG to PNG and
      // make it far larger.
      const targetMime = isPng ? (getSelectedOutputMime() || sourceMimeType) : sourceMimeType;
      const quality = getQuality();

      const image = await loadImageFromFile(file);
      const bitmap = await createImageBitmap(image);
      const { blob, outputMimeType } = await workerSmartCompress(bitmap, sourceMimeType, targetMime, quality);

      // If the user explicitly asked to convert to a different format, always
      // honour that — they want a JPEG/WebP file, even if this particular
      // image happens to encode larger. The "never bigger" guard only applies
      // when we're keeping the original format, where a larger result would
      // just be a pointless re-encode.
      const isConversion = targetMime !== sourceMimeType;
      const isSmaller = blob.size < file.size;
      const useResult = isConversion || isSmaller;

      const resultBlob = useResult ? blob : file;
      const resultMime = useResult ? outputMimeType : sourceMimeType;
      const savedPercent = Math.round((1 - blob.size / file.size) * 100);

      let label;
      if (!useResult) {
        label = `${formatKilobytes(file.size)} KB — already optimal, original returned`;
      } else if (isConversion) {
        label = savedPercent > 0
          ? `${formatKilobytes(resultBlob.size)} KB as ${FORMAT_EXTENSIONS[resultMime].toUpperCase()} (${savedPercent}% smaller)`
          : `${formatKilobytes(resultBlob.size)} KB as ${FORMAT_EXTENSIONS[resultMime].toUpperCase()} (${Math.abs(savedPercent)}% larger — PNG was already well compressed)`;
      } else {
        label = `${formatKilobytes(resultBlob.size)} KB (${savedPercent}% smaller)`;
      }

      return {
        blob: resultBlob,
        name: file.name.replace(/\.\w+$/, "") + "." + FORMAT_EXTENSIONS[resultMime],
        label,
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
