// The driver for the signature: one number (scroll progress, 0 to 1) decides how far the marker has got on every row.
// Idle input: a scan line sweeps the file, so the concept keeps moving while the visitor reads.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ease, reduced } from "../engine";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const STRIKE = 0.14; // how much scroll progress one strike takes
// A hard, fast strike: expo-out.
const strike = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

type Row = { el: HTMLElement; bar: HTMLElement; at: number };

export function startDossier(section: HTMLElement): () => void {
  const panel = section.querySelector<HTMLElement>("[data-panel]");
  const scan = section.querySelector<HTMLElement>("[data-scan]");
  const rows: Row[] = [...section.querySelectorAll<HTMLElement>("[data-row]")].map((el) => ({
    el,
    bar: el.querySelector<HTMLElement>("[data-bar]")!,
    at: Number(el.dataset.at ?? 0),
  }));
  const word = section.querySelector<HTMLElement>("[data-redact]");
  if (!panel || !rows.length) return () => {};

  const setBar = (r: Row, len: number) => (r.bar.style.scale = `${len} 1`);

  // Reduced motion: no scrub. One designed still with every row struck.
  if (reduced()) {
    section.classList.add("is-static");
    rows.forEach((r) => {
      setBar(r, 1);
      r.el.classList.add("is-done", "is-tagged");
    });
    return () => {};
  }

  let target = 0; // scroll progress
  let current = 0; // lagged value that drives the visuals
  const intro = { v: 0 };
  let active = true;
  let panelH = panel.offsetHeight;
  const ro = new ResizeObserver(() => (panelH = panel.offsetHeight));
  ro.observe(panel);

  const apply = (p: number) => {
    for (const r of rows) {
      const raw = clamp((p - r.at) / STRIKE);
      const v = strike(raw);
      setBar(r, v);
      r.el.classList.toggle("is-done", v > 0.985);
      r.el.classList.toggle("is-tagged", raw > 0.02);
    }
  };

  // The scan line is the idle input: an app reading the file, top to bottom, forever.
  const tick = (time: number) => {
    if (!active) return;
    const k = 1 - Math.pow(0.9, gsap.ticker.deltaRatio());
    current += (Math.max(intro.v, target) - current) * k;
    apply(current);
    if (scan) scan.style.translate = `0 ${(((time * 0.1) % 1.2) - 0.1) * panelH}px`;
  };
  gsap.ticker.add(tick);

  // Desktop: the whole stage is pinned, so progress runs over the section. Phone: only the file is pinned.
  const mm = gsap.matchMedia();
  mm.add("(min-width: 861px)", () => {
    const st = ScrollTrigger.create({ trigger: section, start: "top top", end: "bottom bottom", onUpdate: (s) => (target = s.progress) });
    return () => st.kill();
  });
  mm.add("(max-width: 860px)", () => {
    const st = ScrollTrigger.create({
      trigger: panel,
      start: "top 72px",
      endTrigger: section,
      end: "bottom bottom",
      onUpdate: (s) => (target = s.progress),
    });
    return () => st.kill();
  });
  const vis = ScrollTrigger.create({ trigger: section, start: "top bottom", end: "bottom top", onToggle: (s) => (active = s.isActive) });

  // First frame: the marker has already struck the first row, so the page shows its idea before anyone scrolls.
  const introTween = gsap.to(intro, { v: 0.225, duration: 1.4, delay: 1.1, ease: ease.out });
  // The marker strikes the headline word first.
  const wordCall = gsap.delayedCall(0.55, () => word?.classList.add("is-struck"));

  return () => {
    introTween.kill();
    wordCall.kill();
    gsap.ticker.remove(tick);
    mm.revert();
    vis.kill();
    ro.disconnect();
  };
}
