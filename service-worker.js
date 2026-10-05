const CACHE_NAME = "biodomo-static-v2";
const PRECACHE_URLS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./css/styles.css",
    "./assets/logo.png",
    "./assets/hero.jpg",
    "./assets/pwa-icons/icon-192.png",
    "./assets/pwa-icons/icon-512.png",
    "./assets/pwa-icons/apple-touch-icon.png"
];
const CACHEABLE_DESTINATIONS = new Set(["style", "script", "image", "font", "manifest"]);

function cacheResponse(request, response) {
    return caches.open(CACHE_NAME)
        .then((cache) => cache.put(request, response))
        .catch((error) => {
            console.error("No se pudo guardar un recurso de BioDomo en caché:", error);
        });
}

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((cacheName) => cacheName.startsWith("biodomo-static-") && cacheName !== CACHE_NAME)
                    .map((cacheName) => caches.delete(cacheName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const { request } = event;

    if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(async (response) => {
                    if (response.ok) {
                        await cacheResponse("./index.html", response.clone());
                    }
                    return response;
                })
                .catch(async () => {
                    const cachedPage = await caches.match("./index.html");
                    if (cachedPage) {
                        return cachedPage;
                    }
                    throw new Error("No hay una copia local de BioDomo disponible.");
                })
        );
        return;
    }

    if (!CACHEABLE_DESTINATIONS.has(request.destination) || request.headers.has("range")) {
        return;
    }

    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request).then((response) => {
                    if (response.ok && response.type === "basic") {
                        return cacheResponse(request, response.clone()).then(() => response);
                    }
                    return response;
                });
            })
    );
});
