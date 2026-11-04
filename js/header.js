/*
  header.js — UploadSure shared header
*/

(function () {

  const el = document.getElementById("site-header");
  if (!el) return;

  function icon(path) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" width="18" height="18"
      aria-hidden="true">${path}</svg>`;
  }

  const MENUS = {
    "application-pack.html": {
      label: "Application",
      items: [
        { href: "application-pack.html?portal=ssc",      icon: icon('<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>'),                                                                   title: "SSC",            desc: "CGL, CHSL, MTS, GD photo & signature" },
        { href: "application-pack.html?portal=upsc",     icon: icon('<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M6 20c0-3 2.7-5 6-5s6 2 6 5"/>'), title: "UPSC",           desc: "Civil Services, NDA, CDS" },
        { href: "application-pack.html?portal=ibps",     icon: icon('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M12 12h.01"/>'),                                                   title: "IBPS / SBI",     desc: "Banking PO & Clerk" },
        { href: "application-pack.html?portal=jee",      icon: icon('<path d="M2 12h4l3-9 5 18 3-9h5"/>'),                                                                                       title: "NTA JEE Main",   desc: "Engineering entrance photo" },
        { href: "application-pack.html?portal=neet",     icon: icon('<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>'),                                                                                    title: "NTA NEET UG",    desc: "Medical entrance photo & signature" },
        { href: "application-pack.html?portal=passport", icon: icon('<path d="M3 10h18M3 6h18M3 14h18M3 18h18"/>'),                                                                              title: "Passport Photo", desc: "India, US, UK, EU, Canada & more" },
        { href: "application-pack.html?portal=pan",      icon: icon('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>'),                                 title: "PAN Card",       desc: "Protean / NSDL photo & signature" },
        { href: "application-pack.html?portal=kyc",      icon: icon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),                                      title: "Bank KYC",       desc: "Photo resize for bank verification" },
        { href: "exam-photo-size.html", icon: icon('<path d="M5 12h14M12 5l7 7-7 7"/>'), title: "All Exams →", desc: "Photo & signature size for every exam" },
      ],
    },
    "image-tools.html": {
      label: "Image",
      items: [
        { href: "image-tools.html#t-smartcompress", icon: icon('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),                                                       title: "Smart Compress",    desc: "Best quality at any file size" },
        { href: "image-tools.html#t-resize",        icon: icon('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),                                               title: "Resize",            desc: "Exact pixel dimensions" },
        { href: "image-tools.html#t-crop",          icon: icon('<path d="M6 2v14h14M2 6h14"/>'),                                                                     title: "Crop",              desc: "Interactive drag-and-crop" },
        { href: "image-tools.html#t-convert",       icon: icon('<path d="M4 4v6h6M20 20v-6h-6M20 8a8 8 0 00-14.9-2M4 16a8 8 0 0014.9 2"/>'),                       title: "Convert Format",    desc: "JPG, PNG, WebP, AVIF, BMP, ICO" },
        { href: "image-tools.html#t-watermark",     icon: icon('<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'),                             title: "Watermark",         desc: "Add text over any image" },
        { href: "image-tools.html#t-device",        icon: icon('<rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'),     title: "Screenshot Studio", desc: "Device frames & gradient backgrounds" },
        { href: "image-tools.html#t-og",            icon: icon('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20"/>'),                            title: "OG Image",          desc: "Social preview cards 1200×630" },
        { href: "image-tools.html#t-favicon",       icon: icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>'),               title: "Favicon",           desc: "ICO + PNG for any website" },
        { href: "image-tools.html",                 icon: icon('<path d="M5 12h14M12 5l7 7-7 7"/>'),                                                                 title: "All Image Tools →", desc: "19 tools in total" },
      ],
    },
    "ai-tools.html": {
      label: "AI",
      items: [
        { href: "ai-tools.html#t-ai-bg",      icon: icon('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),                                      title: "Background Remover", desc: "Neural removal — hair, people, objects" },
        { href: "ai-tools.html#t-ai-face",    icon: icon('<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'),                                                  title: "Face Blur",          desc: "Auto-detects & blurs all faces" },
        { href: "ai-tools.html#t-passport",   icon: icon('<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M6 20c0-3 2.7-5 6-5s6 2 6 5"/>'),title: "Passport Photo",     desc: "9 country specs, auto background" },
        { href: "ai-tools.html#t-obj-remove", icon: icon('<path d="M3 6h18M3 12h18M3 18h18"/>'),                                                                                     title: "Object Remover",     desc: "Paint & erase any object" },
        { href: "ai-tools.html#t-composite",  icon: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),      title: "Photo Composite",    desc: "Place yourself in any background" },
        { href: "ai-tools.html#t-photo-check", icon: icon('<rect x="3" y="2" width="18" height="20" rx="2"/><circle cx="12" cy="9" r="3"/><path d="M6 20c0-3 2.7-5 6-5s6 2 6 5"/>'), title: "Photo Rejection Checker", desc: "Will your photo be rejected? Find out first" },
        { href: "ai-tools.html#t-sig-clean",   icon: icon('<path d="M3 17c3-1 4-8 7-8s1 7 4 7 3-4 4-4 2 2 3 2"/><path d="M3 21h18"/>'),                                    title: "Signature Cleaner",  desc: "Phone photo → clean signature on white" },
        { href: "ai-tools.html#t-doc-scan",    icon: icon('<path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 9h8M8 12h8M8 15h5"/>'),                                     title: "Document Scanner",   desc: "Phone photo → scanned PDF under a KB limit" },
      ],
    },
    "pdf-tools.html": {
      label: "PDF",
      items: [
        { href: "pdf-tools.html#t-merge",         icon: icon('<path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z"/><path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8"/><path d="M15 2v5h5"/>'), title: "Merge PDF",     desc: "Combine multiple PDFs into one" },
        { href: "pdf-tools.html#t-split",         icon: icon('<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>'),                                                                       title: "Split PDF",     desc: "Extract pages or split into files" },
        { href: "pdf-tools.html#t-pdfcompress",   icon: icon('<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>'),                                                                                                                                                                            title: "Compress PDF",  desc: "Shrink to a target file size" },
        { href: "pdf-tools.html#t-rotate-pdf",    icon: icon('<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>'),                                                                                                                                   title: "Rotate PDF",    desc: "Fix sideways or upside-down pages" },
        { href: "pdf-tools.html#t-organize",      icon: icon('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),                                                                                                                                                         title: "Organize",      desc: "Reorder, duplicate, delete pages" },
        { href: "pdf-tools.html#t-pdf2jpg",       icon: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),                                                                                                     title: "PDF to JPG",    desc: "Export each page as an image" },
        { href: "pdf-tools.html#t-sign-pdf",      icon: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>'),                                                                                                                                title: "Sign PDF",      desc: "Place your signature on any page" },
        { href: "pdf-tools.html#t-watermark-pdf", icon: icon('<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>'),                                                                                                                                                  title: "Watermark PDF", desc: "Stamp text across every page" },
      ],
    },
  };

  /* ── Build nav HTML ── */
  const navGroups = Object.entries(MENUS).map(([page, menu]) => {
    const items = menu.items.map(item => `
      <a href="${item.href}" class="nav-panel-link">
        <span class="nav-panel-icon">${item.icon}</span>
        <span class="nav-panel-body">
          <strong>${item.title}</strong>
          <span>${item.desc}</span>
        </span>
      </a>`).join("");

    return `
    <div class="nav-group" data-page="${page}">
      <a href="${page}" class="nav-cat" aria-haspopup="true" aria-expanded="false">
        ${menu.label}
        <svg class="nav-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" width="11" height="11" aria-hidden="true">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </a>
      <div class="nav-panel" role="menu" aria-hidden="true">
        ${items}
      </div>
    </div>`;
  }).join("");

  el.innerHTML = `
<header>
  <div class="wrap bar">
    <div class="brand">
      <a href="/" class="logo-link" aria-label="UploadSure home">
        <img src="assets/logo/logo.png" alt="UploadSure" class="logo-img"
          onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'mark',ariaHidden:'true'}))">
      </a>
    </div>
    <nav class="site-nav" id="siteNav">
      <!-- Nav groups with dropdowns -->
      <div class="nav-links-wrapper">${navGroups}</div>

      <!-- Search — icon button that expands -->
      <div class="search-bar" id="searchBar" role="search">
        <button class="search-toggle-btn" id="searchToggle" aria-label="Open search" aria-expanded="false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <div class="search-input-wrap" id="searchInputWrap">
          <input type="search" id="searchInput" placeholder="Search tools or portals…"
            autocomplete="off" aria-label="Search tools and portal specs" spellcheck="false">
          <button class="search-close-btn" id="searchClose" aria-label="Close search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
              width="14" height="14" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="search-results" id="searchResults" role="listbox" aria-live="polite"></div>
      </div>

      <button class="toggle" id="themeBtn" title="Toggle dark mode" aria-label="Toggle dark mode"></button>
    </nav>
  </div>

  <!-- Mobile dropdown overlay backdrop -->
  <div class="nav-backdrop" id="navBackdrop"></div>
</header>`;

  /* ── Active nav detection ── */
  const currentPage = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  el.querySelectorAll(".nav-group").forEach(group => {
    if (group.dataset.page === currentPage) {
      group.querySelector(".nav-cat").classList.add("nav-active");
    }
  });

  /* ══════════════════════════════════════════════
     DROPDOWN LOGIC
  ══════════════════════════════════════════════ */
  const isMobile = () => window.innerWidth <= 820;
  let closeTimer = null;

  function openGroup(group) {
    closeAllGroups();
    group.classList.add("open");
    group.querySelector(".nav-cat").setAttribute("aria-expanded", "true");
    group.querySelector(".nav-panel").setAttribute("aria-hidden", "false");
    if (isMobile()) {
      document.getElementById("navBackdrop").classList.add("active");
    }
  }

  function closeGroup(group) {
    group.classList.remove("open");
    group.querySelector(".nav-cat").setAttribute("aria-expanded", "false");
    group.querySelector(".nav-panel").setAttribute("aria-hidden", "true");
  }

  function closeAllGroups() {
    el.querySelectorAll(".nav-group.open").forEach(closeGroup);
    document.getElementById("navBackdrop").classList.remove("active");
  }

  el.querySelectorAll(".nav-group").forEach(group => {
    const cat = group.querySelector(".nav-cat");
    const panel = group.querySelector(".nav-panel");

    /* ── Click the label (Link navigation vs Mobile dropdown) ── */
    cat.addEventListener("click", e => {
      if (isMobile()) {
        const isOpen = group.classList.contains("open");
        if (!isOpen) {
          e.preventDefault(); // Stop navigation to open the menu first
          e.stopPropagation();
          closeAllGroups();
          openGroup(group);
        }
        // If already open, DO NOT prevent default. The browser will navigate to the page!
      }
      // On desktop, DO NOT prevent default. The browser will instantly navigate!
    });

    /* ── Desktop: mouse-enter to open, mouse-leave with delay ── */
    group.addEventListener("mouseenter", () => {
      if (isMobile()) return;
      clearTimeout(closeTimer);
      openGroup(group); // Open menu on hover for desktop users
    });
    group.addEventListener("mouseleave", () => {
      if (isMobile()) return;
      closeTimer = setTimeout(() => closeGroup(group), 200);
    });
    panel.addEventListener("mouseenter", () => {
      if (isMobile()) return;
      clearTimeout(closeTimer);
    });
    panel.addEventListener("mouseleave", () => {
      if (isMobile()) return;
      closeTimer = setTimeout(() => closeGroup(group), 200);
    });
  });

  /* Close on backdrop tap (mobile) */
  document.getElementById("navBackdrop").addEventListener("click", closeAllGroups);

  /* Close on outside click */
  document.addEventListener("click", e => {
    if (!e.target.closest(".nav-group") && !e.target.closest("#navBackdrop")) {
      closeAllGroups();
    }
  });

  /* Escape key */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeAllGroups();
  });

  /* ══════════════════════════════════════════════
     SEARCH ICON EXPAND/COLLAPSE
  ══════════════════════════════════════════════ */
  const searchBar    = document.getElementById("searchBar");
  const searchToggle = document.getElementById("searchToggle");
  const searchClose  = document.getElementById("searchClose");
  const searchInput  = document.getElementById("searchInput");

  function openSearch() {
    searchBar.classList.add("search-open");
    searchToggle.setAttribute("aria-expanded", "true");
    setTimeout(() => searchInput && searchInput.focus(), 50);
  }

  function closeSearch() {
    searchBar.classList.remove("search-open");
    searchToggle.setAttribute("aria-expanded", "false");
    if (searchInput) { searchInput.value = ""; }
    const results = document.getElementById("searchResults");
    if (results) results.innerHTML = "";
  }

  searchToggle.addEventListener("click", e => {
    e.stopPropagation();
    searchBar.classList.contains("search-open") ? closeSearch() : openSearch();
  });

  searchClose.addEventListener("click", e => {
    e.stopPropagation();
    closeSearch();
  });

  document.addEventListener("click", e => {
    if (!e.target.closest("#searchBar")) closeSearch();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeSearch();
    /* "/" or Ctrl+K to open search */
    if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) &&
        !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      openSearch();
    }
  });


  /* ══════════════════════════════════════════════
     STICKY SHRINKING HEADER
     Adds .scrolled class after 40px of scroll.
     Uses requestAnimationFrame throttling for smooth 60fps.
  ══════════════════════════════════════════════ */
  const headerEl = el.querySelector("header");
  if (headerEl) {
    const THRESHOLD = 40;
    let ticking = false;
    let lastState = false;

    function onScroll() {
      const scrolled = window.scrollY > THRESHOLD;
      if (scrolled !== lastState) {
        headerEl.classList.toggle("scrolled", scrolled);
        lastState = scrolled;
      }
      ticking = false;
    }

    window.addEventListener("scroll", () => {
      if (!ticking) {
        requestAnimationFrame(onScroll);
        ticking = true;
      }
    }, { passive: true });

    /* Initial check on load (in case page loads mid-scroll) */
    onScroll();
  }

})();