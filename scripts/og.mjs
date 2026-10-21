// Renders public/og.png (1200x630) from the first frame of the built page. The hero only shows example values
// (a documentation IP address), so nothing about the machine that renders it ends up in the image.
//   node scripts/og.mjs http://127.0.0.1:4400/
import path from "node:path";
import { launch } from "/Users/zed/.claude/skills/awwwards/scripts/browser.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:4400/";
const browser = await launch();
const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
await page.goto(url);
await page.waitForTimeout(3800);
await page.addStyleTag({ content: ".onion-note, .cue, .frame { display: none !important; }" });
await page.screenshot({ path: path.resolve("public/og.png") });
await browser.close();
console.log("wrote public/og.png");
