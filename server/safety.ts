// What the relay will and will not connect to. The relay is a doorway to the open internet, so the first job
// is making sure it is never a doorway into a private network (the server's own, or a cloud metadata service).
import dns from "node:dns";
import net from "node:net";

const blocked = new net.BlockList();
const v4: [string, number][] = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
];
for (const [a, p] of v4) blocked.addSubnet(a, p, "ipv4");
const v6: [string, number][] = [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32], ["2001::", 32], ["2002::", 16], ["64:ff9b::", 96],
];
for (const [a, p] of v6) blocked.addSubnet(a, p, "ipv6");

/** True when an address is on the public internet. IPv4-mapped IPv6 addresses are judged by the IPv4 inside. */
export function isPublic(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPublic(mapped[1]);
  const family = net.isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;

/** A DNS lookup that refuses private answers. It runs at connect time, so a name that changes its answer
 *  between our check and the connection (DNS rebinding) still cannot reach a private address. */
export function safeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "", 4);
    const ok = (addresses as dns.LookupAddress[]).filter((a) => isPublic(a.address));
    if (!ok.length) return cb(Object.assign(new Error("blocked address"), { code: "EDTBLOCKED" }), "", 4);
    if (options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

export type Checked = { ok: true; url: URL } | { ok: false; reason: string };

/** Checks the address a visitor's page wants to reach. Only https and wss, only port 443, only names. */
export function checkTarget(raw: string | undefined | null, kind: "http" | "ws"): Checked {
  if (!raw || raw.length > 4096) return { ok: false, reason: "bad address" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "bad address" };
  }
  const want = kind === "http" ? "https:" : "wss:";
  if (url.protocol !== want) return { ok: false, reason: "only secure addresses" };
  if (url.username || url.password) return { ok: false, reason: "no logins in addresses" };
  if (url.port && url.port !== "443") return { ok: false, reason: "port not allowed" };
  const host = url.hostname.toLowerCase();
  if (net.isIP(host.replace(/^\[|\]$/g, ""))) return { ok: false, reason: "names only" };
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|lan|home|corp|onion)$/.test(host)) return { ok: false, reason: "private name" };
  return { ok: true, url };
}

// Headers a visitor's page may not set on the far side: they describe the hop, not the visitor, or would let the
// page speak as the relay.
const dropOut = new Set([
  "host", "connection", "keep-alive", "upgrade", "te", "trailer", "transfer-encoding", "content-length", "expect",
  "proxy-authorization", "proxy-connection", "forwarded", "via", "x-real-ip", "x-forwarded-for", "x-forwarded-host",
  "x-forwarded-proto", "cf-connecting-ip", "true-client-ip", "x-dt-url", "x-dt-method", "x-dt-headers",
]);
export function cleanRequestHeaders(raw: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    const name = k.toLowerCase();
    if (dropOut.has(name) || !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name)) continue;
    out[name] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

// Headers that describe how the far side's bytes were packed. The relay unpacks them, so these would now lie.
const dropBack = new Set(["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "proxy-authenticate"]);
export function cleanResponseHeaders(headers: Headers): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  headers.forEach((value, name) => {
    if (!dropBack.has(name) && name !== "set-cookie") out[name] = value;
  });
  const cookies = headers.getSetCookie?.() ?? [];
  if (cookies.length) out["set-cookie"] = cookies;
  return out;
}
