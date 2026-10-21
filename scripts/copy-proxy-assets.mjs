// Copies the browser files the proxy needs out of node_modules into public/, so Vite ships them at the site root.
//   /scramjet/*  the Scramjet rewriter, its wasm and its sync helper
//   /baremux/*   the shared worker that connects the service worker to our transport
import fs from "node:fs";
import path from "node:path";

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
const scram = "node_modules/@mercuryworkshop/scramjet/dist";
for (const f of ["scramjet.all.js", "scramjet.sync.js", "scramjet.wasm.wasm"]) copy(`${scram}/${f}`, `public/scramjet/${f}`);
const mux = "node_modules/@mercuryworkshop/bare-mux/dist";
copy(`${mux}/index.mjs`, "public/baremux/index.mjs");
copy(`${mux}/worker.js`, "public/baremux/worker.js");
console.log("proxy assets copied");
