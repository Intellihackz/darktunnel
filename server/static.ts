// A small static file server for the built site, safe against paths that climb out of dist/.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("dist");
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm", ".txt": "text/plain; charset=utf-8", ".map": "application/json",
};

function find(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  const base = path.join(root, path.normalize(decoded).replace(/^([/\\])+/, ""));
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, path.join(base, "index.html"), `${base}.html`]) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

export function sendStatic(urlPath: string): Response {
  const file = find(urlPath);
  const target = file ?? path.join(root, "404.html");
  if (!fs.existsSync(target)) return new Response("Not found", { status: 404 });
  const ext = path.extname(target);
  const cache = urlPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
  const body = fs.readFileSync(target);
  return new Response(body, {
    status: file ? 200 : 404,
    headers: { "content-type": types[ext] ?? "application/octet-stream", "cache-control": cache },
  });
}
