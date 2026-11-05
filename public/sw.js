/*
 * Service worker minimo: la pagina «Sei offline» e le notifiche push. Le pagine della lega sono per utente e cambiano ogni
 * giorno, quindi NON si mettono in cache: si va sempre in rete e, solo se la rete manca durante una navigazione, si risponde con
 * /offline.html. Cambiando VERSION si buttano le copie vecchie.
 * Notifiche (src/lib/push-notify.ts): il server manda { title, body, url, tag }; al tocco si apre `url` (sempre una pagina del
 * sito) nella finestra già aperta, se c'è.
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

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const tag = typeof data.tag === "string" ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(typeof data.title === "string" && data.title ? data.title : "Fantabasket", {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/icon-192.png",
      // Con lo stesso tag il nuovo avviso sostituisce il vecchio della stessa proposta, ma suona di nuovo.
      tag,
      renotify: Boolean(tag),
      data: { url: typeof data.url === "string" ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Solo pagine di questo sito: un url di un altro dominio ripiega sulla home.
  let target = new URL("/", self.location.origin);
  try {
    const url = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : "/", self.location.origin);
    if (url.origin === self.location.origin) target = url;
  } catch {
    // url non valido: si apre la home
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      if (!open) return self.clients.openWindow(target.href);
      return open.focus().then((c) => ("navigate" in open ? open.navigate(target.href) : c));
    }),
  );
});
