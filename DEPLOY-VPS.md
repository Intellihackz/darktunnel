# Deploying on a small server

Works on any Linux server with a public address (Ubuntu 24.04 on Hetzner, DigitalOcean or Vultr, 1 GB of memory is enough). It runs the app in Docker and uses Caddy for HTTPS. The same machine can run Tor later.

## 1. Point the names at the server

In your DNS, create two **A records** to the server's IPv4 address:

| Name | Type | Value |
|---|---|---|
| `darktunnel.lol` (or `@`) | A | the server's IP |
| `go` | A | the server's IP |

If Cloudflare holds your DNS, set both to **DNS only** (grey cloud) so Caddy can get its certificates.

## 2. Set up the server

```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://get.docker.com | sh
```

## 3. Put the code on it

Either clone the private repo (create a read-only deploy key or use a token), or copy the folder from your Mac:

```bash
# from your Mac, in ~/dev
rsync -az --exclude node_modules --exclude dist --exclude .git darktunnel root@YOUR_SERVER_IP:/opt/
```

## 4. Start it

```bash
cd /opt/darktunnel
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f --tail 50
```

The first build takes a few minutes. Caddy asks for the two certificates on the first request, which can take a minute.

## 5. Check it

- `https://darktunnel.lol/health` and `https://go.darktunnel.lol/health` answer `{"ok":true}`.
- `https://darktunnel.lol/app`: the dots at the top right say **live**. Open `example.com`.
- `https://go.darktunnel.lol/app/` is a 404, and a POST to `https://darktunnel.lol/_dt/request` is a 403.

## Updating

```bash
cd /opt/darktunnel && git pull   # or rsync again
docker compose -f deploy/docker-compose.yml up -d --build
```

## Change the names

The domains are written in two places: `deploy/docker-compose.yml` (`APP_ORIGIN`, `PROXY_ORIGIN`) and `deploy/Caddyfile`.
