// The isometric route, drawn once as an SVG string. View from +x, +y, +z: x runs to the lower right,
// y to the lower left, z is up. The conduit runs along -y, so the journey climbs toward the upper right.
// Depth order is far to near, which is also the order of the items in the markup.

export const U = 26; // pixels per world unit at camera scale 1
const C = Math.cos(Math.PI / 6);
export type P3 = [number, number, number];
export const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * C * U, ((x + y) * 0.5 - z) * U];
const f = (n: number) => +n.toFixed(1);
const P = (p: P3) => iso(...p).map(f).join(",");
const poly = (pts: P3[], cls: string, extra = "") => `<polygon class="${cls}" points="${pts.map(P).join(" ")}" ${extra}/>`;
const line = (a: P3, b: P3, cls: string, extra = "") => {
  const [x1, y1] = iso(...a);
  const [x2, y2] = iso(...b);
  return `<line class="${cls}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${extra}/>`;
};

/** A box from its minimum corner. Faces: fl is the +y face (lower left), fr the +x face (lower right), ft the top. */
function box(x0: number, y0: number, z0: number, w: number, d: number, h: number, cls: string) {
  const x1 = x0 + w;
  const y1 = y0 + d;
  const z1 = z0 + h;
  return (
    poly([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], `${cls} fl`) +
    poly([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], `${cls} fr`) +
    poly([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], `${cls} ft`)
  );
}

/** Points strings for the three visible faces of a cube, for the parts that move. */
export function cubePts(cx: number, cy: number, cz: number, s: number) {
  const h = s / 2;
  const [x0, x1, y0, y1, z0, z1] = [cx - h, cx + h, cy - h, cy + h, cz - h, cz + h];
  const pts = (a: P3[]) => a.map(P).join(" ");
  return {
    fl: pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]),
    fr: pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]),
    ft: pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]),
  };
}

// ---------- layout along the path ----------
export const Y = { you: 0, r1: -11, r2: -18, r3: -25, srv: -34, app: -45 };
export const GATE_FAR = [-13, -20, -27]; // far edge of each relay: where its layer is peeled off
const GATE_D = 2; // half depth of a gate
const IN = 1.5; // half width of the conduit
const H = 3; // height of the conduit

type Item = { id: string; near: number; far: number; kind: "seg" | "gate"; html: string };

function segment(id: string, near: number, far: number): Item {
  const a = near;
  const b = far;
  const back =
    poly([[-IN, a, 0], [IN, a, 0], [IN, b, 0], [-IN, b, 0]], "t-floor") +
    poly([[-IN, a, 0], [-IN, b, 0], [-IN, b, H], [-IN, a, H]], "t-wall") +
    line([-IN, a, 0], [-IN, b, 0], "t-rail") +
    line([-IN, a, H], [-IN, b, H], "t-rail");
  let rings = "";
  for (let y = a; y >= b - 0.01; y -= 1.5) {
    rings += `<path class="ring" data-ring data-y="${f(y)}" d="M${P([-IN, y, 0])} L${P([IN, y, 0])} L${P([IN, y, H])} L${P([-IN, y, H])} Z"/>`;
  }
  const front =
    poly([[-IN, b, H], [IN, b, H], [IN, a, H], [-IN, a, H]], "t-top") +
    poly([[IN, a, 0], [IN, b, 0], [IN, b, H], [IN, a, H]], "t-side") +
    line([IN, a, 0], [IN, b, 0], "t-rail") +
    line([IN, a, H], [IN, b, H], "t-rail") +
    rings;
  const html = `<g data-item="${id}" data-near="${near}" data-far="${far}" data-kind="seg"><g class="back">${back}</g><g class="amb" data-amb></g><g class="front">${front}</g></g>`;
  return { id, near, far, kind: "seg", html };
}

const portal = (yFront: number) =>
  poly([[-IN - 0.1, yFront + 0.02, 0], [IN + 0.1, yFront + 0.02, 0], [IN + 0.1, yFront + 0.02, H + 0.1], [-IN - 0.1, yFront + 0.02, H + 0.1]], "portal");

function relay(id: string, yc: number): Item {
  const near = yc + GATE_D;
  const far = yc - GATE_D;
  const hgt = 3.9;
  // the onion glyph on the roof: three nested rings (an ellipse is a circle in the ground plane)
  const [ex, ey] = iso(0, yc, hgt);
  const glyph = [0.5, 1, 1.55].map((r, i) => `<ellipse class="glyph" data-glyph="${i}" cx="${f(ex)}" cy="${f(ey)}" rx="${f(r * 1.2247 * U)}" ry="${f(r * 0.7071 * U)}"/>`).join("");
  const html = `<g data-item="${id}" data-near="${near}" data-far="${far}" data-kind="gate">${box(-2.6, far, 0, 5.2, GATE_D * 2, hgt, "solid glassy")}${portal(near)}${glyph}</g>`;
  return { id, near, far, kind: "gate", html };
}

function server(): Item {
  const yc = Y.srv;
  const near = yc + GATE_D;
  const far = yc - GATE_D;
  const hgt = 4.8;
  let leds = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const y = far + 0.55 + c * 1.05;
      const z = 0.9 + r * 1.35;
      leds += poly([[2.62, y, z], [2.62, y + 0.55, z], [2.62, y + 0.55, z + 0.4], [2.62, y, z + 0.4]], "led", `data-led="${r * 3 + c}"`);
    }
  }
  const html = `<g data-item="srv" data-near="${near}" data-far="${far}" data-kind="gate">${box(-2.6, far, 0, 5.2, GATE_D * 2, hgt, "solid glassy")}${portal(near)}${leds}</g>`;
  return { id: "srv", near, far, kind: "gate", html };
}

function app(): Item {
  const near = -42;
  const far = -48;
  const hgt = 5.8;
  let wins = "";
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const y = far + 0.6 + c * 1.3;
      const z = 1.3 + r * 2;
      wins += poly([[4.02, y, z], [4.02, y + 0.8, z], [4.02, y + 0.8, z + 1.1], [4.02, y, z + 1.1]], "win", `data-win="${r * 4 + c}"`);
    }
  }
  const html = `<g data-item="app" data-near="${near}" data-far="${far}" data-kind="gate">${box(-4, far, 0, 8, near - far, hgt, "solid")}${portal(near)}<g data-doorglow>${poly([[-IN, near + 0.04, 0], [IN, near + 0.04, 0], [IN, near + 0.04, H], [-IN, near + 0.04, H]], "door")}</g>${wins}</g>`;
  return { id: "app", near, far, kind: "gate", html };
}

function you(): Item {
  const near = 3;
  const far = -3;
  const [px, py] = iso(0, 0, 0.6);
  const pad = `<ellipse class="pad" cx="${f(px)}" cy="${f(py)}" rx="${f(1.6 * 1.2247 * U)}" ry="${f(1.6 * 0.7071 * U)}"/>`;
  const laptop =
    box(-3.1, -1.4, 0.6, 2.2, 1.7, 0.12, "solid") +
    box(-3.1, -1.4, 0.72, 2.2, 0.12, 1.5, "solid") +
    poly([[-2.95, -1.26, 0.9], [-1.05, -1.26, 0.9], [-1.05, -1.26, 2.1], [-2.95, -1.26, 2.1]], "screen");
  const html = `<g data-item="you" data-near="${near}" data-far="${far}" data-kind="gate">${box(-3.5, far, 0, 7, near - far, 0.6, "solid")}${pad}${laptop}</g>`;
  return { id: "you", near, far, kind: "gate", html };
}

const label = (text: string, x: number, y: number, z: number, lift = 34, station = y) => {
  const [sx, sy] = iso(x, y, z);
  return `<g data-lab="${station}"><line class="lead" x1="${f(sx)}" y1="${f(sy)}" x2="${f(sx)}" y2="${f(sy - lift)}"/><text class="lab" x="${f(sx)}" y="${f(sy - lift - 8)}" text-anchor="middle">${text}</text></g>`;
};

/** The whole scene as markup (no user input in it). */
export function sceneMarkup(): string {
  // ground grid
  let ground = "";
  for (let x = -32; x <= 32; x += 4) ground += line([x, 16, 0], [x, -64, 0], "grid");
  for (let y = -64; y <= 16; y += 4) ground += line([-32, y, 0], [32, y, 0], "grid");

  const items: Item[] = [
    app(),
    segment("s5", -36, -42),
    server(),
    segment("s4", -27, -32),
    relay("r3", Y.r3),
    segment("s3", -20, -23),
    relay("r2", Y.r2),
    segment("s2", -13, -16),
    relay("r1", Y.r1),
    segment("s1", -3, -9),
    you(),
  ];

  const labels =
    label("The app", 0, Y.app, 5.8, 30) +
    label("Our server", 0, Y.srv, 4.8, 30) +
    label("Tor", 0, Y.r2, 3.9, 30) +
    label("You", -2.6, 2.4, 0.6, 22, 0);

  return (
    `<defs>
      <radialGradient id="glow"><stop offset="0" stop-color="#ecebe6" stop-opacity=".55"/><stop offset="1" stop-color="#ecebe6" stop-opacity="0"/></radialGradient>
      <radialGradient id="beam"><stop offset="0" stop-color="#ecebe6" stop-opacity=".5"/><stop offset=".5" stop-color="#ecebe6" stop-opacity=".12"/><stop offset="1" stop-color="#ecebe6" stop-opacity="0"/></radialGradient>
    </defs>` +
    `<g data-cam>` +
    `<g class="ground">${ground}</g>` +
    `<g data-items>${items.map((i) => i.html).join("")}</g>` +
    `<g class="overlay">${labels}<g data-tag></g></g>` +
    `</g>`
  );
}
