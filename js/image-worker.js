/*
  image-worker.js
  ----------------
  Runs off the main thread so large batches (many images, or a
  many-page PDF being recompressed) don't freeze the tab on a
  low-end phone. Everything here uses OffscreenCanvas, which has
  no access to the DOM — that's fine, all it needs is pixels in
  and an encoded blob out.

  Messages in:  { id, type, ...payload }
  Messages out: { id, ok, result } or { id, ok:false, error }

  Supported types:
    "compressUnderSize"  -> shrink an image under a target KB, downscaling if needed
    "resizeExact"        -> cover-crop + resize to an exact width/height
    "convertFormat"      -> re-encode to a different mime type
    "encodePdfPage"       -> re-encode an already-rendered PDF page bitmap as a compressed JPEG
*/

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    const result = await handleMessage(event.data);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};

async function handleMessage(data) {
  switch (data.type) {
    case "compressUnderSize":
      return compressImageUnderSize(data.bitmap, data.mimeType, data.maxKilobytes);
    case "resizeExact":
      return resizeExactCover(data.bitmap, data.mimeType, data.targetWidth, data.targetHeight);
    case "convertFormat":
      return convertFormat(data.bitmap, data.mimeType);
    case "encodePdfPage":
      return encodePdfPage(data.bitmap, data.quality);
    case "compressFixedDimensions":
      return compressFixedDimensions(data.bitmap, data.mimeType, data.maxKilobytes);
    case "smartCompress":
      return smartCompress(data.bitmap, data.sourceMimeType || data.mimeType, data.targetMimeType, data.quality !== undefined ? data.quality : 0.82);
    default:
      throw new Error("Unknown worker task: " + data.type);
  }
}

/* Draws onto a fresh OffscreenCanvas at the given size. Only fills a
   white background when the OUTPUT format is JPEG — JPEG has no alpha
   channel, so without this, transparent areas would render as black
   instead of white. PNG and WebP both support transparency, so for
   those we leave the canvas transparent and let it stay that way. */
function drawToCanvas(width, height, outputMimeType) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (outputMimeType === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

async function encodeCanvas(canvas, mimeType, quality) {
  return canvas.convertToBlob({ type: mimeType, quality });
}

/* Binary-searches JPEG/WebP quality to land just under maxKilobytes.
   PNG has no quality knob, so it's returned as-is at full size. */
async function compressImageUnderSize(bitmap, mimeType, maxKilobytes) {
  const maxBytes = maxKilobytes * 1024;

  if (mimeType === "image/png") {
    const { canvas } = drawToCanvas(bitmap.width, bitmap.height, mimeType);
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    const blob = await encodeCanvas(canvas, mimeType);
    return { blob, width: bitmap.width, height: bitmap.height };
  }

  let targetWidth = bitmap.width;

  for (let downscaleStep = 0; downscaleStep < 7; downscaleStep++) {
    const scale = Math.min(1, targetWidth / bitmap.width);
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const { canvas, ctx } = drawToCanvas(width, height, mimeType);
    ctx.drawImage(bitmap, 0, 0, width, height);

    let low = 0.2, high = 0.95;
    let best = await encodeCanvas(canvas, mimeType, 0.3);

    for (let i = 0; i < 8; i++) {
      const quality = (low + high) / 2;
      const candidate = await encodeCanvas(canvas, mimeType, quality);
      if (candidate.size > maxBytes) {
        high = quality;
      } else {
        best = candidate;
        low = quality;
      }
    }

    if (best.size <= maxBytes) {
      return { blob: best, width, height };
    }
    targetWidth = Math.round(targetWidth * 0.82);
  }

  // Ran out of downscale steps — return the smallest attempt we made.
  const scale = Math.min(1, targetWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const { canvas, ctx } = drawToCanvas(width, height, mimeType);
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await encodeCanvas(canvas, mimeType, 0.3);
  return { blob, width, height };
}

/* Cover-crop (fill without stretching) to an exact output size. */
async function resizeExactCover(bitmap, mimeType, targetWidth, targetHeight) {
  const { canvas, ctx } = drawToCanvas(targetWidth, targetHeight, mimeType);
  const scale = Math.max(targetWidth / bitmap.width, targetHeight / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  ctx.drawImage(bitmap, offsetX, offsetY, drawWidth, drawHeight);
  const blob = await encodeCanvas(canvas, mimeType, 0.92);
  return { blob, width: targetWidth, height: targetHeight };
}

/* Same pixels, different container format. */
async function convertFormat(bitmap, mimeType) {
  const { canvas, ctx } = drawToCanvas(bitmap.width, bitmap.height, mimeType);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await encodeCanvas(canvas, mimeType, 0.92);
  return { blob, width: bitmap.width, height: bitmap.height };
}

/* Used by the Application Pack: the portal spec fixes the exact
   width/height, so unlike compressImageUnderSize this never downscales
   — it only searches JPEG/WebP quality to land under maxKilobytes. */
async function compressFixedDimensions(bitmap, mimeType, maxKilobytes) {
  const maxBytes = maxKilobytes * 1024;
  const { canvas, ctx } = drawToCanvas(bitmap.width, bitmap.height, mimeType);
  ctx.drawImage(bitmap, 0, 0);

  if (mimeType === "image/png") {
    const blob = await encodeCanvas(canvas, mimeType);
    return { blob, width: bitmap.width, height: bitmap.height };
  }

  let low = 0.3, high = 0.95;
  let best = await encodeCanvas(canvas, mimeType, 0.92);
  for (let i = 0; i < 9; i++) {
    const quality = (low + high) / 2;
    const candidate = await encodeCanvas(canvas, mimeType, quality);
    if (candidate.size > maxBytes) {
      high = quality;
    } else {
      best = candidate;
      low = quality;
    }
  }
  if (best.size > maxBytes) {
    best = await encodeCanvas(canvas, mimeType, 0.3);
  }
  return { blob: best, width: bitmap.width, height: bitmap.height };
}

/* Used by PDF-compress Medium/High: the main thread renders each PDF
   page to a bitmap via pdf.js, then hands it here to be JPEG-encoded
   off the main thread — the part that gets slow on a 50-page document. */
async function encodePdfPage(bitmap, quality) {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const blob = await encodeCanvas(canvas, "image/jpeg", quality);
  return { blob, width: bitmap.width, height: bitmap.height };
}

/*
  smartCompress: called by Smart Compress tool.
  sourceMimeType — what the user uploaded (jpeg/png/webp)
  targetMimeType — what they want out (may equal source, or jpeg/webp for PNG conversion)
  quality        — 0–1, e.g. 0.82 from the slider

  For PNG→PNG: canvas can't do real lossy quantization so we just return
  the bitmap re-encoded at full quality. The front end will compare against
  the original and hand back the original if we didn't beat it.
  For everything else: a straightforward quality re-encode in the target format.
*/
async function smartCompress(bitmap, sourceMimeType, targetMimeType, quality) {
  const outMime = targetMimeType || sourceMimeType;

  if (outMime === "image/png") {
    // PNG output has no quality knob — lossless re-encode only.
    // The front end handles the "never bigger than original" guarantee.
    const { canvas, ctx } = drawToCanvas(bitmap.width, bitmap.height, "image/png");
    ctx.drawImage(bitmap, 0, 0);
    const blob = await encodeCanvas(canvas, "image/png");
    return { blob, width: bitmap.width, height: bitmap.height, outputMimeType: "image/png" };
  }

  // JPEG or WebP output: real lossy compression at the chosen quality.
  // White-fill only for JPEG (no alpha channel); WebP keeps transparency.
  const { canvas, ctx } = drawToCanvas(bitmap.width, bitmap.height, outMime);
  ctx.drawImage(bitmap, 0, 0);
  const blob = await encodeCanvas(canvas, outMime, quality);
  return { blob, width: bitmap.width, height: bitmap.height, outputMimeType: outMime };
}
