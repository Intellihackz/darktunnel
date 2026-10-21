# Dark Tunnel

Use web3 apps over Tor with a throwaway "ghost wallet". A side project, not a startup.

## Idea

- **Onion site:** the user pastes the address of a web3 app. A proxy opens it over Tor, so the app sees the tunnel and not the user's IP. Wallet and RPC traffic leave through the tunnel too.
- **Surface site:** the same app without the Tor tunnel. It still gives every session a ghost wallet.
- **Ghost wallet:** a keypair made in the browser. The key is shown once with a plain warning. The server never sees it.

## The landing page

- **Hero:** an isometric route drawn in SVG (you, three Tor relays, our server, the app). Scrolling rides a packet through the conduit. It wraps itself in three onion layers, each relay peels one, and at the server its tag is struck out and replaced ("203.0.113.42" becomes "dark tunnel"). Idle: lamps run down the conduit, small packets stream through, the server blinks.
- **File:** a dossier whose rows are struck out as you scroll (the redaction idea).
- **Ghost wallet, ways in, footer:** a key card with a bar you can lift, onion and surface side by side, a giant wordmark.
- **Background:** drifting traffic-log lines that a marker strikes at random (hidden during the hero).
- Copy sells what the tunnel does and claims nothing beyond it. The footer keeps a short disclaimer.

Code map: `src/motion/iso.ts` (scene markup), `src/motion/journey.ts` (hero driver), `src/motion/dossier.ts` (file driver), `src/motion/field.ts` (background), `src/data/site.ts` (all copy).
Design notes and the concept card are in `DESIGN.md`.

## Decisions so far

- Name: **Dark Tunnel**.
- Proxy, not a remote browser. Build on an existing service-worker proxy (Ultraviolet or Scramjet).
- The wallet lives on a different origin from the proxied pages and talks to them by `postMessage`.
- Start with an allowlist of known dapps and RPC hosts, so it is not an open proxy.
- No custody, no mixing.

## Status

- [x] Landing page
- [ ] Ghost wallet generator (surface site)
- [ ] Proxy and transport server
- [ ] Onion service (Tor in the container, onion keys on a volume)

Placeholders on the page: the onion address ("coming soon"), no X link, no canonical URL or sitemap (they need a domain).

## Run

```bash
npm install
npm run dev      # http://localhost:3120
npm run build    # type-check, build, prerender index.html and 404.html
node scripts/og.mjs http://127.0.0.1:4400/   # regenerate public/og.png from a served build
```
