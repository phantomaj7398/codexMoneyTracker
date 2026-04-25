const CACHE_NAME = "money-tracker-v2";
const SHARE_DB_NAME = "moneyTrackerShareDb";
const SHARE_STORE_NAME = "sharedImages";
const SHARED_IMAGE_ID = "latest";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./share.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/tesseract-core.wasm.js",
  "./vendor/tesseract/tesseract-core-simd.wasm.js",
  "./vendor/tesseract/eng.traineddata.gz",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method === "POST" && requestUrl.pathname.endsWith("/share.html")) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }

          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => caches.match("./index.html"));
    }),
  );
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!image || typeof image === "string" || !image.type.startsWith("image/")) {
      return Response.redirect(getAppUrl("?fromShare=1&shareError=missing-image"), 303);
    }

    const base64 = await fileToBase64(image);
    await saveSharedImage({
      id: SHARED_IMAGE_ID,
      image: base64,
      name: image.name || "shared-image",
      type: image.type,
      receivedAt: new Date().toISOString(),
    });

    return Response.redirect(getAppUrl("?fromShare=1"), 303);
  } catch (error) {
    return Response.redirect(getAppUrl("?fromShare=1&shareError=failed"), 303);
  }
}

function getAppUrl(search) {
  return new URL(search, self.registration.scope).href;
}

function fileToBase64(file) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return `data:${file.type};base64,${btoa(binary)}`;
  });
}

async function saveSharedImage(record) {
  const db = await openShareDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SHARE_STORE_NAME, "readwrite");
    const request = transaction.objectStore(SHARE_STORE_NAME).put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(SHARE_STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
