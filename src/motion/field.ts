// Background: a field of traffic-log lines drifting upward, with a marker that strikes out words now and then.
// It is the app reading you, and the marker is the tunnel. Runs on gsap.ticker at 30 fps, pauses with the tab,
// and under reduced motion draws one still frame. The text is noise built from documentation addresses.
import { gsap } from "gsap";
import { reduced } from "../engine";

const FONT = "11px 'Martian Mono Variable', ui-monospace, Menlo, monospace";
const LINE = 24;
const COL_GAP = 56;
const BONE = "236, 235, 230";

const PATHS = ["/", "/api/quote", "/swap", "/pool/0x7a3f", "/assets/app.js", "/rpc", "/stake", "/bridge", "/positions"];
const METHODS = ["GET", "POST", "GET", "GET", "POST"];
const STATUS = ["200", "200", "200", "304", "200", "101"];

// A tiny seeded generator, so the same line index always gives the same line.
const rand = (n: number) => {
  let x = (n * 2654435761) >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
};
const pick = <T,>(a: T[], n: number) => a[Math.floor(rand(n) * a.length)];

type Token = { text: string; x: number; w: number };
type Line = { tokens: Token[] };
type Bar = { line: number; col: number; token: number; born: number };

export function startField(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  const still = reduced();

  let w = 0;
  let h = 0;
  let cols = 1;
  let colW = 0;
  const cache = new Map<number, Line>();
  const bars: Bar[] = [];
  let nextBar = 0;
  let lastDraw = 0;

  const make = (i: number): Line => {
    const hh = (n: number) => Math.floor(rand(i * 7 + n) * 255).toString(16).padStart(2, "0");
    const raw = [
      `${String(Math.floor(rand(i + 1) * 24)).padStart(2, "0")}:${String(Math.floor(rand(i + 2) * 60)).padStart(2, "0")}:${String(Math.floor(rand(i + 3) * 60)).padStart(2, "0")}`,
      `${rand(i + 4) > 0.5 ? "203.0.113" : "198.51.100"}.${Math.floor(rand(i + 5) * 254) + 1}`,
      pick(METHODS, i + 6),
      pick(PATHS, i + 7),
      pick(STATUS, i + 8),
      `${hh(1)}${hh(2)}${hh(3)}${hh(4)}`,
    ];
    const tokens: Token[] = [];
    let x = 0;
    ctx.font = FONT;
    for (const text of raw) {
      const wd = ctx.measureText(text).width;
      tokens.push({ text, x, w: wd });
      x += wd + ctx.measureText("   ").width;
    }
    return { tokens };
  };
  const line = (i: number) => {
    let l = cache.get(i);
    if (!l) {
      l = make(i);
      cache.set(i, l);
      if (cache.size > 800) cache.delete(cache.keys().next().value as number);
    }
    return l;
  };

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(1, Math.floor((w + COL_GAP) / (520 + COL_GAP)));
    colW = (w - COL_GAP * (cols - 1)) / cols;
    cache.clear();
    if (still) draw(0);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = FONT;
    ctx.textBaseline = "middle";
    // The field drifts on its own and follows the page a little, so scrolling pushes it along.
    const travel = t * 14 + scrollY * 0.18;
    const first = Math.floor(travel / LINE);
    const frac = travel - first * LINE;
    const rows = Math.ceil(h / LINE) + 2;

    for (let c = 0; c < cols; c++) {
      const x0 = c * (colW + COL_GAP);
      for (let r = -1; r < rows; r++) {
        const idx = first + r + c * 1000;
        const y = r * LINE - frac + LINE / 2;
        const l = line(idx);
        // Rows fade toward the top and bottom edges.
        const edge = Math.min(1, Math.min(y, h - y) / 140);
        const a = (w < 700 ? 0.05 : 0.075) * Math.max(0, edge);
        ctx.fillStyle = `rgba(${BONE}, ${a})`;
        for (const tk of l.tokens) ctx.fillText(tk.text, x0 + tk.x, y);
      }
    }

    // Marker strikes: a bar draws across one token, holds, then fades.
    for (let b = bars.length - 1; b >= 0; b--) {
      const bar = bars[b];
      const age = t - bar.born;
      if (age > 4.2) {
        bars.splice(b, 1);
        continue;
      }
      const row = bar.line - first;
      const y = row * LINE - frac + LINE / 2;
      const tk = line(bar.line + bar.col * 1000).tokens[bar.token];
      const grow = 1 - Math.pow(2, -10 * Math.min(1, age / 0.45));
      const fade = age < 2.6 ? 1 : 1 - (age - 2.6) / 1.6;
      ctx.fillStyle = `rgba(${BONE}, ${(w < 700 ? 0.12 : 0.16) * fade})`;
      ctx.fillRect(bar.col * (colW + COL_GAP) + tk.x - 3, y - 8, (tk.w + 6) * grow, 16);
    }
  };

  const spawn = (t: number) => {
    const rowsVisible = Math.ceil(h / LINE);
    const first = Math.floor((t * 14 + scrollY * 0.18) / LINE);
    const n = Math.floor(t * 100);
    bars.push({
      line: first + 3 + Math.floor(rand(n) * Math.max(1, rowsVisible - 6)),
      col: Math.floor(rand(n + 1) * cols),
      token: 1 + Math.floor(rand(n + 2) * 3),
      born: t,
    });
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  if (still) {
    // One still frame with a few strikes already drawn.
    for (let i = 0; i < 6; i++) bars.push({ line: 4 + i * 5, col: i % cols, token: 1 + (i % 3), born: -1.2 });
    draw(0);
    return () => ro.disconnect();
  }

  const tick = (time: number) => {
    if (time - lastDraw < 1 / 30) return;
    lastDraw = time;
    if (time >= nextBar) {
      spawn(time);
      nextBar = time + 0.5 + Math.random() * 0.8;
    }
    draw(time);
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    ro.disconnect();
  };
}
