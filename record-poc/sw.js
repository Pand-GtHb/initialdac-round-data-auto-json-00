"use strict";
const CACHE = "dac-record-poc-v139";
const ASSETS = ["./index.html", "./style.css?v=139", "./catalog.js?v=132", "./model.js?v=136", "./storage.js?v=117", "./maintenance.js?v=139", "./app.js?v=139", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("dac-record-poc-") && key !== CACHE).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const isRoot = url.href === self.registration.scope;
  if (event.request.method !== "GET" || url.origin !== self.location.origin ||
      (!isRoot && !ASSETS.some(asset => new URL(asset, self.registration.scope).href === url.href))) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const saved = await cache.match(isRoot ? new URL("./index.html", self.registration.scope).href : event.request);
    return saved || fetch(event.request);
  }));
});
self.addEventListener("message", event => {
  if (event.data?.type !== "DAC_MAINTENANCE_STATUS" || !event.ports[0]) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const otherTabs = clients.filter(client => client.id !== event.source?.id &&
      client.url.startsWith(self.registration.scope)).length;
    event.ports[0].postMessage({ cache: CACHE, otherTabs });
  }));
});
