const CACHE_NAME = "acara-poker-club-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-96.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Chamadas de API nunca passam pelo cache
  if (req.url.includes("api.anthropic.com")) return;
  if (req.method !== "GET") return;

  const ehPagina =
    req.mode === "navigate" ||
    req.destination === "document" ||
    req.url.endsWith("/") ||
    req.url.endsWith("index.html");

  // Páginas: rede primeiro (assim uma atualização no GitHub aparece na hora),
  // com o cache como reserva quando estiver offline.
  if (ehPagina) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match("./index.html")))
    );
    return;
  }

  // Ícones e demais estáticos: cache primeiro
  event.respondWith(
    caches.match(req).then((cached) =>
      cached ||
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached)
    )
  );
});
