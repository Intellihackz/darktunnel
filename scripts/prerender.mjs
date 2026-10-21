// Writes the rendered page into dist/index.html and a 404 shell into dist/404.html, so crawlers and
// no-JS visitors get the real content. The client then hydrates it.
import fs from "node:fs";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
const { render } = await vite.ssrLoadModule("/src/entry-server.tsx");
const shell = fs.readFileSync("dist/index.html", "utf8");
if (!shell.includes("<!--app-->")) throw new Error("dist/index.html has no <!--app--> marker");

fs.writeFileSync("dist/index.html", shell.replace("<!--app-->", render("/")));
fs.writeFileSync(
  "dist/404.html",
  shell
    .replace(/<title>[^<]*<\/title>/, "<title>File not found: Dark Tunnel</title>")
    .replace("</head>", '  <meta name="robots" content="noindex" />\n  </head>')
    .replace("<!--app-->", render("/404")),
);
fs.mkdirSync("dist/app", { recursive: true });
fs.writeFileSync(
  "dist/app/index.html",
  shell
    .replace(/<title>[^<]*<\/title>/, "<title>App: Dark Tunnel</title>")
    .replace("</head>", '  <meta name="robots" content="noindex" />\n  </head>')
    .replace("<!--app-->", render("/app")),
);
await vite.close();
console.log("prerendered dist/index.html, dist/404.html and dist/app/index.html");
