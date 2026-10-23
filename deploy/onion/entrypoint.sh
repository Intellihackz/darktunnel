#!/bin/sh
# Wait for Tor to create both onion addresses, then start the server with them as its two origins.
set -e
while [ ! -s /tor/app/hostname ] || [ ! -s /tor/window/hostname ]; do sleep 1; done
export APP_ORIGIN="http://$(cat /tor/app/hostname)"
export PROXY_ORIGIN="http://$(cat /tor/window/hostname)"
exec npx tsx server/index.ts
