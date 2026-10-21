// Dark Tunnel server: the website, the app, the tunnel window's files, and the relay.
// Two origins on purpose. The app (and the ghost wallet) live on APP_ORIGIN. The sites you open run on PROXY_ORIGIN.
// Browsers keep origins apart, so a site inside the tunnel cannot read anything the app or the wallet holds.
import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";
import { relayRequest, relayUpgrade } from "./relay";
import { sendStatic } from "./static";

const PORT = Number(process.env.PORT ?? 8787);
const APP_ORIGIN = (process.env.APP_ORIGIN ?? `http://localhost:${PORT}`).replace(/\/+$/, "");
const PROXY_ORIGIN = (process.env.PROXY_ORIGIN ?? `http://127.0.0.1:${PORT}`).replace(/\/+$/, "");
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const appHost = new URL(APP_ORIGIN).host.toLowerCase();
const proxyHost = new URL(PROXY_ORIGIN).host.toLowerCase();
if (appHost === proxyHost) throw new Error("APP_ORIGIN and PROXY_ORIGIN must be different origins.");

// What the proxy origin may serve. Everything else there is a 404.
const proxyPaths = ["/p/", "/sw.js", "/scramjet/", "/baremux/", "/dt/", "/favicon.svg"];

const forwarded = (v: string | undefined) => v?.split(",")[0]?.trim();
const clientOf = (remote: string | undefined, header: string | undefined) => (TRUST_PROXY ? forwarded(header) : undefined) ?? remote ?? "unknown";

type Env = { Variables: { side: "app" | "proxy" } };
const app = new Hono<Env>();

app.get("/health", (c) => c.json({ ok: true }));

app.use("*", async (c, next) => {
  const host = (c.req.header("host") ?? "").toLowerCase();
  const side = host === proxyHost ? "proxy" : host === appHost ? "app" : null;
  if (!side) return c.text("Not found", 404);
  c.set("side", side);
  await next();
  const h = c.res.headers;
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "no-referrer");
  h.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (side === "app") {
    h.set("x-frame-options", "DENY");
    h.set("content-security-policy", `frame-ancestors 'none'; frame-src ${PROXY_ORIGIN}; object-src 'none'; base-uri 'none'`);
  } else if (c.req.path.startsWith("/p/")) {
    h.set("content-security-policy", `frame-ancestors ${APP_ORIGIN}`);
  }
});

// the app asks where the tunnel window lives
app.get("/_dt/config", (c) => (c.get("side") === "app" ? c.json({ proxyOrigin: PROXY_ORIGIN }, 200, { "cache-control": "no-store" }) : c.text("Not found", 404)));

// the relay, reachable only from the proxy origin
app.post("/_dt/request", async (c: Context<Env>) => {
  if (c.get("side") !== "proxy" || c.req.header("origin") !== PROXY_ORIGIN) return c.text("Forbidden", 403);
  const remote = (c.env as { incoming?: { socket?: { remoteAddress?: string } } }).incoming?.socket?.remoteAddress;
  return relayRequest(c.req.raw, clientOf(remote, c.req.header("x-forwarded-for")));
});

app.all("*", (c) => {
  if (c.get("side") === "proxy" && !proxyPaths.some((p) => c.req.path === p.replace(/\/$/, "") || c.req.path.startsWith(p))) return c.text("Not found", 404);
  const res = sendStatic(c.req.path);
  if (c.req.path === "/sw.js") res.headers.set("service-worker-allowed", "/");
  return res;
});

const server = serve({ fetch: app.fetch, port: PORT, hostname: process.env.HOST ?? "0.0.0.0", serverOptions: { maxHeaderSize: 64 * 1024 } }, (info) => {
  console.log(`Dark Tunnel on port ${info.port}`);
  console.log(`  app    ${APP_ORIGIN}`);
  console.log(`  proxy  ${PROXY_ORIGIN}`);
});

// websockets for the relay
(server as import("node:http").Server).on("upgrade", (req, socket, head) => {
  const host = (req.headers.host ?? "").toLowerCase();
  const path = (req.url ?? "").split("?")[0];
  if (host !== proxyHost || path !== "/_dt/ws" || req.headers.origin !== PROXY_ORIGIN) {
    socket.destroy();
    return;
  }
  const remote = req.socket.remoteAddress;
  relayUpgrade(req, socket, head, clientOf(remote, req.headers["x-forwarded-for"] as string | undefined));
});
