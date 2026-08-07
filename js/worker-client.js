/*
  worker-client.js
  -----------------
  Thin promise wrapper around image-worker.js. The worker protocol
  is just "send a message with an id, get a message back with the
  same id" — this file hides that behind normal async functions so
  the rest of the codebase never touches postMessage directly.
*/

const imageWorker = new Worker("js/image-worker.js");

let nextRequestId = 1;
const pendingRequests = new Map();

imageWorker.onmessage = (event) => {
  const { id, ok, result, error } = event.data;
  const pending = pendingRequests.get(id);
  if (!pending) return;
  pendingRequests.delete(id);
  if (ok) {
    pending.resolve(result);
  } else {
    pending.reject(new Error(error));
  }
};

imageWorker.onerror = (event) => {
  // A worker-level failure (e.g. the script itself failed to load)
  // rejects every request currently in flight.
  for (const [id, pending] of pendingRequests) {
    pending.reject(new Error("Image worker failed to run: " + event.message));
    pendingRequests.delete(id);
  }
};

function callWorker(type, payload, transferList) {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pendingRequests.set(id, { resolve, reject });
    imageWorker.postMessage({ id, type, ...payload }, transferList || []);
  });
}

/** Downscales/re-encodes an image until it fits under maxKilobytes. */
async function workerCompressUnderSize(bitmap, mimeType, maxKilobytes) {
  return callWorker("compressUnderSize", { bitmap, mimeType, maxKilobytes }, [bitmap]);
}

/** Cover-crops and resizes to an exact pixel size. */
async function workerResizeExact(bitmap, mimeType, targetWidth, targetHeight) {
  return callWorker("resizeExact", { bitmap, mimeType, targetWidth, targetHeight }, [bitmap]);
}

/** Quality-only compression that keeps the bitmap's exact current
    dimensions — used where the output size is a hard requirement
    (e.g. a portal's exact photo spec) and can't be downscaled. */
async function workerCompressFixedDimensions(bitmap, mimeType, maxKilobytes) {
  return callWorker("compressFixedDimensions", { bitmap, mimeType, maxKilobytes }, [bitmap]);
}

/** Re-encodes to a different image format at fixed quality. */
async function workerConvertFormat(bitmap, mimeType) {
  return callWorker("convertFormat", { bitmap, mimeType }, [bitmap]);
}

/** Encodes a rendered PDF page bitmap as a JPEG at the given quality. */
async function workerEncodePdfPage(bitmap, quality) {
  return callWorker("encodePdfPage", { bitmap, quality }, [bitmap]);
}

/** One-click automatic compression, no target size needed — see the
    detailed comment in image-worker.js for exactly what "smart" does
    and doesn't mean here. Result includes `outputMimeType`, since for
    PNG input this may come back as WebP instead. */
async function workerSmartCompress(bitmap, sourceMimeType, targetMimeType, quality) {
  return callWorker("smartCompress", { bitmap, mimeType: sourceMimeType, sourceMimeType, targetMimeType, quality }, [bitmap]);
}
