// Dark Tunnel transport for bare-mux. Written for this project.
// It carries a proxied request to our own relay (same origin as this worker) and opens websockets through it.
// The relay makes the real request, so the app on the far side sees the relay and not the visitor.
const utf8 = new TextEncoder();
const json64 = (value) => {
  let s = "";
  for (const b of utf8.encode(JSON.stringify(value))) s += String.fromCharCode(b);
  return btoa(s);
};
const unjson64 = (text) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0))));

export default class DarkTunnelTransport {
  ready = false;

  constructor(options = {}) {
    this.base = new URL(options.relay ?? "/_dt/", self.location.href);
  }

  async init() {
    this.ready = true;
  }

  meta() {
    return {};
  }

  async request(remote, method, body, headers, signal) {
    // Request bodies travel as plain bytes: streaming uploads need HTTP/2, which a local server does not speak.
    let payload;
    if (body && !["GET", "HEAD"].includes(method)) payload = body instanceof ReadableStream ? await new Response(body).arrayBuffer() : body;

    const res = await fetch(new URL("request", this.base), {
      method: "POST",
      headers: {
        "x-dt-url": remote.href,
        "x-dt-method": method,
        "x-dt-headers": json64(headers ?? {}),
      },
      body: payload,
      signal: signal ?? undefined,
      cache: "no-store",
      credentials: "omit",
      redirect: "manual",
    });

    const failure = res.headers.get("x-dt-error");
    if (failure) throw new Error(`Tunnel refused the request: ${failure}`);
    const status = Number(res.headers.get("x-dt-status"));
    if (!status) throw new Error(`Tunnel relay answered with ${res.status}`);

    return {
      body: res.body ?? new ArrayBuffer(0),
      headers: unjson64(res.headers.get("x-dt-headers") ?? "e30="),
      status,
      statusText: res.headers.get("x-dt-status-text") ?? "",
    };
  }

  connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
    const ws = new URL("ws", this.base);
    ws.protocol = ws.protocol === "https:" ? "wss:" : "ws:";
    ws.searchParams.set("url", url.href);
    ws.searchParams.set("protocols", JSON.stringify(protocols ?? []));
    ws.searchParams.set("h", json64(requestHeaders ?? {}));

    const socket = new WebSocket(ws);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => onopen(socket.protocol);
    socket.onmessage = (e) => onmessage(e.data);
    socket.onclose = (e) => onclose(e.code, e.reason);
    socket.onerror = () => onerror("tunnel relay error");
    return [(data) => socket.send(data), (code, reason) => socket.close(code, reason)];
  }
}
