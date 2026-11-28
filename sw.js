// Offline helper. Keeps a copy of the site on the phone so recipes still open with weak
// or no kitchen Wi-Fi. Pages and scripts always try the network first (so updates show up
// straight away) and fall back to the saved copy; photos come from the saved copy first.
// All recipe pages are saved in the background the first time someone visits.
const VERSION = "v3";
const CORE = "core-" + VERSION, PAGES = "pages-" + VERSION, IMAGES = "images-" + VERSION;
const CORE_FILES = [
  "/", "/plan/", "/404.html", "/manifest.webmanifest",
  "/assets/style.css", "/assets/recipe-engine.js", "/assets/recipes.js", "/assets/planner.js", "/assets/quiz.js",
  "/images/favicon.png", "/images/icon-192.png", "/images/logo-badge.svg"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    await Promise.all(CORE_FILES.map((u) => c.add(new Request(u, { cache: "no-cache" })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keep = [CORE, PAGES, IMAGES];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
    saveAllRecipes();
  })());
});

// Save every recipe page listed in recipes.js, so the whole cookbook works offline.
async function saveAllRecipes() {
  try {
    const res = await fetch("/assets/recipes.js", { cache: "no-cache" });
    const src = await res.text();
    const slugs = [...src.matchAll(/slug:\s*"([a-z0-9-]+)"/g)].map((m) => m[1]);
    const c = await caches.open(PAGES);
    for (const s of slugs) {
      const u = "/recipes/" + s + "/";
      if (!(await c.match(u))) { try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch (err) {} }
    }
  } catch (err) {}
}

self.addEventListener("message", (e) => { if (e.data === "save-all") saveAllRecipes(); });

async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await c.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    if (req.mode === "navigate") return (await caches.match("/404.html")) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(req) {
  const c = await caches.open(IMAGES);
  const hit = await c.match(req);
  const update = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await update) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;            // the recipe assistant and ratings need the network
  if (url.pathname.startsWith("/images/")) { e.respondWith(cacheFirst(req)); return; }
  if (req.mode === "navigate" || url.pathname.startsWith("/recipes/")) { e.respondWith(networkFirst(req, PAGES)); return; }
  e.respondWith(networkFirst(req, CORE));
});
