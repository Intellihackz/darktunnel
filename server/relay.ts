// The relay: the far end of the tunnel. A page inside the tunnel window asks for an address, the relay fetches it
// from the open internet and hands the bytes back. The app sees the relay's address, not the visitor's.
// Nothing is logged: no address, no header, no body is written anywhere.
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { Agent, fetch as ufetch } from "undici";
import { WebSocket, WebSocketServer } from "ws";
import { overBudget, spend, take } from "./limits";
import { checkTarget, cleanRequestHeaders, cleanResponseHeaders, safeLookup } from "./safety";

const MAX_BODY = 25 * 1024 * 1024;
const MAX_RESPONSE = 80 * 1024 * 1024;
const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

const agent = new Agent({
  connect: { lookup: safeLookup as never, timeout: 10_000 },
  headersTimeout: 25_000,
  bodyTimeout: 60_000,
});

const utf8 = new TextEncoder();
const json64 = (value: unknown) => Buffer.from(utf8.encode(JSON.stringify(value))).toString("base64");
const unjson64 = (text: string) => JSON.parse(Buffer.from(text, "base64").toString("utf8"));

function why(error: unknown): string {
  const e = error as { name?: string; code?: string; cause?: { code?: string } };
  const code = e?.cause?.code ?? e?.code;
  if (code === "EDTBLOCKED") return "blocked address";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "no such host";
  if (code === "ECONNREFUSED" || code === "ECONNRESET") return "connection refused";
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT" || e?.name === "AbortError" || e?.name === "TimeoutError") return "timed out";
  if (code === "CERT_HAS_EXPIRED" || code?.startsWith?.("ERR_TLS") || code?.includes?.("CERT")) return "certificate problem";
  return "could not reach the host";
}

const ONION = process.env.ONION === "1";

export async function relayRequest(req: Request, client: string): Promise<Response> {
  const fail = (reason: string, status = 200) =>
    new Response(null, { status, headers: { "x-dt-error": reason, "cache-control": "no-store" } });

  if (overBudget(client) || (ONION && overBudget("*"))) return fail("hourly data limit reached", 429);
  const release = take(client, 4000, 100);
  if (!release) return fail("slow down", 429);
  const done = (r: Response) => (release(), r);

  const target = checkTarget(req.headers.get("x-dt-url"), "http");
  if (!target.ok) return done(fail(target.reason));
  const method = (req.headers.get("x-dt-method") ?? "GET").toUpperCase();
  if (!METHODS.has(method)) return done(fail("method not allowed"));

  let headers: Record<string, string>;
  try {
    headers = cleanRequestHeaders(unjson64(req.headers.get("x-dt-headers") ?? "e30="));
  } catch {
    return done(fail("bad headers"));
  }

  let body: Buffer | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength > MAX_BODY) return done(fail("body too large", 413));
    if (bytes.byteLength) body = Buffer.from(bytes);
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 120_000);
  req.signal.addEventListener("abort", () => (abort.abort(), release()));

  let upstream;
  try {
    upstream = await ufetch(target.url, { method, headers, body, redirect: "manual", dispatcher: agent, signal: abort.signal });
  } catch (e) {
    clearTimeout(timer);
    return done(fail(why(e)));
  }

  const head = {
    "x-dt-status": String(upstream.status),
    "x-dt-status-text": upstream.statusText.replace(/[^\x20-\x7e]/g, ""),
    "x-dt-headers": json64(cleanResponseHeaders(upstream.headers as unknown as Headers)),
    "content-type": "application/octet-stream",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
  if (!upstream.body) {
    clearTimeout(timer);
    release();
    return new Response(null, { status: 200, headers: head });
  }

  let sent = 0;
  const capped = (upstream.body as unknown as ReadableStream<Uint8Array>).pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, control) {
        sent += chunk.byteLength;
        spend(client, chunk.byteLength);
        if (ONION) spend("*", chunk.byteLength);
        if (sent > MAX_RESPONSE) {
          control.error(new Error("response too large"));
          abort.abort();
        } else control.enqueue(chunk);
      },
      flush() {
        clearTimeout(timer);
        release();
      },
    }),
  );
  return new Response(capped, { status: 200, headers: head });
}

// ---------- websockets ----------
const negotiated = new WeakMap<IncomingMessage, string>();
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 16 * 1024 * 1024,
  perMessageDeflate: false,
  handleProtocols: (_offered, req) => negotiated.get(req) || false,
});

const closeCode = (code: number) => (code === 1005 || code === 1006 || code === 1015 || code < 1000 ? 1000 : code);

export function relayUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer, client: string) {
  const reject = (status: number, text: string) => {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };
  const release = take(`ws:${client}`, 200, 30);
  if (!release) return reject(429, "Too Many Requests");

  const url = new URL(req.url ?? "/", "http://relay");
  const target = checkTarget(url.searchParams.get("url"), "ws");
  if (!target.ok) return (release(), reject(400, "Bad Request"));

  let protocols: string[] = [];
  let headers: Record<string, string> = {};
  try {
    const p = JSON.parse(url.searchParams.get("protocols") ?? "[]");
    if (Array.isArray(p)) protocols = p.map(String).slice(0, 8);
    headers = cleanRequestHeaders(unjson64(url.searchParams.get("h") ?? "e30="));
  } catch {
    return (release(), reject(400, "Bad Request"));
  }
  for (const h of Object.keys(headers)) if (h.startsWith("sec-websocket-") || h === "upgrade") delete headers[h];

  const upstream = new WebSocket(target.url.href, protocols, { headers, lookup: safeLookup as never, handshakeTimeout: 15_000, maxPayload: 16 * 1024 * 1024, perMessageDeflate: false });
  upstream.once("error", () => (release(), reject(502, "Bad Gateway")));
  upstream.once("open", () => {
    negotiated.set(req, upstream.protocol);
    wss.handleUpgrade(req, socket, head, (clientSocket) => {
      clientSocket.on("message", (data, isBinary) => upstream.readyState === WebSocket.OPEN && upstream.send(data, { binary: isBinary }));
      upstream.on("message", (data, isBinary) => clientSocket.readyState === WebSocket.OPEN && clientSocket.send(data, { binary: isBinary }));
      clientSocket.on("close", (code, reason) => (release(), upstream.close(closeCode(code), reason)));
      upstream.on("close", (code, reason) => clientSocket.close(closeCode(code), reason));
      clientSocket.on("error", () => upstream.terminate());
      upstream.on("error", () => clientSocket.terminate());
    });
  });
}
