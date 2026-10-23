# Deploying Dark Tunnel

One Railway service runs everything: the website, the app, the tunnel window's files and the relay. It needs **two web addresses that point at that one service**, because the app and the sites it opens must live on different origins.

| | Example | What it serves |
|---|---|---|
| App origin | `https://darktunnel.lol` | the landing page, `/app`, the ghost wallet |
| Window origin | `https://go.darktunnel.lol` | the tunnel window and the relay. Sites you open run here |

The window lives on a subdomain. A subdomain is a different origin, so the browser still keeps the app and the sites apart (storage, scripts and the wallet's key are all per origin). A separate registrable domain would be stronger still, because Chrome's site isolation works per site, so it is worth moving to one later. Until then, the app does not use cookies at all, so a site that tried to set a cookie for the whole domain would have nothing to attack.

## 1. Domains

You need `darktunnel.lol` and a `go` subdomain. Point both at Railway (step 3 gives the records). Use Cloudflare for DNS if you can, with the proxy switched **off** (grey cloud) while you set it up. Cloudflare's free plan does not allow a CNAME on the bare domain from every provider; Railway's records work with Cloudflare's CNAME flattening.

## 2. Code on GitHub

```bash
cd ~/dev/darktunnel
git add -A
git status --short | grep -E "\.env" && echo "STOP: an env file is staged" || echo "ok"
git commit -m "Dark Tunnel"
gh repo create darktunnel --private --source=. --push
```

Nothing secret is in this repo. The server needs no keys: ghost wallets are made in the visitor's browser.

## 3. Railway

1. New project, deploy from the GitHub repo. It reads `railway.json` and builds the `Dockerfile`.
2. **Variables** on the service:

| Variable | Value |
|---|---|
| `APP_ORIGIN` | `https://darktunnel.lol` (no trailing slash) |
| `PROXY_ORIGIN` | `https://go.darktunnel.lol` |
| `TRUST_PROXY` | `1` (Railway sets `X-Forwarded-For`, and the limits need the real visitor address) |
| `MAX_BYTES_PER_HOUR` | optional, bytes per visitor per hour, default 3 GB |

   Railway sets `PORT` itself. Do not set `HOST`.
3. **Settings, Networking, Custom domains:** add **both** `darktunnel.lol` and `go.darktunnel.lol` to this same service (a plan that allows two custom domains on one service is needed). Railway shows the DNS records to create for each.
4. **One replica.** The limits live in memory.

## 4. Check it

- `https://darktunnel.lol/health` and `https://go.darktunnel.lol/health` both answer `{"ok":true}`.
- `https://darktunnel.lol/app`: the dots at the top right say **live** after a few seconds.
- Open `example.com`, then `metamask.github.io/test-dapp/` (give it 10 seconds) and connect the wallet.
- `https://go.darktunnel.lol/app/` is a **404** (the window origin only serves the tunnel's own files).
- A POST to `https://darktunnel.lol/_dt/request` is a **403** (the relay only answers the window origin).

## What this server can see

Be plain about this wherever you describe the project: the relay fetches pages for the visitor, so the operator **can see the traffic that passes through**, including which sites are opened. There is no end-to-end encryption between the visitor and the site. Keys never reach the server, because wallets are made and used in the browser. The server keeps no logs of addresses or content.

## Abuse

A public relay can be used to reach any public https site. What limits that today: https and port 443 only, no private addresses, per-visitor request and connection limits, and an hourly data budget. If you see abuse, lower `MAX_BYTES_PER_HOUR`, or take the service down while you add an entry allowlist. Behind Tor all visitors share one address, so the Tor step needs per-session limits first.

## Later

Tor: two onion services (one per origin) pointing at this same server, with `APP_ORIGIN` and `PROXY_ORIGIN` set to the onion addresses.

## Fly.io instead of Railway

`fly.toml` runs the same Dockerfile on Fly. The window origin is the free `<app>.fly.dev` address, so only the app needs a custom domain. `fly.dev` is its own site to the browser, which keeps the sites you open further from the wallet than a subdomain would.

```bash
fly launch --no-deploy --copy-config   # keep the fly.toml in the repo; pick a free app name
# if the name is not "darktunnel", change `app` and PROXY_ORIGIN in fly.toml to match
fly deploy
fly scale count 1                      # one machine: the limits live in memory
fly certs add darktunnel.lol           # prints the DNS records for the app domain
```

`CLIENT_IP_HEADER = "fly-client-ip"` matters: Fly appends the visitor address to `X-Forwarded-For`, so the first entry there can be forged. The checks in step 4 are the same, with `<app>.fly.dev` in place of `go.darktunnel.lol`.
