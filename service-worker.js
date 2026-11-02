const CACHE_NAME = "biodomo-static-v5";
const PRECACHE_URLS = [
    "./",
    "./index.html",
    "./manifest.webmanifest",
    "./css/styles.css",
    "./js/notifications.js",
    "./favicon.ico",
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

self.addEventListener("push", (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (error) {
        console.error("El payload push de BioDomo no es JSON válido:", error);
    }

    const title = typeof payload.title === "string" ? payload.title : "BioDomo";
    const body = typeof payload.body === "string" ? payload.body : "Tienes una nueva notificación.";
    const options = {
        body,
        icon: "./assets/pwa-icons/icon-192.png",
        badge: "./assets/pwa-icons/icon-192.png",
        data: { url: "./#notificaciones" }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const targetUrl = new URL(event.notification.data?.url || "./", self.registration.scope);

    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((clients) => {
                const matchingClient = clients.find((client) => {
                    const clientUrl = new URL(client.url);
                    return clientUrl.origin === targetUrl.origin && clientUrl.pathname === targetUrl.pathname;
                });
                if (matchingClient) {
                    return matchingClient.navigate(targetUrl.href).then((client) => {
                        return client ? client.focus() : self.clients.openWindow(targetUrl.href);
                    });
                }
                return self.clients.openWindow(targetUrl.href);
            })
    );
});
