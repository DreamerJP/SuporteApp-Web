// SuporteApp Web - Service Worker
// Versão 3.8.2
const CACHE_NAME = "suporteapp-v3.8.2";
const urlsToCache = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/SuporteApp-Assets/favicon.png",
  "./assets/SuporteApp-Assets/favicon.ico",
  "./texts.json",
];

// Instalação - Cacheia os recursos essenciais
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log("[SW] Iniciando cache de recursos...");
      for (const url of urlsToCache) {
        try {
          await cache.add(new Request(url, { cache: "reload" }));
        } catch (err) {
          console.warn(`[SW] Falha ao cachear: ${url} - O arquivo pode estar faltando.`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Ativação - Limpa caches antigos e assume controle imediato
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Evento Fetch Único - Gerencia cache e atalhos PWA
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Tratamento Especial para o modo compacto (Shortcuts)
  if (
    event.request.mode === "navigate" &&
    url.searchParams.get("mode") === "popup"
  ) {
    event.respondWith(
      (async () => {
        // Tenta encontrar uma janela já aberta com esse modo
        const allClients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        for (const client of allClients) {
          const clientUrl = new URL(client.url);
          if (clientUrl.searchParams.get("mode") === "popup") {
            client.focus();
            return new Response("", { status: 204 });
          }
        }

        // Se não houver, serve o index.html do cache (ignorando os parâmetros da URL)
        const cacheResponse = await caches.match("index.html", { ignoreSearch: true });
        return cacheResponse || fetch(event.request);
      })(),
    );
    return;
  }

  // 2. Fluxo Normal de Cache (GET requests)
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== "basic"
          ) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("index.html", { ignoreSearch: true });
          }
        });
    }),
  );
});

// Mensagens
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
