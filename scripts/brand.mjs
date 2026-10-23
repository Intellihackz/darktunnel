// Generates every brand asset from code, so they stay in step with the site.
//   node scripts/brand.mjs
// Marks, wordmark outlines and lockups are SVG. Icons and social images are PNG, rendered in Chromium from small HTML pages.
// The wordmark is outlined from Archivo (condensed, extra bold) by scripts/outline-wordmark.py into brand/fonts/wordmark.json.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { launch } from "/Users/zed/.claude/skills/awwwards/scripts/browser.mjs";

const ROOT = path.resolve("brand");
const dirs = ["mark", "wordmark", "icons", "social", "_build"].map((d) => path.join(ROOT, d));
dirs.forEach((d) => fs.mkdirSync(d, { recursive: true }));
const write = (rel, data) => fs.writeFileSync(path.join(ROOT, rel), data);

const C = { ground: "#09090a", panel: "#101012", ink: "#ecebe6", muted: "#8f8e88", line: "#232327", line2: "#34343a" };
const FONT = (f) => pathToFileURL(path.resolve("node_modules/@fontsource-variable", f)).href;
const FONT_CSS = `
  @font-face { font-family: "Archivo"; src: url("${FONT("archivo/files/archivo-latin-wdth-normal.woff2")}") format("woff2"); font-weight: 100 900; font-stretch: 62% 125%; }
  @font-face { font-family: "Martian"; src: url("${FONT("martian-mono/files/martian-mono-latin-wdth-normal.woff2")}") format("woff2"); font-weight: 100 800; }
  * { box-sizing: border-box; margin: 0; }
  body { background: ${C.ground}; color: ${C.ink}; font-family: "Archivo", sans-serif; -webkit-font-smoothing: antialiased; }
  .cond { font-weight: 800; font-variation-settings: "wdth" 62; letter-spacing: -0.005em; line-height: 0.9; }
  .mono { font-family: "Martian", monospace; }
`;

// ---------- the mark: a file with the marker struck across it ----------
// visible box inside the 64 unit square: x 12..52, y 8..56
const markBody = (fg) =>
  `<rect x="14" y="10" width="36" height="44" fill="none" stroke="${fg}" stroke-width="4"/><rect x="14" y="26" width="36" height="12" fill="${fg}"/>`;
const markSvg = (fg, bg = null) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${bg ? `<rect width="64" height="64" fill="${bg}"/>` : ""}${markBody(fg)}</svg>\n`;
/** The mark scaled around the centre, for icons that need padding. */
const markScaled = (fg, bg, scale) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${markBody(fg)}</g></svg>\n`;

write("mark/mark-bone.svg", markSvg(C.ink));
write("mark/mark-ground.svg", markSvg(C.ground));
write("mark/mark-on-ground.svg", markSvg(C.ink, C.ground));
write("mark/mark-on-bone.svg", markSvg(C.ground, C.ink));
write("icons/favicon.svg", markSvg(C.ink, C.ground));
write("icons/safari-pinned-tab.svg", markSvg("#000000"));

// ---------- the wordmark, outlined ----------
const outlined = JSON.parse(fs.readFileSync("brand/fonts/wordmark.json", "utf8"));
const word = { d: outlined.d, x1: outlined.x1, y1: outlined.y1, x2: outlined.x2, y2: outlined.y2, w: outlined.x2 - outlined.x1, h: outlined.y2 - outlined.y1 };
const wordSvg = (fg) => {
  const pad = word.h * 0.08;
  const w = word.w + pad * 2;
  const h = word.h + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}"><path d="${word.d}" fill="${fg}" transform="translate(${(pad - word.x1).toFixed(1)} ${(pad - word.y1).toFixed(1)})"/></svg>\n`;
};
write("wordmark/wordmark-bone.svg", wordSvg(C.ink));
write("wordmark/wordmark-ground.svg", wordSvg(C.ground));

// ---------- lockups: mark + wordmark ----------
// The mark's visible height equals the height of the tall letters; the gap is a third of that.
function lockupH(fg) {
  const H = word.h; // ascender height of "dark tunnel"
  const k = H / 48; // mark units to lockup units (its visible box is 48 high)
  const mw = 40 * k;
  const gap = H * 0.42;
  const pad = H * 0.1;
  const w = pad * 2 + mw + gap + word.w;
  const h = pad * 2 + H;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}"><g transform="translate(${(pad - 12 * k).toFixed(1)} ${(pad - 8 * k).toFixed(1)}) scale(${k.toFixed(4)})">${markBody(fg)}</g><path d="${word.d}" fill="${fg}" transform="translate(${(pad + mw + gap - word.x1).toFixed(1)} ${(pad - word.y1).toFixed(1)})"/></svg>\n`;
}
function lockupStack(fg) {
  const mH = word.h * 1.5;
  const k = mH / 48;
  const mw = 40 * k;
  const pad = word.h * 0.12;
  const gap = word.h * 0.5;
  const w = pad * 2 + Math.max(word.w, mw);
  const h = pad * 2 + mH + gap + word.h;
  const mx = (w - mw) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}"><g transform="translate(${(mx - 12 * k).toFixed(1)} ${(pad - 8 * k).toFixed(1)}) scale(${k.toFixed(4)})">${markBody(fg)}</g><path d="${word.d}" fill="${fg}" transform="translate(${((w - word.w) / 2 - word.x1).toFixed(1)} ${(pad + mH + gap - word.y1).toFixed(1)})"/></svg>\n`;
}
write("wordmark/lockup-bone.svg", lockupH(C.ink));
write("wordmark/lockup-ground.svg", lockupH(C.ground));
write("wordmark/lockup-stacked-bone.svg", lockupStack(C.ink));

// ---------- rendering ----------
const browser = await launch();
async function shot(html, w, h, out, opts = {}) {
  const file = path.join(ROOT, "_build", `${path.basename(out, ".png")}.html`);
  fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><base href="${pathToFileURL(ROOT + "/").href}"><style>${FONT_CSS}html,body{width:${w}px;height:${h}px;overflow:hidden}${opts.css ?? ""}</style>${html}`);
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: opts.scale ?? 1 })).newPage();
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(ROOT, out), omitBackground: !!opts.transparent });
  await page.context().close();
}
const svgInline = (svg) => svg.replace(/^<svg /, '<svg style="display:block;width:100%;height:100%" ');

// icons
const icon = (px, out, svg) => shot(`<div style="width:${px}px;height:${px}px">${svgInline(svg)}</div>`, px, px, out);
for (const px of [16, 32, 48]) await icon(px, `icons/favicon-${px}.png`, markSvg(C.ink, C.ground));
await icon(180, "icons/apple-touch-icon.png", markScaled(C.ink, C.ground, 1.05));
await icon(192, "icons/icon-192.png", markScaled(C.ink, C.ground, 1.05));
await icon(512, "icons/icon-512.png", markScaled(C.ink, C.ground, 1.05));
await icon(512, "icons/icon-maskable-512.png", markScaled(C.ink, C.ground, 0.62)); // inside the 80% safe zone
// marks and lockups as PNG
await icon(1024, "mark/mark-on-ground-1024.png", markScaled(C.ink, C.ground, 1.1));
{
  const w = 2400;
  const vb = lockupH(C.ink).match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  const h = Math.round((w * +vb[2]) / +vb[1]);
  await shot(`<div style="width:${w}px;height:${h}px">${svgInline(lockupH(C.ink))}</div>`, w, h, "wordmark/lockup-bone-2400.png");
}

// a field of traffic-log lines with some tokens struck out: the brand's texture
function field(rows, cols, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const hex = () => Array.from({ length: 8 }, () => Math.floor(rnd() * 16).toString(16)).join("");
  const lines = [];
  for (let r = 0; r < rows; r++) {
    const toks = [
      `${String(Math.floor(rnd() * 24)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}`,
      `${rnd() > 0.5 ? "203.0.113" : "198.51.100"}.${Math.floor(rnd() * 254) + 1}`,
      pick(["GET", "POST", "GET", "GET"]),
      pick(["/", "/api/quote", "/swap", "/pool/0x7a3f", "/rpc", "/stake", "/bridge", "/assets/app.js"]),
      pick(["200", "200", "304", "101"]),
      hex(),
    ];
    const struck = rnd() > 0.78 ? Math.floor(rnd() * 3) + 1 : -1;
    lines.push(`<div class="ln">${toks.map((t, i) => (i === struck ? `<span class="k">${t}</span>` : t)).join("   ")}</div>`);
  }
  return `<div class="field">${lines.join("")}</div>`;
}
const FIELD_CSS = `.field{font:12px/24px Martian,monospace;color:rgba(236,235,230,.2);white-space:pre;overflow:hidden}.k{background:${C.ink};color:transparent;box-shadow:0 0 0 4px ${C.ink}}`;
const lockupImg = (h, fg = C.ink) => `<div style="height:${h}px">${svgInline(lockupH(fg)).replace("display:block;width:100%;height:100%", `display:block;height:${h}px;width:auto`)}</div>`;

// social: avatar
await shot(`<div style="width:400px;height:400px">${svgInline(markScaled(C.ink, C.ground, 0.98))}</div>`, 400, 400, "social/x-avatar-400.png");

// social: X banner (the left third is kept clear: the avatar covers its lower corner)
await shot(
  `<div style="position:relative;width:1500px;height:500px">
     <div style="position:absolute;left:1090px;right:0;top:-6px;bottom:0;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 38%);mask-image:linear-gradient(90deg,transparent 0,#000 38%)">${field(21, 2, 11)}</div>
     <div style="position:absolute;left:64px;top:52px">${lockupImg(34)}</div>
     <h1 class="cond" style="position:absolute;left:330px;top:150px;font-size:96px">A tunnel from<br>the dark web to web3.</h1>
   </div>`,
  1500,
  500,
  "social/x-banner-1500x500.png",
  { css: FIELD_CSS },
);

// social: link preview and GitHub card
const card = (w, h) => `<div style="position:relative;width:${w}px;height:${h}px">
     <div style="position:absolute;left:${w * 0.64}px;right:0;top:-6px;bottom:0;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 45%);mask-image:linear-gradient(90deg,transparent 0,#000 45%)">${field(Math.ceil(h / 24) + 1, 1, 19)}</div>
     <div style="position:absolute;left:72px;top:64px">${lockupImg(40)}</div>
     <h1 class="cond" style="position:absolute;left:72px;top:${Math.round(h * 0.34)}px;font-size:${Math.round(w * 0.088)}px">A tunnel from<br>the dark web to web3.</h1>
     <p class="mono" style="position:absolute;left:72px;bottom:60px;font-size:17px;color:${C.muted}">Open any dapp over Tor with a throwaway ghost wallet.</p>
   </div>`;
await shot(card(1200, 630), 1200, 630, "social/og-image-1200x630.png", { css: FIELD_CSS });
await shot(card(1280, 640), 1280, 640, "social/github-social-1280x640.png", { css: FIELD_CSS });

// the brand sheet
const swatch = (name, hex, note, fg = C.ink) =>
  `<div class="sw" style="background:${hex};color:${fg}"><b>${name}</b><span class="mono">${hex}</span><i>${note}</i></div>`;
await shot(
  `<div class="sheet">
    <header><div style="height:46px">${lockupImg(46)}</div><p class="mono">Brand sheet · generated by scripts/brand.mjs</p></header>
    <section class="hero"><h1 class="cond">A tunnel from<br>the dark web to web3.</h1></section>
    <section><h2>Mark</h2><p class="note">A file with the marker struck across it: the product hides what an app would learn. Keep the bar. Never outline it, tilt it or add a gradient.</p>
      <div class="row">
        <div class="tile" style="background:${C.ground}"><img src="mark/mark-on-ground.svg" width="120"></div>
        <div class="tile" style="background:${C.ink}"><img src="mark/mark-on-bone.svg" width="120"></div>
        <div class="tile" style="background:${C.panel}"><img src="mark/mark-bone.svg" width="64"><img src="mark/mark-bone.svg" width="32"><img src="mark/mark-bone.svg" width="16"></div>
      </div></section>
    <section><h2>Wordmark and lockups</h2><p class="note">Lowercase, Archivo condensed extra bold, outlined. The mark is as tall as the tall letters. Clear space on every side is the height of the bar.</p>
      <div class="row">
        <div class="tile wide" style="background:${C.ground}"><img src="wordmark/lockup-bone.svg" height="64"></div>
        <div class="tile wide" style="background:${C.ink}"><img src="wordmark/lockup-ground.svg" height="64"></div>
        <div class="tile" style="background:${C.ground}"><img src="wordmark/lockup-stacked-bone.svg" height="150"></div>
      </div></section>
    <section><h2>Colour</h2><p class="note">Black and bone only. The bone bar is the accent. Nothing glows and nothing is tinted.</p>
      <div class="row sws">${swatch("Ground", C.ground, "page", C.ink)}${swatch("Panel", C.panel, "windows, cards", C.ink)}${swatch("Ink", C.ink, "text, bars", C.ground)}${swatch("Muted", C.muted, "labels", C.ground)}${swatch("Line", C.line2, "hairlines", C.ink)}</div></section>
    <section><h2>Type</h2>
      <div class="row">
        <div class="tile type"><span class="cond" style="font-size:88px">Aa dark tunnel</span><small class="mono">Archivo, condensed (62) 800: headlines and the wordmark</small></div>
        <div class="tile type"><span style="font-size:30px;line-height:1.3;color:${C.ink}">Type the address of any web3 app.<br>That is the only thing you enter.</span><small class="mono">Archivo, normal width: text</small></div>
        <div class="tile type"><span class="mono" style="font-size:22px">203.0.113.42  0x7a3f…91c2</span><small class="mono">Martian Mono: addresses, labels, logs</small></div>
      </div></section>
    <section><h2>Icons</h2>
      <div class="row icons"><img src="icons/icon-512.png" width="128"><img src="icons/apple-touch-icon.png" width="90"><img src="icons/icon-192.png" width="64"><img src="icons/favicon-48.png" width="48"><img src="icons/favicon-32.png" width="32"><img src="icons/favicon-16.png" width="16"></div></section>
    <section><h2>Social</h2>
      <div class="row"><img src="social/x-banner-1500x500.png" width="760" style="border:1px solid ${C.line2}"><img src="social/x-avatar-400.png" width="180" style="border-radius:50%;border:1px solid ${C.line2}"></div>
      <div class="row" style="margin-top:20px"><img src="social/og-image-1200x630.png" width="500" style="border:1px solid ${C.line2}"><img src="social/github-social-1280x640.png" width="500" style="border:1px solid ${C.line2}"></div></section>
  </div>`,
  1600,
  2900,
  "brand-sheet.png",
  {
    css: `html,body{height:auto;overflow:visible}.sheet{padding:64px 72px 90px}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:56px}header p{font-size:12px;color:${C.muted}}
    .hero h1{font-size:150px;margin-bottom:70px}section{margin-top:56px}h2{font:500 12px "Martian",monospace;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};margin-bottom:12px;font-variation-settings:normal}
    .note{max-width:70ch;color:#bdbcb6;margin-bottom:22px;font-size:16px;line-height:1.5}.row{display:flex;gap:20px;align-items:stretch}.tile{flex:1;min-height:200px;border:1px solid ${C.line2};display:flex;align-items:center;justify-content:center;gap:22px;padding:28px}.tile.wide{flex:1.4}
    .sw{flex:1;height:170px;padding:16px;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;border:1px solid ${C.line2}}.sw b{font-size:18px}.sw span{font-size:12px}.sw i{font-style:normal;font-size:13px;opacity:.7}
    .type{flex-direction:column;align-items:flex-start;justify-content:space-between}.type small{font-size:11px;color:${C.muted}}.icons{align-items:flex-end;gap:28px}`,
  },
);

await browser.close();
fs.rmSync(path.join(ROOT, "_build"), { recursive: true, force: true });
console.log("brand assets written to brand/");
