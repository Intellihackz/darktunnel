// The ghost wallet as the page sees it: an EIP-1193 provider (window.ethereum) plus the EIP-6963 announcement.
// It holds no key. Every request goes up to the tunnel window and from there to the app, which asks the person
// before it signs anything. This file is added to each page opened in the tunnel, ahead of the page's own scripts.
(() => {
  if (window.__dtProvider) return;

  // The tunnel window is the page's real parent, and it shares our origin, so it can be called directly.
  let bridge = null;
  let on = null;
  let openTab = null;
  let sendIcon = null;
  try {
    for (let w = window; w.parent && w.parent !== w; w = w.parent) {
      if (typeof w.parent.__dtBridge === "function") {
        bridge = w.parent.__dtBridge;
        on = w.parent.__dtOn;
        openTab = w.parent.__dtOpen;
        sendIcon = w.parent.__dtIcon;
        break;
      }
    }
  } catch {
    /* a cross-origin frame in the way: no wallet here */
  }
  if (!bridge) return;

  // New tabs. A link that asks for a new tab, or a script that calls window.open, would otherwise open a real browser
  // tab on the tunnel window's own address, which has no tunnel behind it and loads nothing. Send those to the app,
  // which opens them as a new tab of its own, with its own session.
  if (typeof openTab === "function") {
    // the page's address as the tunnel window knows it: proxied addresses end in /~/s/<encoded real address>
    const real = (u) => {
      const m = /\/~\/s\/([^?#]+)/.exec(String(u));
      try {
        return m ? decodeURIComponent(m[1]) : String(u);
      } catch {
        return null;
      }
    };
    const stub = { closed: false, close() {}, focus() {}, blur() {}, postMessage() {}, location: { href: "" } };
    const nativeOpen = window.open;
    window.open = function (url) {
      const target = url ? real(url) : null;
      if (target && /^https:\/\//i.test(target)) {
        openTab(target);
        return stub;
      }
      return typeof nativeOpen === "function" ? nativeOpen.apply(this, arguments) : null;
    };
    const wantsNewTab = (e, a) => (a.target && !/^(_self|_top|_parent)$/i.test(a.target)) || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
    const onLink = (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || e.defaultPrevented || (e.type === "auxclick" && e.button !== 1) || !wantsNewTab(e, a)) return;
      const target = real(a.href);
      if (!target || !/^https:\/\//i.test(target)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openTab(target);
    };
    document.addEventListener("click", onLink, true);
    document.addEventListener("auxclick", onLink, true);
  }

  // The tab's icon. The page names it; the tunnel window fetches it through the relay, so the site never sees the visitor.
  if (typeof sendIcon === "function") {
    const realUrl = (u) => {
      const m = /\/~\/s\/([^?#]+(?:\?[^#]*)?)/.exec(String(u));
      try {
        return m ? decodeURIComponent(m[1]) : String(u);
      } catch {
        return "";
      }
    };
    let last = "";
    const report = () => {
      try {
        const links = [...document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]')];
        const pick = links.find((l) => /(^|\s)icon(\s|$)/i.test(l.getAttribute("rel") || "")) || links[0];
        let target = pick ? realUrl(pick.href) : "";
        if (!/^https:\/\//i.test(target)) {
          const page = realUrl(location.href);
          target = /^https:\/\//i.test(page) ? new URL("/favicon.ico", page).href : "";
        }
        if (target && target !== last) {
          last = target;
          sendIcon(target, realUrl(location.href));
        }
      } catch {
        /* an icon is a nicety */
      }
    };
    document.addEventListener("DOMContentLoaded", report);
    window.addEventListener("load", report);
    setTimeout(report, 2500);
  }

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
