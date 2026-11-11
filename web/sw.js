/* ASCIIWall service worker: cache the app shell so it works offline. */
const CACHE = "asciiwall-v4";
const SHELL = [
  "./", "index.html", "wallpaper.html", "embed.html", "css/app.css", "manifest.webmanifest", "icons/icon.svg",
  "js/glyphs.js", "js/engine.js", "js/app.js",
  "js/scenes/ring.js", "js/scenes/beacons.js", "js/scenes/meadowwalk.js", "js/scenes/heart.js", "js/scenes/blackhole.js", "js/scenes/galaxy.js", "js/scenes/earth.js", "js/scenes/knot.js", "js/scenes/stilllife.js", "js/scenes/armillary.js", "js/scenes/florence.js", "js/scenes/butterflies.js", "js/scenes/clouds.js", "js/scenes/torii.js", "js/scenes/koi.js", "js/scenes/tide.js", "js/scenes/meadow.js", "js/scenes/rain.js", "js/scenes/hearth.js", "js/scenes/jelly.js", "js/scenes/aurora.js", "js/scenes/garden.js", "js/scenes/image.js",
];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // network-first so updates land; fall back to cache offline
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    if (r.ok && new URL(e.request.url).origin === location.origin) caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
