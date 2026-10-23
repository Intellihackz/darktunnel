// The tunnel window. It lives on its own origin, away from the app and the wallet, so the sites it opens
// can never reach the ghost wallet's key. The app talks to it only by postMessage.
import { BareMuxConnection } from "/baremux/index.mjs";

const app = new URLSearchParams(location.search).get("app");
const tell = (message) => parent.postMessage(message, app);
let frame = null;

// The wallet bridge. Pages in the tunnel call __dtBridge (through the provider); the app answers.
// The shell adds nothing the page could forge: the app works out which site is asking from the address it knows.
const pending = new Map();
const subscribers = new Set();
let counter = 0;
window.__dtBridge = (payload) =>
  new Promise((resolve) => {
    const id = ++counter;
    pending.set(id, resolve);
    tell({ type: "wallet", id, payload });
    setTimeout(() => pending.delete(id) && resolve({ error: { code: -32603, message: "The wallet did not answer in time" } }), 10 * 60 * 1000);
  });
window.__dtOn = (fn) => subscribers.add(fn);
// A page in the tunnel asked for a new tab. The app decides whether to open one.
window.__dtOpen = (url) => typeof url === "string" && url.length < 4096 && tell({ type: "open", url });

// JSON-RPC to a chain node, sent through the same relay as everything else, so the node never sees the visitor.
const b64json = (v) => {
  let s = "";
  for (const b of new TextEncoder().encode(JSON.stringify(v))) s += String.fromCharCode(b);
  return btoa(s);
};
async function rpc(url, body) {
  const res = await fetch("/_dt/request", {
    method: "POST",
    headers: { "x-dt-url": url, "x-dt-method": "POST", "x-dt-headers": b64json({ "content-type": "application/json", accept: "application/json" }) },
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "omit",
  });
  const failure = res.headers.get("x-dt-error");
  if (failure) throw new Error(failure);
  return JSON.parse(await res.text());
}

async function boot() {
  if (!("serviceWorker" in navigator)) throw new Error("This browser cannot run the tunnel window (no service workers).");

  // Order matters. Scramjet's controller creates its config database, and the service worker opens that database
  // the moment it starts. If the worker came first it would leave an empty database behind and init would fail.
  const { ScramjetController } = $scramjetLoadController();
  const scramjet = new ScramjetController({
    prefix: "/~/s/",
    files: { wasm: "/scramjet/scramjet.wasm.wasm", all: "/scramjet/scramjet.all.js", sync: "/scramjet/scramjet.sync.js" },
  });
  await scramjet.init();

  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;

  const connection = new BareMuxConnection("/baremux/worker.js");
  await connection.setTransport("/dt/transport.mjs", [{ relay: "/_dt/" }]);

  frame = scramjet.createFrame();
  frame.frame.title = "Open app";
  document.body.appendChild(frame.frame);
  frame.addEventListener("urlchange", (e) => tell({ type: "url", url: String(e.url) }));
  frame.frame.addEventListener("load", () => tell({ type: "loaded" }));
  tell({ type: "ready" });
}

addEventListener("message", (e) => {
  if (e.origin !== app) return;
  if (!frame && e.data?.type !== "rpc") return;
  const m = e.data ?? {};
  if (m.type === "go" && typeof m.url === "string") frame.go(m.url);
  else if (m.type === "back") frame.back();
  else if (m.type === "forward") frame.forward();
  else if (m.type === "reload") frame.reload();
  else if (m.type === "wallet-result") {
    pending.get(m.id)?.(m.reply);
    pending.delete(m.id);
  } else if (m.type === "wallet-event") subscribers.forEach((fn) => { try { fn(m.event, m.data); } catch {} });
  else if (m.type === "rpc" && typeof m.url === "string") {
    rpc(m.url, m.body).then(
      (json) => tell({ type: "rpc-result", id: m.id, json }),
      (error) => tell({ type: "rpc-result", id: m.id, error: String(error?.message ?? error) }),
    );
  }
});

boot().catch((err) => tell({ type: "error", message: String(err?.message ?? err) }));
