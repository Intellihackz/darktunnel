// Turns what the visitor pasted into an address the tunnel could open, or says why it cannot.
// Checks only the shape of the address. Nothing here contacts the app.
export type Target = { ok: true; url: URL; host: string; listed: boolean } | { ok: false; reason: string };

// Hosts we plan to allow first. None of them has been tested through the tunnel yet.
export const ALLOWLIST = ["app.uniswap.org", "app.aave.com", "curve.fi", "app.ens.domains", "snapshot.org"];

const fail = (reason: string): Target => ({ ok: false, reason });

export function parseTarget(raw: string): Target {
  let text = raw.trim();
  if (!text) return fail("Paste an address first.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return fail("That does not look like an address.");
  }
  if (url.protocol !== "https:") return fail("Only https addresses are allowed.");
  if (url.username || url.password) return fail("Addresses with a login inside them are not allowed.");

  const host = url.hostname.toLowerCase();
  if (host.startsWith("[") || /^[\d.]+$/.test(host)) return fail("Use a name, not a number.");
  if (!host.includes(".")) return fail("That name has no domain.");
  if (/(^|\.)(localhost|local|internal|lan|home|corp)$/.test(host)) return fail("Private names are not allowed.");

  const listed = ALLOWLIST.some((h) => host === h || host.endsWith(`.${h}`));
  return { ok: true, url, host, listed };
}
