/*
 * Service worker minimo: solo la pagina «Sei offline». Le pagine della lega sono per utente e cambiano ogni giorno, quindi
 * NON si mettono in cache: si va sempre in rete e, solo se la rete manca durante una navigazione, si risponde con
 * /offline.html. Cambiando VERSION si buttano le copie vecchie.
 */
const VERSION = "offline-v1";
const ASSETS = ["/offline.html", "/logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Il logo della pagina offline: dalla cache solo se la rete non risponde.
  if (req.method === "GET" && new URL(req.url).pathname === "/logo.png") {
    event.respondWith(fetch(req).catch(() => caches.match("/logo.png")));
  }
});
