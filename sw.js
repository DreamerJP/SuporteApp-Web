// SuporteApp Web - Service Worker
// Versão 3.7.4

const CACHE_NAME = "suporteapp-v3.7.4";
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/SuporteApp-Assets/favicon.png",
  "./texts.json",
];

// Install event - Cache resources
self.addEventListener("install", (event) => {
  console.log("[SW] Installing Service Worker...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log("[SW] Caching app shell");
        return cache.addAll(
          urlsToCache.map((url) => new Request(url, { cache: "reload" })),
        );
      })
      .catch((err) => {
        console.warn("[SW] Cache failed for some resources:", err);
      }),
  );
  self.skipWaiting();
});

// Activate event - Clean old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating Service Worker...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
  return self.clients.claim();
});

// Fetch event - Serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  // Ignore non-GET requests
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Cache hit - return response
      if (response) {
        return response;
      }

      // Clone the request
      const fetchRequest = event.request.clone();

      return fetch(fetchRequest)
        .then((response) => {
          // Check if valid response
          if (
            !response ||
            response.status !== 200 ||
            response.type !== "basic"
          ) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Network failed, try to return cached version
          return caches.match("./index.html");
        });
    }),
  );
});

// Handle messages from the app
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Handle navigation with shortcuts
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Check if this is a navigation request with mode=popup parameter
  if (
    event.request.mode === "navigate" &&
    url.searchParams.get("mode") === "popup"
  ) {
    console.log("[SW] Detected popup mode shortcut, intercepting...");

    event.respondWith(
      (async () => {
        // Get all window clients
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        // Check if there's already a popup window open
        let popupClient = null;
        for (const client of clients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.searchParams.get("mode") === "popup") {
            popupClient = client;
            break;
          }
        }

        if (popupClient) {
          // Focus existing popup
          console.log("[SW] Focusing existing popup window");
          popupClient.focus();
          // Return empty response to prevent opening new window
          return new Response("", { status: 204 });
        } else {
          // Let the request proceed to open new popup
          console.log("[SW] Opening new popup window");
          return fetch(event.request);
        }
      })(),
    );
  }
});
