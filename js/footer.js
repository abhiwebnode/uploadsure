/*
  footer.js — UploadSure shared footer

  Usage on every page:
    <div id="site-footer"></div>
    <script src="js/footer.js"></script>

  Combines the original brand + "what's real" + "runs on your device"
  columns with new PDF / Image / AI tool link columns for SEO and
  discoverability, similar to iLovePDF / Smallpdf.
*/

(function () {

  const el = document.getElementById("site-footer");
  if (!el) return;

  /* ── Column data ── */
  const PRODUCT_LINKS = [
    { href: "application-pack.html", label: "Application Pack" },
    { href: "image-tools.html",      label: "All Image Tools" },
    { href: "pdf-tools.html",        label: "All PDF Tools" },
    { href: "ai-tools.html",         label: "All AI Tools" },
    { href: "contact.html",          label: "Contact Us" },
    { href: "privacy.html",          label: "Privacy Policy" },
    { href: "terms.html",            label: "Terms & Conditions" },
  ];

  const PDF_LINKS = [
    { href: "pdf-tools.html#t-merge",         label: "Merge PDF" },
    { href: "pdf-tools.html#t-split",         label: "Split PDF" },
    { href: "pdf-tools.html#t-pdfcompress",   label: "Compress PDF" },
    { href: "pdf-tools.html#t-rotate-pdf",    label: "Rotate PDF" },
    { href: "pdf-tools.html#t-organize",      label: "Organize Pages" },
    { href: "pdf-tools.html#t-pdf2jpg",       label: "PDF to JPG" },
    { href: "pdf-tools.html#t-sign-pdf",      label: "Sign PDF" },
    { href: "pdf-tools.html#t-watermark-pdf", label: "Watermark PDF" },
  ];

  const IMAGE_LINKS = [
    { href: "image-tools.html#t-smartcompress", label: "Smart Compress" },
    { href: "image-tools.html#t-compress",      label: "Compress Image" },
    { href: "image-tools.html#t-resize",        label: "Resize Image" },
    { href: "image-tools.html#t-crop",          label: "Crop Image" },
    { href: "image-tools.html#t-convert",       label: "Convert Format" },
    { href: "image-tools.html#t-watermark",     label: "Add Watermark" },
    { href: "image-tools.html#t-device",        label: "Screenshot Studio" },
    { href: "image-tools.html#t-og",            label: "OG Image" },
  ];

  const AI_LINKS = [
    { href: "ai-tools.html#t-ai-bg",      label: "Background Remover" },
    { href: "ai-tools.html#t-ai-face",    label: "Face Blur" },
    { href: "ai-tools.html#t-passport",   label: "Passport Photo" },
    { href: "ai-tools.html#t-obj-remove", label: "Object Remover" },
    { href: "ai-tools.html#t-composite",  label: "Photo Composite" },
    { href: "ai-tools.html#t-photo-check", label: "Photo Rejection Checker" },
    { href: "ai-tools.html#t-sig-clean",   label: "Signature Cleaner" },
    { href: "ai-tools.html#t-doc-scan",    label: "Document Scanner" },
  ];

  const PORTAL_LINKS = [
    { href: "application-pack.html?portal=ssc",      label: "SSC Photo Size" },
    { href: "application-pack.html?portal=upsc",     label: "UPSC Photo Size" },
    { href: "application-pack.html?portal=ibps",     label: "IBPS / SBI Photo" },
    { href: "application-pack.html?portal=jee",      label: "JEE Photo Size" },
    { href: "application-pack.html?portal=neet",     label: "NEET Photo Size" },
    { href: "application-pack.html?portal=passport", label: "Passport Photo" },
    { href: "application-pack.html?portal=pan",      label: "PAN Card Photo" },
    { href: "application-pack.html?portal=kyc",      label: "Bank KYC Photo" },
    { href: "exam-photo-size.html",                  label: "All Exam Sizes →" },
  ];

  /* ── Helper: render a column ── */
  function column(title, links, extraClass) {
    const items = links.map(l => `<a href="${l.href}">${l.label}</a>`).join("");
    return `
      <div class="footer-col ${extraClass || ""}">
        <h3>${title}</h3>
        ${items}
      </div>`;
  }

  const year = new Date().getFullYear();

  el.innerHTML = `
<footer>
  <div class="wrap">

    <!-- ── Top: brand + description columns ── -->
    <div class="foot-grid">
      <div>
        <div class="brand" style="font-size:17px;margin-bottom:10px">
          <a href="/" class="logo-link" aria-label="UploadSure home">
            <img src="assets/logo/logo.png" alt="UploadSure" class="logo-img"
              onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mark',ariaHidden:'true'}))">
          </a>
        </div>
        <p style="margin:0;max-width:38ch">The gap between "your file" and "a file this portal accepts" — closed. Built for the person who's been rejected four times and just wants it done.</p>
      </div>
      <div>
        <h4>What's real vs. best-effort</h4>
        <p style="margin:0">Compress, resize, crop, convert, rotate, watermark, merge and split are genuine operations, not approximations. Upscale, background removal and face blur are labelled honestly as best-effort — we won't dress up a filter as AI.</p>
      </div>
      <div>
        <h4>Runs on your device</h4>
        <p style="margin:0">Every operation happens in your browser — photos, signatures, scans and PDFs are never uploaded anywhere. Handy for cyber cafés and CSCs processing applicants back to back.</p>
      </div>
    </div>

    <!-- ── Middle: tool link columns ── -->
    <div class="footer-cols">
      ${column("Product",         PRODUCT_LINKS, "footer-product")}
      ${column("PDF Tools",       PDF_LINKS)}
      ${column("Image Tools",     IMAGE_LINKS)}
      ${column("AI Tools",        AI_LINKS)}
      ${column("Portal Guides",   PORTAL_LINKS)}
    </div>

    <!-- ── Fine print ── -->
    <p class="fine">© ${year} UploadSure. Does not guarantee acceptance by any third-party portal — specs are provided as a best-effort aid; always confirm against the official notification for your application. Press <span class="kbd">D</span> to toggle theme.</p>

  </div>
</footer>`;

})();
