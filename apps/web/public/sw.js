/* global self, caches, Response */

/**
 * Harwick service worker — minimal, no build step.
 *
 * Strategy:
 *  - Precache: app icon + manifest only (Next.js bundles change per deploy, so we
 *    do not precache them by name; the network falls back to fresh).
 *  - Runtime caches:
 *      app-shell:    HTML for known routes, stale-while-revalidate, short TTL.
 *      api-read:     GETs to /api/home, /api/conversations, /api/leads — SWR.
 *      static:       fonts, /_next/static, images — cache-first.
 *  - POSTs and writes are never cached.
 *  - Bump CACHE_VERSION to invalidate on deploy.
 */

const CACHE_VERSION = "harwick-v1";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE = ["/", "/home", "/manifest.webmanifest", "/harwick-gemini-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(CACHE_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;
  if (!request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);

  // Static assets — cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|ico|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // External resources (Google Fonts) — cache-first, opaque ok
  if (request.url.includes("fonts.googleapis.com") || request.url.includes("fonts.gstatic.com")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Read APIs we want offline
  if (
    url.pathname === "/api/home" ||
    url.pathname === "/api/home/owner-queue" ||
    url.pathname === "/api/conversations" ||
    url.pathname === "/api/leads"
  ) {
    event.respondWith(staleWhileRevalidate(request, API_CACHE));
    return;
  }

  // App shell pages — network-first with cache fallback
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.status === 200) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const hit = await cache.match(request);
    if (hit) return hit;
    return Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return hit ?? (await networkPromise) ?? Response.error();
}

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
