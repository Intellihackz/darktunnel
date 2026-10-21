// Puts Dark Tunnel on the public internet from this machine, using Cloudflare Tunnel. It works only while this runs.
//
//   node scripts/share.mjs                    two free quick tunnels: two random *.trycloudflare.com addresses
//   node scripts/share.mjs --named NAME       a named tunnel for your own domain (see DEPLOY-TUNNEL.md)
//                          --app darktunnel.lol --window go.darktunnel.lol
//
// The app and the tunnel window must be on different origins, so there are always two addresses.
import { spawn } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i > -1 ? args[i + 1] : fallback;
};
const PORT = opt("port", "8787");
const named = opt("named", "");
const children = [];

const stop = () => {
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

if (!fs.existsSync("dist/index.html")) {
  console.error("No build found. Run `npm run build` first.");
  process.exit(1);
}

/** Start a quick tunnel and resolve with its public address. */
function quickTunnel(label) {
  return new Promise((resolve, reject) => {
    const p = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(p);
    const timer = setTimeout(() => reject(new Error(`${label} tunnel did not start in 45 s`)), 45_000);
    const look = (chunk) => {
      const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(chunk));
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    };
    p.stdout.on("data", look);
    p.stderr.on("data", look);
    p.on("exit", (code) => reject(new Error(`${label} tunnel stopped (${code})`)));
  });
}

let app;
let win;
if (named) {
  app = `https://${opt("app", "")}`;
  win = `https://${opt("window", "")}`;
  if (app === "https://" || win === "https://") {
    console.error("Named mode needs --app and --window, for example --app darktunnel.lol --window go.darktunnel.lol");
    process.exit(1);
  }
  const t = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--config", "deploy/cloudflared.yml", "run", named], { stdio: "inherit" });
  children.push(t);
} else {
  console.log("Starting two quick tunnels...");
  [app, win] = await Promise.all([quickTunnel("app"), quickTunnel("window")]);
}

const server = spawn("npx", ["tsx", "server/index.ts"], {
  stdio: "inherit",
  env: { ...process.env, PORT, APP_ORIGIN: app, PROXY_ORIGIN: win, TRUST_PROXY: "1" },
});
children.push(server);

console.log(`\n  Open this:  ${app}/app\n  Window on:  ${win}   (the tunnel window; you never open this one yourself)\n\n  Ctrl+C stops everything.\n`);
