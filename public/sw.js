// Service worker for the tunnel window. It only touches addresses under the proxy prefix (and Scramjet's own wasm),
// and passes everything else straight through. That matters at start-up: before Scramjet has saved its config,
// asking it to route a request would throw, and the window's own files (the bare-mux worker, our transport)
// would fail to load.
importScripts("/scramjet/scramjet.all.js");
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const PREFIX = "/~/s/";

// Every page opened in the tunnel gets the ghost wallet's provider, ahead of the page's own scripts.
async function withProvider(response, event) {
  const type = response.headers.get("content-type") || "";
  if (!/text\/html/i.test(type) || !["document", "iframe"].includes(event.request.destination)) return response;
  const tag = '<script src="/dt/provider.js"></script>';
  const html = await response.text();
  const out = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (m) => m + tag)
    : /^\s*<!doctype[^>]*>/i.test(html)
      ? html.replace(/^(\s*<!doctype[^>]*>)/i, "$1" + tag)
      : tag + html;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(out, { status: response.status, statusText: response.statusText, headers });
}

async function handle(event) {
  const url = event.request.url;
  const origin = self.location.origin;
  // Only a request under the prefix may ask Scramjet to load its config. The controller creates the config
  // database when it starts, and opening it earlier (for example for the wasm file) would leave it empty.
  if (url.startsWith(origin + PREFIX) || (scramjet.config && url.startsWith(origin + "/scramjet/scramjet.wasm.wasm"))) {
    try {
      await scramjet.loadConfig();
      if (scramjet.config && scramjet.route(event)) return await withProvider(await scramjet.fetch(event), event);
    } catch (error) {
      console.error("tunnel: could not route", url, error);
    }
  }
  return fetch(event.request);
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => event.respondWith(handle(event)));
