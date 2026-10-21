// The ghost wallet as the page sees it: an EIP-1193 provider (window.ethereum) plus the EIP-6963 announcement.
// It holds no key. Every request goes up to the tunnel window and from there to the app, which asks the person
// before it signs anything. This file is added to each page opened in the tunnel, ahead of the page's own scripts.
(() => {
  if (window.__dtProvider) return;

  // The tunnel window is the page's real parent, and it shares our origin, so it can be called directly.
  let bridge = null;
  let on = null;
  try {
    for (let w = window; w.parent && w.parent !== w; w = w.parent) {
      if (typeof w.parent.__dtBridge === "function") {
        bridge = w.parent.__dtBridge;
        on = w.parent.__dtOn;
        break;
      }
    }
  } catch {
    /* a cross-origin frame in the way: no wallet here */
  }
  if (!bridge) return;

  const handlers = {};
  const emit = (event, data) => (handlers[event] ?? []).slice().forEach((fn) => { try { fn(data); } catch {} });
  if (typeof on === "function") on(emit);

  const provider = {
    isDarkTunnel: true,
    isConnected: () => true,
    async request(args) {
      if (!args || typeof args.method !== "string") throw Object.assign(new Error("Invalid request"), { code: -32600 });
      const reply = await bridge({ method: args.method, params: Array.isArray(args.params) ? args.params : args.params == null ? [] : [args.params] });
      if (reply && reply.error) throw Object.assign(new Error(reply.error.message || "Request failed"), { code: reply.error.code ?? -32603 });
      return reply ? reply.result : null;
    },
    on(event, fn) { (handlers[event] ??= []).push(fn); return provider; },
    once(event, fn) { const wrap = (d) => { provider.removeListener(event, wrap); fn(d); }; return provider.on(event, wrap); },
    removeListener(event, fn) { handlers[event] = (handlers[event] ?? []).filter((f) => f !== fn); return provider; },
    enable() { return provider.request({ method: "eth_requestAccounts" }); },
    send(a, b) {
      if (typeof a === "string") return provider.request({ method: a, params: b });
      return provider.request(a);
    },
    sendAsync(payload, cb) {
      provider.request(payload).then((result) => cb(null, { id: payload.id, jsonrpc: "2.0", result }), (error) => cb(error));
    },
  };
  provider.addListener = provider.on;
  provider.off = provider.removeListener;

  Object.defineProperty(window, "__dtProvider", { value: true });
  try {
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  } catch {
    window.ethereum = provider;
  }

  const icon =
    "data:image/svg+xml;base64," +
    btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#09090a"/><rect x="14" y="10" width="36" height="44" fill="none" stroke="#ecebe6" stroke-width="4"/><rect x="14" y="26" width="36" height="12" fill="#ecebe6"/></svg>');
  const info = Object.freeze({ uuid: "2e7d0f9c-5d0a-4b9b-9a7e-8d4a8a1f0a11", name: "Dark Tunnel ghost wallet", icon, rdns: "lol.darktunnel" });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
