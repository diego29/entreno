// Service worker: guarda la app para abrir rápido y sin internet. Los datos los sincroniza Firebase.
const CACHE = "entreno-v69";
const SHELL = ["./", "./entrenador/", "./cliente/", "./shared/fb.js", "./shared/firebase-config.js",
  "./entrenador/manifest.webmanifest", "./cliente/manifest.webmanifest", "./icons/tempo-192.png", "./icons/cliente-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const own = url.origin === location.origin, fonts = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname), sdk = url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/");
  const three = (url.hostname === "cdnjs.cloudflare.com" && url.pathname.includes("/three.js/")) || (url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/npm/three@")); // motor 3D del visor
  if (!own && !fonts && !sdk && !three) return; // Firestore y demás van directo a la red
  if (own && (req.mode === "navigate" || url.pathname.endsWith(".js") || url.pathname.endsWith(".json"))) {
    // Páginas y código: primero red (para recibir actualizaciones), si no hay internet usa la copia
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); return r; }).catch(() => caches.match(req)));
    return;
  }
  // GIFs, íconos, fuentes, SDK, motor 3D y personajes (.fbx): primero copia guardada
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); } return r; })));
});

// Notificaciones push (llegan aunque la app esté cerrada)
self.addEventListener("push", e => {
  let d = {};
  try { const j = e.data ? e.data.json() : {}; d = { ...j, ...(j.notification || {}), ...(j.data || {}) }; if (j.data && j.notification) { d.title = j.data.title || j.notification.title; d.body = j.data.body || j.notification.body; } } catch (x) { d = { title: "Entreno", body: e.data ? e.data.text() : "" }; }
  const url = d.url || "./", trainer = url.includes("entrenador");
  const icon = new URL(trainer ? "icons/tempo-192.png" : "icons/cliente-192.png", self.registration.scope).href;
  e.waitUntil(self.registration.showNotification(d.title || "Entreno", { body: d.body || "", icon, badge: icon, tag: d.tag || undefined, renotify: !!d.tag, vibrate: [200, 100, 200], data: { url } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "./", self.registration.scope).href, path = new URL(url).pathname;
  e.waitUntil((async () => {
    const ws = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = ws.find(w => new URL(w.url).pathname === path);
    if (w) { await w.focus(); w.postMessage({ type: "open", url }); return; }
    return self.clients.openWindow(url);
  })());
});
