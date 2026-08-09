/*
  images-to-pdf.js
  ------------------
  Merges selected images into one PDF via jsPDF. Reuses the shared
  drag-reorder helper from utils.js.
*/

function initImagesToPdfTool() {
  let pageFit = "fit";
  let selectedFiles = [];

  document.querySelectorAll("#pdfSeg button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("#pdfSeg button").forEach((b) => b.classList.remove("on"));
      button.classList.add("on");
      pageFit = button.dataset.fit;
    };
  });

  const listEl = document.getElementById("pList");
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

  bindDropZone(document.getElementById("pDrop"), document.getElementById("pFile"), (files) => {
    selectedFiles = selectedFiles.concat(Array.from(files));
    renderList();
  });

  document.getElementById("pMake").onclick = async () => {
    const outputEl = document.getElementById("pOut");
    const progressEl = document.getElementById("pProg");

    if (!selectedFiles.length) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Choose one or more images first.";
      return;
    }
    if (!(window.jspdf && window.jspdf.jsPDF)) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "PDF library did not load (offline?). Try again online.";
      return;
    }

    outputEl.className = "tool-out";
    outputEl.textContent = "Building PDF…";
    try {
      const { jsPDF } = window.jspdf;
      const pdfDoc = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdfDoc.internal.pageSize.getWidth();
      const pageHeight = pdfDoc.internal.pageSize.getHeight();
      const margin = 24;

      for (let i = 0; i < selectedFiles.length; i++) {
        setProgress(progressEl, Math.round((i / selectedFiles.length) * 100));
        const image = await loadImageFromFile(selectedFiles[i]);
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        canvas.getContext("2d").drawImage(image, 0, 0);
        const imageData = canvas.toDataURL("image/jpeg", 0.9);

        let drawWidth, drawHeight;
        if (pageFit === "fit") {
          const scale = Math.min((pageWidth - 2 * margin) / image.width, (pageHeight - 2 * margin) / image.height);
          drawWidth = image.width * scale;
          drawHeight = image.height * scale;
        } else {
          const scale = Math.min((pageWidth - 2 * margin) / image.width, 1);
          drawWidth = image.width * scale;
          drawHeight = image.height * scale;
          if (drawHeight > pageHeight - 2 * margin) {
            const shrink = (pageHeight - 2 * margin) / drawHeight;
            drawWidth *= shrink;
            drawHeight *= shrink;
          }
        }

        if (i > 0) pdfDoc.addPage();
        pdfDoc.addImage(imageData, "JPEG", (pageWidth - drawWidth) / 2, (pageHeight - drawHeight) / 2, drawWidth, drawHeight);
      }

      setProgress(progressEl, 100);
      const blob = pdfDoc.output("blob");
      outputEl.className = "tool-out ok";
      outputEl.innerHTML = `PDF ready — ${selectedFiles.length} page(s), ${formatKilobytes(blob.size)} KB. `;
      const downloadBtn = document.createElement("button");
      downloadBtn.className = "btn sm";
      downloadBtn.textContent = "Download PDF";
      downloadBtn.onclick = () => triggerDownload(blob, "documents.pdf");
      outputEl.appendChild(document.createElement("br"));
      outputEl.appendChild(downloadBtn);
    } catch (error) {
      outputEl.className = "tool-out err";
      outputEl.textContent = "Could not build the PDF.";
    }
  };
}
