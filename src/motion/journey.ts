// The hero driver. One number (scroll progress, 0 to 1) places everything: where the packet is along the conduit,
// how many onion layers it still wears, what its tag says, where the camera is, and which caption is showing.
// Idle input: lamps run down the conduit, small packets stream through, and the server blinks, so the scene
// keeps moving while the visitor reads. Runs on gsap.ticker, pauses off screen, and is one still frame under reduced motion.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { reduced } from "../engine";
import { GATE_FAR, Y, cubePts, iso } from "./iso";

const NS = "http://www.w3.org/2000/svg";
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

// scroll progress -> packet position along the conduit (world y)
const KF: [number, number][] = [
  [0, 0], [0.12, 0], [0.28, Y.r1], [0.35, Y.r2], [0.42, Y.r3], [0.5, -27.5], [0.62, Y.srv], [0.7, -37.5], [0.86, Y.app], [1, Y.app],
];
function yAt(p: number) {
  for (let i = 1; i < KF.length; i++) {
    if (p <= KF[i][0]) return lerp(KF[i - 1][1], KF[i][1], (p - KF[i - 1][0]) / (KF[i][0] - KF[i - 1][0]));
  }
  return KF[KF.length - 1][1];
}

const SHELL = [2.5, 2.0, 1.5]; // outer layer is peeled by the first relay
const SHED_SEG = ["s2", "s3", "s4"]; // the segment right after each relay, where its layer is left behind
const TAG_W = 128;

function mk<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>, parent?: Element) {
  const el = document.createElementNS(NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  parent?.appendChild(el);
  return el;
}
const cubeEl = (cls: string, parent?: Element) => {
  const g = mk("g", { class: cls }, parent);
  mk("polygon", { class: "cf fl" }, g);
  mk("polygon", { class: "cf fr" }, g);
  mk("polygon", { class: "cf ft" }, g);
  return g;
};
const setCube = (g: Element, c: number[], size: number, opacity = 1) => {
  const p = cubePts(c[0], c[1], c[2], size);
  (g.children[0] as SVGElement).setAttribute("points", p.fl);
  (g.children[1] as SVGElement).setAttribute("points", p.fr);
  (g.children[2] as SVGElement).setAttribute("points", p.ft);
  (g as SVGElement).style.opacity = String(opacity);
};

type Item = { el: SVGGElement; near: number; far: number; kind: string; id: string };

export function startJourney(root: HTMLElement, opts: { fixed?: number } = {}): () => void {
  const svg = root.querySelector<SVGSVGElement>("svg.scene");
  const cam = svg?.querySelector<SVGGElement>("[data-cam]");
  if (!svg || !cam) return () => {};
  const camEl: SVGGElement = cam;
  const svgEl: SVGSVGElement = svg;
  const itemsRoot = cam.querySelector("[data-items]")!;
  const items: Item[] = [...itemsRoot.querySelectorAll<SVGGElement>(":scope > [data-item]")].map((el) => ({
    el,
    id: el.dataset.item!,
    near: Number(el.dataset.near),
    far: Number(el.dataset.far),
    kind: el.dataset.kind!,
  }));
  const byId = (id: string) => items.find((i) => i.id === id)!;
  const rings = [...cam.querySelectorAll<SVGElement>("[data-ring]")].map((el) => ({ el, y: Number(el.dataset.y) }));
  const glyphs = ["r1", "r2", "r3"].map((id) => [...byId(id).el.querySelectorAll<SVGElement>("[data-glyph]")]);
  const leds = [...cam.querySelectorAll<SVGElement>("[data-led]")];
  const wins = [...cam.querySelectorAll<SVGElement>("[data-win]")];
  const door = cam.querySelector<SVGElement>("[data-doorglow]");
  const tagRoot = cam.querySelector<SVGGElement>("[data-tag]")!;
  const labs = [...cam.querySelectorAll<SVGGElement>("[data-lab]")].map((el) => ({ el, y: Number(el.dataset.lab) }));

  // ---------- the moving parts ----------
  const packet = mk("g", { "data-packet": "" });
  const glow = mk("ellipse", { class: "glow", rx: "56", ry: "32" }, packet);
  const shells = SHELL.map(() => cubeEl("shell", packet));
  const core = cubeEl("core", packet);
  const shed = SHED_SEG.map((id) => {
    const g = cubeEl("shell shed");
    const seg = byId(id).el;
    seg.insertBefore(g, seg.querySelector(".front"));
    return g;
  });
  // small packets stream through every segment: the traffic that is always there
  const amb = items
    .filter((i) => i.kind === "seg")
    .flatMap((seg, si) =>
      [0, 1].map((j) => ({ seg, j, si, g: cubeEl("amb", seg.el.querySelector(".amb")!) })),
    );

  // the tag that floats over the packet: your IP at first, then the tunnel
  const tagBg = mk("rect", { class: "tag-bg", width: String(TAG_W), height: "36", x: "0", y: "0" }, tagRoot);
  const tagA = mk("text", { class: "tag-a", x: "10", y: "15" }, tagRoot);
  const tagB = mk("text", { class: "tag-b", x: "10", y: "28" }, tagRoot);
  const slab = mk("rect", { class: "tag-slab", x: "0", y: "4", width: "0", height: "17" }, tagRoot);
  let swapped = false;

  let current: Item | null = null;
  const place = (y: number) => {
    const item = items.find((i) => y <= i.near + 0.001 && y >= i.far - 0.001) ?? items[items.length - 1];
    if (item === current) return;
    current = item;
    if (item.kind === "seg") item.el.insertBefore(packet, item.el.querySelector(".front"));
    else if (item.id === "you") item.el.after(packet); // the packet rides on top of the platform
    else item.el.before(packet); // and disappears into a gate
  };

  // dom of the overlay text and captions
  const intro = root.querySelector<HTMLElement>("[data-intro]");
  const actions = root.querySelector<HTMLElement>("[data-actions]");
  const caps = [...root.querySelectorAll<HTMLElement>("[data-cap]")].map((el) => ({ el, from: Number(el.dataset.from), to: Number(el.dataset.to) }));
  const steps = [...root.querySelectorAll<HTMLElement>("[data-step]")];

  let vw = 0;
  let vh = 0;
  const measure = () => {
    vw = svg.clientWidth;
    vh = svg.clientHeight;
  };
  const ro = new ResizeObserver(() => {
    measure();
    if (still) draw(0.02, 0, 1);
  });
  ro.observe(svg);
  measure();

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onPointer = (e: PointerEvent) => {
    pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
  };

  function draw(p: number, time: number, wrap: number) {
    const y = yAt(p);
    const z = lerp(1.15, 1.5, clamp(-y / 3)) + (still ? 0 : 0.06 * Math.sin(time * 2.2));
    place(y);

    // camera: an overview of the whole route first, then it rides along with the packet
    const phone = vw < 700;
    // the whole route is about 1320 x 910 units wide at scale 1
    const kO = phone ? (vw * 0.9) / 1320 : Math.min((vw * 0.92) / 1320, (vh * 0.78) / 910);
    const kF = Math.max(kO * 1.55, phone ? 0.82 : 0);
    const b = smooth(clamp((p - 0.03) / 0.12));
    const k = lerp(kO, kF, b);
    const [mx, my] = iso(0, -22, 1.5);
    const [px, py] = iso(0, y, z);
    const cx = lerp(mx, px, b);
    const cy = lerp(my, py, b);
    const ox = lerp(phone ? -vw * 0.03 : vw * 0.02, phone ? 0 : vw * 0.14, b) + pointer.x * 12;
    const oy = lerp(vh * (phone ? 0.24 : 0.1), phone ? -vh * 0.13 : 0, b) + pointer.y * 8;
    // text inside the scene stays readable when the camera is pulled back
    const ts = clamp(0.95 / k, 1, 3.4);
    svgEl.style.setProperty("--ts", ts.toFixed(2));
    camEl.setAttribute("transform", `translate(${(vw / 2 - cx * k + ox).toFixed(1)} ${(vh / 2 - cy * k + oy).toFixed(1)}) scale(${k.toFixed(3)})`);

    // the packet and its layers
    glow.setAttribute("cx", px.toFixed(1));
    glow.setAttribute("cy", py.toFixed(1));
    setCube(core, [0, y, z], 0.9);
    for (let i = 0; i < 3; i++) {
      const w = smooth(clamp(wrap * 3 - (2 - i)));
      if (y > GATE_FAR[i]) {
        const sc = (1 + (1 - w) * 0.7) * (1 + (still ? 0 : 0.015 * Math.sin(time * 2 + i)));
        setCube(shells[i], [0, y, z], SHELL[i] * sc, w);
        (shed[i] as SVGElement).style.opacity = "0";
      } else {
        (shells[i] as SVGElement).style.opacity = "0";
        const t = clamp((GATE_FAR[i] - y) / 5);
        setCube(shed[i], [0, GATE_FAR[i] - 1.5, 1.5 + t * 0.5], SHELL[i] * (1 + 0.55 * t), 1 - t);
      }
    }

    // the tag: struck out and replaced as the packet passes the server
    const u = clamp((-31 - y) / 6);
    const after = u > 0.5;
    if (after !== swapped || !tagA.textContent) {
      swapped = after;
      tagA.textContent = after ? "dark tunnel" : "203.0.113.42";
      tagB.textContent = after ? "what the app sees" : "your IP, as an example";
    }
    const [tx, ty] = iso(0, y, 5.2);
    tagRoot.setAttribute("transform", `translate(${(tx - (TAG_W / 2) * ts).toFixed(1)} ${(ty - 46 * ts).toFixed(1)}) scale(${ts.toFixed(2)})`);
    // only the station you are at keeps its name on show
    for (const l of labs) l.el.style.opacity = clamp(1.25 - Math.abs(y - l.y) / 16).toFixed(2);
    tagRoot.style.opacity = String(smooth(clamp((wrap - 0.5) * 2.5)));
    const left = u < 0.5 ? 6 : 6 + (TAG_W - 12) * ((u - 0.5) / 0.5);
    const right = u < 0.5 ? 6 + (TAG_W - 12) * (u / 0.5) : TAG_W - 6;
    slab.setAttribute("x", left.toFixed(1));
    slab.setAttribute("width", Math.max(0, right - left).toFixed(1));

    // the conduit: lamps run toward the far end, relays light up as the packet passes, the server blinks
    for (const r of rings) r.el.style.strokeOpacity = (0.3 + 0.5 * Math.max(0, Math.sin(time * 2.4 + r.y * 0.45))).toFixed(2);
    [Y.r1, Y.r2, Y.r3].forEach((yc, i) => {
      const near = clamp(1 - Math.abs(y - yc) / 4);
      glyphs[i].forEach((g, n) => (g.style.strokeOpacity = (0.28 + 0.6 * near * (0.6 + 0.4 * Math.sin(time * 4 - n))).toFixed(2)));
    });
    const busy = clamp(1 - Math.abs(y - Y.srv) / 6);
    leds.forEach((l, i) => (l.style.fillOpacity = (0.12 + 0.7 * (Math.sin(time * (2.5 + busy * 4) + i * 1.9) > 0.2 ? 1 : 0.15)).toFixed(2)));
    const arrived = clamp((-y - 38) / 7);
    wins.forEach((w, i) => (w.style.fillOpacity = (0.05 + (i / wins.length < arrived * 1.1 ? 0.75 : 0)).toFixed(2)));
    if (door) door.style.opacity = (0.35 + 0.65 * arrived).toFixed(2);
    for (const a of amb) {
      const f = (time * 0.32 + a.j * 0.5 + a.si * 0.21) % 1;
      setCube(a.g, [0, lerp(a.seg.near, a.seg.far, f), 1.5], 0.42, Math.sin(f * Math.PI));
    }

    // text over the scene
    if (intro) {
      const o = clamp(1 - (p - 0.03) / 0.08);
      intro.style.opacity = o.toFixed(2);
      intro.style.translate = `0 ${(-36 * (1 - o)).toFixed(1)}px`;
      if (actions) actions.style.visibility = o < 0.05 ? "hidden" : "visible";
    }
    root.classList.toggle("is-moving", p > 0.03);
    caps.forEach((c) => c.el.classList.toggle("is-on", p >= c.from && p < c.to));
    steps.forEach((s, i) => s.classList.toggle("is-on", p >= caps[i].from));
  }

  const fixed = opts.fixed;
  if (fixed !== undefined) tagRoot.style.display = "none";
  const still = reduced();
  if (still) {
    root.classList.add("is-static");
    draw(0.02, 0, 1);
    return () => ro.disconnect();
  }

  let target = 0;
  let cur = 0;
  let active = true;
  const intro_ = { w: 0 };
  let last = 0;
  const tick = (time: number) => {
    if (!active || time - last < 1 / 50) return;
    last = time;
    cur += (target - cur) * (1 - Math.pow(0.88, gsap.ticker.deltaRatio()));
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;
    draw(cur, time, Math.max(intro_.w, clamp(cur / 0.1)));
  };
  gsap.ticker.add(tick);
  addEventListener("pointermove", onPointer, { passive: true });

  // Idle-only mode (the app page): the camera stays on the overview and nothing reads the scroll position.
  if (fixed !== undefined) {
    target = fixed;
    cur = fixed;
    const wrapOnly = gsap.to(intro_, { w: 1, duration: 1.9, delay: 0.3, ease: "power2.out" });
    return () => {
      wrapOnly.kill();
      gsap.ticker.remove(tick);
      removeEventListener("pointermove", onPointer);
      ro.disconnect();
    };
  }

  const st = ScrollTrigger.create({ trigger: root, start: "top top", end: "bottom bottom", onUpdate: (s) => (target = s.progress) });
  const vis = ScrollTrigger.create({
    trigger: root,
    start: "top bottom",
    end: "bottom top",
    onToggle: (s) => {
      active = s.isActive;
      document.documentElement.classList.toggle("hero-on", s.isActive);
    },
  });
  // First frame: the packet wraps itself in three layers while the visitor reads the headline.
  const wrapTween = gsap.to(intro_, { w: 1, duration: 1.9, delay: 0.5, ease: "power2.out" });

  return () => {
    wrapTween.kill();
    gsap.ticker.remove(tick);
    removeEventListener("pointermove", onPointer);
    st.kill();
    vis.kill();
    ro.disconnect();
    document.documentElement.classList.remove("hero-on");
  };
}
