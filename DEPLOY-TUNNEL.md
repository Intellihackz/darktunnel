# Dark Tunnel from your own computer, on the public internet

Uses Cloudflare Tunnel (free). It only works while your computer is on and the command is running.

## Quick: no account, no domain

```bash
npm run build
node scripts/share.mjs
```

It prints a public address like `https://something-random.trycloudflare.com/app`. Two random addresses are used (the app and the tunnel window must be on different origins), and they change every time you restart. Anyone who has the address can use the relay, so do not post it publicly.

## Your own domain (`darktunnel.lol` and `go.darktunnel.lol`)

1. **Put the domain on Cloudflare.** Make a free Cloudflare account, add `darktunnel.lol`, and at the place you bought the domain change its nameservers to the two Cloudflare gives you. Wait until Cloudflare says the domain is Active (minutes to a few hours).
2. **Log in:** `cloudflared tunnel login`, then pick `darktunnel.lol` in the browser.
3. **Create the tunnel:** `cloudflared tunnel create darktunnel`. It prints a UUID and saves a credentials file under `~/.cloudflared/`.
4. **Create the DNS records** (this also fixes the names so they point at the tunnel):
   ```bash
   cloudflared tunnel route dns darktunnel darktunnel.lol
   cloudflared tunnel route dns darktunnel go.darktunnel.lol
   ```
5. **Make the config:** copy `deploy/cloudflared.example.yml` to `deploy/cloudflared.yml` and fill in the UUID and the credentials path.
6. **Run it:**
   ```bash
   npm run build
   node scripts/share.mjs --named darktunnel --app darktunnel.lol --window go.darktunnel.lol
   ```
7. Open `https://darktunnel.lol/app`.

## Stopping

Press Ctrl+C in the terminal that is running it.
