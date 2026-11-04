/* Service worker: permite instalar la app y usarla sin conexión.
   Estrategia: primero red (revalidando, para recibir siempre la escala actualizada); si falla usa la copia guardada.
   Al publicar una versión nueva, cambiar VERSION (igual que APP_VERSION en index.html y version.json):
   así el navegador detecta el cambio y la app muestra el botón "Actualizar". */
const VERSION = "2026.11.04";
const CACHE = "sueldo-aceitero-" + VERSION;
const APP = ["./", "index.html", "motor.js", "metricslab.jpg", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png", "icons/logo-gota.png"];

self.addEventListener("install", e => {
  // Sin skipWaiting automático: la versión nueva espera a que el usuario toque "Actualizar".
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP.map(u => new Request(u, { cache: "reload" })))));
});
self.addEventListener("message", e => { if (e.data === "SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // clima, fuentes y analytics van directo
  if (url.pathname.endsWith("/version.json")) return;                 // el control de versión siempre va a la red
  e.respondWith(
    // "no-cache": revalida con el servidor en vez de usar la caché HTTP (GitHub Pages cachea 10 min).
    fetch(req.mode === "navigate" ? new Request(req.url, { cache: "no-cache", credentials: "same-origin" }) : new Request(req, { cache: "no-cache" })).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
