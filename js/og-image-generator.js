/*
  og-image-generator.js
  -----------------------
  Open Graph / social preview card generator.
  Produces 1200×630 PNG images for Twitter, Facebook, LinkedIn, Discord etc.
  Everything runs on canvas — no external libraries.
*/

const OG_GRADIENTS = {
  "cyber":    { stops: ["#7B2FFF","#00E5FF"], angle: 135, dark: true },
  "sunset":   { stops: ["#FF416C","#FF4B2B"], angle: 135, dark: true },
  "ocean":    { stops: ["#1CB5E0","#000046"], angle: 135, dark: true },
  "emerald":  { stops: ["#11998E","#38EF7D"], angle: 135, dark: true },
  "midnight": { stops: ["#0F0C29","#302B63"], angle: 180, dark: true },
  "rose":     { stops: ["#F093FB","#F5576C"], angle: 135, dark: true },
  "warm":     { stops: ["#F7971E","#FFD200"], angle: 135, dark: false },
  "light":    { stops: ["#F5F7FA","#C3CFE2"], angle: 180, dark: false },
  "carbon":   { stops: ["#1C1C1E","#2C2C2E"], angle: 180, dark: true },
  "white":    { stops: ["#FFFFFF","#F0F2F5"], angle: 180, dark: false },
};

const OG_SIZES = {
  "og":      { w: 1200, h: 630,  label: "OG / Facebook / LinkedIn (1200×630)" },
  "twitter": { w: 1200, h: 628,  label: "Twitter / X card (1200×628)" },
  "discord": { w: 1200, h: 630,  label: "Discord embed (1200×630)" },
  "product": { w: 1200, h: 630,  label: "Product Hunt (1200×630)" },
};

function initOgImageGenerator() {
  let logoImage = null;
  let bgImageData = null;

  const canvas  = document.getElementById("ogCanvas");
  const ctx     = canvas.getContext("2d");

  const inputs = {
    title:    document.getElementById("ogTitle"),
    subtitle: document.getElementById("ogSubtitle"),
    site:     document.getElementById("ogSite"),
    badge:    document.getElementById("ogBadge"),
    size:     document.getElementById("ogSize"),
    align:    document.getElementById("ogAlign"),
    pattern:  document.getElementById("ogPattern"),
  };

  // logo upload
  const logoInput = document.getElementById("ogLogo");
  if (logoInput) {
    logoInput.addEventListener("change", async () => {
      if (!logoInput.files[0]) return;
      logoImage = await loadImageFromFile(logoInput.files[0]);
      renderOg();
    });
  }

  // bg image upload
  const bgInput = document.getElementById("ogBgImage");
  if (bgInput) {
    bgInput.addEventListener("change", async () => {
      if (!bgInput.files[0]) { bgImageData = null; renderOg(); return; }
      bgImageData = await loadImageFromFile(bgInput.files[0]);
      renderOg();
    });
  }

  // gradient seg
  document.querySelectorAll("#ogGradSeg button").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll("#ogGradSeg button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      document.getElementById("ogBgImageWrap").style.display = btn.dataset.grad === "image" ? "block" : "none";
      renderOg();
    };
  });

  // all text inputs / selects live-update the preview
  Object.values(inputs).forEach(el => {
    if (el) el.addEventListener("input", renderOg);
  });

  // download
  document.getElementById("ogDownload").onclick = () => {
    const sizeKey = inputs.size ? inputs.size.value : "og";
    const { w, h } = OG_SIZES[sizeKey] || OG_SIZES["og"];
    renderOg(w, h, true);
    canvas.toBlob(blob => {
      triggerDownload(blob, "og-image.png");
    }, "image/png");
  };

  // copy to clipboard
  const copyBtn = document.getElementById("ogCopy");
  if (copyBtn) {
    copyBtn.onclick = () => {
      canvas.toBlob(async blob => {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          showToast("Copied to clipboard!");
        } catch {
          showToast("Copy failed — use Download instead");
        }
      }, "image/png");
    };
  }

  // Defer first render until after layout so parentElement.clientWidth is real
  requestAnimationFrame(() => requestAnimationFrame(renderOg));

  function renderOg(exportW, exportH, highRes) {
    const sizeKey = inputs.size ? inputs.size.value : "og";
    const { w: SW, h: SH } = OG_SIZES[sizeKey] || OG_SIZES["og"];
    const W = exportW || SW;
    const H = exportH || SH;
    // Use clientWidth of the canvas wrapper; never let scale go to 0
    const containerW = canvas.parentElement?.clientWidth || canvas.parentElement?.offsetWidth || 560;
    const SCALE = highRes ? 1 : Math.min(1, Math.max(0.1, containerW / W));

    canvas.width  = Math.round(W * (highRes ? 1 : SCALE));
    canvas.height = Math.round(H * (highRes ? 1 : SCALE));
    const S = highRes ? 1 : SCALE;
    ctx.setTransform(S, 0, 0, S, 0, 0);

    // ── Background ──
    const gradBtn = document.querySelector("#ogGradSeg button.on");
    const gradKey = gradBtn ? gradBtn.dataset.grad : "cyber";
    const grad = OG_GRADIENTS[gradKey];
    const isDark = grad ? grad.dark : true;

    if (gradKey === "image" && bgImageData) {
      // Cover-fit bg image
      const ia = bgImageData.width / bgImageData.height;
      const ca = W / H;
      let dw, dh, dx, dy;
      if (ia > ca) { dh = H; dw = dh * ia; dx = -(dw - W) / 2; dy = 0; }
      else { dw = W; dh = dw / ia; dx = 0; dy = -(dh - H) / 2; }
      ctx.drawImage(bgImageData, dx, dy, dw, dh);
      // Darken overlay for readability
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(0, 0, W, H);
    } else if (grad && grad.stops) {
      const rad = (grad.angle * Math.PI) / 180;
      const x1 = W / 2 - Math.cos(rad) * W / 2;
      const y1 = H / 2 - Math.sin(rad) * H / 2;
      const x2 = W / 2 + Math.cos(rad) * W / 2;
      const y2 = H / 2 + Math.sin(rad) * H / 2;
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, grad.stops[0]);
      g.addColorStop(1, grad.stops[1]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = "#1C1C1E";
      ctx.fillRect(0, 0, W, H);
    }

    // ── Pattern overlay ──
    const patternKey = inputs.pattern ? inputs.pattern.value : "none";
    if (patternKey !== "none") {
      drawPattern(ctx, W, H, patternKey, isDark);
    }

    const textColor    = isDark ? "#FFFFFF" : "#111111";
    const subtleColor  = isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.55)";
    const align = inputs.align ? inputs.align.value : "left";
    const PAD = 72;

    let textX;
    if (align === "center") { textX = W / 2; ctx.textAlign = "center"; }
    else if (align === "right") { textX = W - PAD; ctx.textAlign = "right"; }
    else { textX = PAD; ctx.textAlign = "left"; }

    let cursorY = H * 0.28;

    // ── Logo ──
    if (logoImage) {
      const logoH = 52;
      const logoW = logoH * (logoImage.width / logoImage.height);
      const logoX = align === "center" ? W / 2 - logoW / 2 :
                    align === "right"  ? W - PAD - logoW : PAD;
      ctx.drawImage(logoImage, logoX, cursorY, logoW, logoH);
      cursorY += logoH + 28;
    }

    // ── Badge ──
    const badgeText = inputs.badge ? inputs.badge.value.trim() : "";
    if (badgeText) {
      ctx.font = `700 22px "IBM Plex Mono", "Courier New", monospace`;
      const bW = ctx.measureText(badgeText).width + 28;
      const bH = 36;
      const bX = align === "center" ? W / 2 - bW / 2 :
                 align === "right"  ? W - PAD - bW : PAD;
      ctx.fillStyle = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)";
      roundRectFill(ctx, bX, cursorY, bW, bH, 6);
      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.fillText(badgeText, bX + bW / 2, cursorY + 24);
      if (align === "center") ctx.textAlign = "center";
      else if (align === "right") ctx.textAlign = "right";
      else ctx.textAlign = "left";
      cursorY += bH + 24;
    }

    // ── Title ──
    const title = inputs.title ? inputs.title.value.trim() : "";
    if (title) {
      const maxW = W - PAD * 2;
      const lines = wrapText(ctx, title, maxW, 700, 62, `"IBM Plex Sans", "Inter", system-ui, sans-serif`);
      ctx.fillStyle = textColor;
      ctx.shadowColor = "rgba(0,0,0,0.25)";
      ctx.shadowBlur = 12;
      lines.forEach(line => {
        ctx.fillText(line, textX, cursorY);
        cursorY += 76;
      });
      ctx.shadowBlur = 0;
    }

    // ── Subtitle ──
    const subtitle = inputs.subtitle ? inputs.subtitle.value.trim() : "";
    if (subtitle) {
      cursorY += 8;
      ctx.font = `400 28px "IBM Plex Sans", "Inter", system-ui, sans-serif`;
      ctx.fillStyle = subtleColor;
      const maxW = W - PAD * 2;
      const lines = wrapText(ctx, subtitle, maxW, 400, 28, `"IBM Plex Sans", "Inter", system-ui, sans-serif`);
      lines.forEach(line => {
        ctx.fillText(line, textX, cursorY);
        cursorY += 40;
      });
    }

    // ── Site name ── (bottom left/right/center)
    const site = inputs.site ? inputs.site.value.trim() : "";
    if (site) {
      ctx.font = `600 22px "IBM Plex Mono", "Courier New", monospace`;
      ctx.fillStyle = subtleColor;
      ctx.textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
      ctx.fillText(site, textX, H - 42);
    }

    // Update preview label
    const label = document.getElementById("ogSizeLabel");
    if (label) label.textContent = OG_SIZES[sizeKey]?.label || "";
  }
}

function wrapText(ctx, text, maxWidth, weight, size, family) {
  ctx.font = `${weight} ${size}px ${family}`;
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3); // max 3 lines
}

function roundRectFill(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function drawPattern(ctx, W, H, type, isDark) {
  const alpha = isDark ? 0.08 : 0.06;
  ctx.strokeStyle = isDark ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
  ctx.lineWidth = 1;
  if (type === "grid") {
    const step = 48;
    for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else if (type === "dots") {
    const step = 36;
    ctx.fillStyle = isDark ? `rgba(255,255,255,${alpha * 1.5})` : `rgba(0,0,0,${alpha * 1.5})`;
    for (let x = step; x < W; x += step) {
      for (let y = step; y < H; y += step) {
        ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (type === "diagonal") {
    const step = 36;
    for (let i = -H; i < W + H; i += step) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke();
    }
  }
}
