/*
  search.js
  ----------
  Global search for UploadSure.
  Finds tools (by name + keywords) and portal specs (by exam name).
  Opens on click or keyboard shortcut (/ or Ctrl+K).
  Pure vanilla JS, zero external dependencies.
*/

const SEARCH_INDEX = [

  /* ── IMAGE TOOLS ──────────────────────────────────────────── */
  { title: "Smart Compress",       page: "image-tools.html#t-smartcompress", category: "Image",  keywords: "compress smart auto quality png jpg webp reduce size kb" },
  { title: "Compress Image",       page: "image-tools.html#t-compress",      category: "Image",  keywords: "compress image reduce file size kb target 50kb 100kb photo" },
  { title: "Resize Image",         page: "image-tools.html#t-resize",        category: "Image",  keywords: "resize image pixels width height dimensions exact 200x230 350x350" },
  { title: "Crop Image",           page: "image-tools.html#t-crop",          category: "Image",  keywords: "crop image cut trim drag box area" },
  { title: "Convert Format",       page: "image-tools.html#t-convert",       category: "Image",  keywords: "convert jpg jpeg png webp avif bmp ico svg format change" },
  { title: "SVG ↔ PNG",           page: "image-tools.html#t-svg-png",       category: "Image",  keywords: "svg png convert vector raster" },
  { title: "Rotate / Flip",        page: "image-tools.html#t-rotate",        category: "Image",  keywords: "rotate flip 90 180 270 horizontal vertical mirror" },
  { title: "Watermark",            page: "image-tools.html#t-watermark",     category: "Image",  keywords: "watermark text logo stamp image opacity position" },
  { title: "Upscale Image",        page: "image-tools.html#t-upscale",       category: "Image",  keywords: "enlarge increase resolution bigger enhance scale up" },
  { title: "Remove Background",    page: "image-tools.html#t-removebg",      category: "Image",  keywords: "remove background bg transparent cutout" },
  { title: "Face Blur",            page: "image-tools.html#t-blur",          category: "Image",  keywords: "blur face anonymize privacy hide person mosaic" },
  { title: "HTML to Image",        page: "image-tools.html#t-html",          category: "Image",  keywords: "html css screenshot render image png" },
  { title: "Images to PDF",        page: "image-tools.html#t-i2pdf",         category: "Image",  keywords: "images to pdf jpg png combine merge photos pdf" },
  { title: "Social Media Resizer", page: "image-tools.html#t-smr",           category: "Image",  keywords: "social media resize instagram facebook twitter linkedin youtube whatsapp" },
  { title: "Meme Generator",       page: "image-tools.html#t-meme",          category: "Image",  keywords: "meme generator text impact caption top bottom funny" },
  { title: "Favicon Generator",    page: "image-tools.html#t-favicon",       category: "Image",  keywords: "favicon ico 16 32 48 icon website logo browser tab" },
  { title: "App Icon Generator",   page: "image-tools.html#t-appicon",       category: "Image",  keywords: "app icon apple android ios xcode pwa 27 sizes" },
  { title: "Screenshot Studio",    page: "image-tools.html#t-device",        category: "Image",  keywords: "screenshot device frame iphone android ipad macbook browser mockup app store" },
  { title: "OG Image Generator",   page: "image-tools.html#t-og",            category: "Image",  keywords: "og open graph social preview twitter facebook linkedin discord card 1200x630" },

  /* ── PDF TOOLS ────────────────────────────────────────────── */
  { title: "Merge PDF",            page: "pdf-tools.html#t-merge",           category: "PDF",    keywords: "merge pdf combine join multiple files one" },
  { title: "Split PDF",            page: "pdf-tools.html#t-split",           category: "PDF",    keywords: "split pdf extract pages separate range" },
  { title: "Compress PDF",         page: "pdf-tools.html#t-pdfcompress",     category: "PDF",    keywords: "compress pdf reduce size kb mb smaller upload portal certificate" },
  { title: "Rotate PDF",           page: "pdf-tools.html#t-rotate-pdf",      category: "PDF",    keywords: "rotate pdf pages 90 180 270 orientation" },
  { title: "Organize PDF Pages",   page: "pdf-tools.html#t-organize",        category: "PDF",    keywords: "organize reorder rearrange pages drag pdf" },
  { title: "PDF to JPG",           page: "pdf-tools.html#t-pdf2jpg",         category: "PDF",    keywords: "pdf to jpg jpeg image convert export pages" },
  { title: "Add Page Numbers",     page: "pdf-tools.html#t-pagenum",         category: "PDF",    keywords: "add page numbers pdf stamp footer header" },
  { title: "Watermark PDF",        page: "pdf-tools.html#t-watermark-pdf",   category: "PDF",    keywords: "watermark pdf text diagonal stamp confidential" },
  { title: "Crop PDF Margins",     page: "pdf-tools.html#t-crop-pdf",        category: "PDF",    keywords: "crop pdf margins trim whitespace border edges" },
  { title: "Sign PDF",             page: "pdf-tools.html#t-sign-pdf",        category: "PDF",    keywords: "sign pdf signature image place digital" },

  /* ── AI TOOLS ─────────────────────────────────────────────── */
  { title: "AI Background Remover",    page: "ai-tools.html#t-ai-bg",       category: "AI",     keywords: "ai background remove neural u2net hair person product transparent free" },
  { title: "Face Blur & Anonymizer",   page: "ai-tools.html#t-ai-face",     category: "AI",     keywords: "face blur anonymize detect automatic group photo ultraface ai" },
  { title: "Passport & ID Photo Maker",page: "ai-tools.html#t-passport",    category: "AI",     keywords: "passport photo id maker country spec india us uk eu canada australia japan background" },
  { title: "Object Remover",           page: "ai-tools.html#t-obj-remove",  category: "AI",     keywords: "object remove erase inpaint brush opencv fill background" },
  { title: "Photo Composite",          page: "ai-tools.html#t-composite",   category: "AI",     keywords: "photo composite place person background scene drag resize handles" },

  /* ── APPLICATION PACK — PORTALS ───────────────────────────── */
  { title: "SSC — CGL, CHSL, MTS, GD",         page: "application-pack.html", category: "Portal", keywords: "ssc cgl chsl mts gd photo signature size 200x230 20kb 50kb jpg" },
  { title: "UPSC — Civil Services, NDA, CDS",   page: "application-pack.html", category: "Portal", keywords: "upsc civil services nda cds photo 350x350 40kb 100kb signature 350x150" },
  { title: "IBPS / SBI — Banking PO, Clerk",    page: "application-pack.html", category: "Portal", keywords: "ibps sbi banking po clerk photo 200x230 signature 140x60" },
  { title: "NTA JEE Main",                      page: "application-pack.html", category: "Portal", keywords: "jee main nta photo signature size upload" },
  { title: "NTA NEET UG",                       page: "application-pack.html", category: "Portal", keywords: "neet ug nta photo passport postcard signature size" },
  { title: "Passport Photo — International",    page: "application-pack.html", category: "Portal", keywords: "passport photo international india us uk eu schengen canada australia china japan" },
  { title: "PAN Card — Protean / NSDL",         page: "application-pack.html", category: "Portal", keywords: "pan card protean nsdl photo signature" },
  { title: "Bank KYC",                          page: "application-pack.html", category: "Portal", keywords: "bank kyc photo id verification" },
];

/* ── CATEGORY COLOURS ── */
const CAT_COLOR = {
  Image:  { bg: "rgba(19,74,114,0.10)",  text: "var(--ink)" },
  PDF:    { bg: "rgba(192,57,43,0.10)",  text: "#c0392b" },
  AI:     { bg: "rgba(26,122,74,0.10)",  text: "#1a7a4a" },
  Portal: { bg: "rgba(160,100,11,0.12)", text: "#a0640b" },
};

function initSearch() {
  const bar    = document.getElementById("searchBar");
  const input  = document.getElementById("searchInput");
  const results= document.getElementById("searchResults");
  if (!bar || !input || !results) return;

  let activeIdx = -1;
  let filtered  = [];

  /* Open / close */
  input.addEventListener("focus", () => bar.classList.add("open"));
  input.addEventListener("blur", () => {
    setTimeout(() => {
      bar.classList.remove("open");
      activeIdx = -1;
    }, 180);
  });

  /* Keyboard shortcut: "/" or Ctrl+K */
  document.addEventListener("keydown", e => {
    if ((e.key === "/" && !isInputFocused()) ||
        (e.key === "k" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      input.focus();
      input.select();
    }
    if (e.key === "Escape") { input.blur(); }
  });

  /* Search on input */
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ""; activeIdx = -1; return; }

    filtered = SEARCH_INDEX.filter(item => {
      const q2 = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Word-boundary match on title so "upsc" doesn't hit "Upscale"
      const titleMatch = new RegExp(`(^|\\s|-)${q2}($|\\s|-)`, "i").test(item.title);
      const keywordMatch = item.keywords.toLowerCase().includes(q);
      const categoryMatch = item.category.toLowerCase().includes(q);
      return titleMatch || keywordMatch || categoryMatch;
    }).slice(0, 8);

    renderResults();
  });

  /* Arrow keys + Enter */
  input.addEventListener("keydown", e => {
    if (!filtered.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, filtered.length - 1); renderResults(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderResults(); }
    if (e.key === "Enter" && activeIdx >= 0) {
      navigate(filtered[activeIdx]);
    } else if (e.key === "Enter" && filtered.length) {
      navigate(filtered[0]);
    }
  });

  function renderResults() {
    if (!filtered.length) {
      results.innerHTML = `<div class="search-empty">No results for "${input.value.trim()}"</div>`;
      return;
    }
    results.innerHTML = filtered.map((item, i) => {
      const col = CAT_COLOR[item.category] || CAT_COLOR.Image;
      const active = i === activeIdx ? " active" : "";
      return `<a class="search-result${active}" href="${item.page}" data-idx="${i}">
        <span class="search-cat" style="background:${col.bg};color:${col.text}">${item.category}</span>
        <span class="search-title">${highlight(item.title, input.value.trim())}</span>
      </a>`;
    }).join("");

    /* Click on result */
    results.querySelectorAll(".search-result").forEach(el => {
      el.addEventListener("mousedown", e => {
        e.preventDefault();
        navigate(filtered[+el.dataset.idx]);
      });
    });
  }

  function navigate(item) {
    input.blur();
    results.innerHTML = "";
    input.value = "";
    window.location.href = item.page;
  }

  function highlight(text, query) {
    if (!query) return text;
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.replace(re, "<mark>$1</mark>");
  }

  function isInputFocused() {
    const t = document.activeElement?.tagName;
    return t === "INPUT" || t === "TEXTAREA" || t === "SELECT";
  }
}

document.addEventListener("DOMContentLoaded", initSearch);
