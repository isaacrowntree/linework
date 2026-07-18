/**
 * The demo subject: an exploded pillow-block bearing assembly, authored
 * with the `sketch` layer. Shared by the live page and the README hero
 * generator — everything you see is emitted by linework.
 */
import { sketch } from "./sketch.js";

const CX = 460, CY = 320;
export const DEFAULT_VIEW = { yaw: 0.5, pitch: 0.16, f: 1500, cx: CX, cy: CY };

/** e = explode amount, 0 (assembled) → 1 (fully exploded) */
export function scene(view, e = 0.85) {
  const s = sketch(view);
  const lerp = (a, b) => a + (b - a) * e;
  const f1 = (n) => n.toFixed(1);

  /* ---------- base plate ---------- */
  const plate = { x: 300, y: 380, w: 320, h: 42, z: 40, dz: 80 };
  s.box(plate.x, plate.y, plate.w, plate.h, plate.z, plate.dz);
  for (const bx of [348, 572]) {                      // bolt seats on the top face
    s.line([bx - 8, plate.y], -6, [bx + 8, plate.y], 6, "mut");
    s.line([bx - 8, plate.y], 6, [bx + 8, plate.y], -6, "mut");
  }

  /* ---------- bearing housing + shaft ---------- */
  const hy = lerp(310, 248);
  s.part("housing", 'class="prt"', () => {
    s.cyl([CX, hy], 70, 34, -34, "ink");
    s.bias(0.6, () => s.cap([CX, hy], 34, 32, "ink").cap([CX, hy], 34, 58, "mut"));
  });
  const szN = lerp(74, 168), szF = lerp(-74, 24);
  s.part("shaft", 'class="prt"', () => {
    s.cyl([CX, hy], 19, szN, szF, "ink");
    s.bias(0.7, () => s.cap([CX, hy], szN, 8, "mut"));
  });

  /* ---------- bolts, exploded upward ---------- */
  for (const [key, bx] of [["boltL", 348], ["boltR", 572]]) {
    const by = lerp(plate.y, 262), drop = lerp(0, 34);
    s.part(key, 'class="prt"', () => {
      s.box(bx - 12, by - 14, 24, 14, 9, 18);
      s.path("ink", 7).M([bx, by]).L([bx, by + drop]);
      for (let t = 0; t < 3; t++)
        s.line([bx - 5, by + drop - 4 - t * 5], 0, [bx + 5, by + drop - 4 - t * 5], 0, "mut");
    });
  }

  /* ---------- ground shadow (paper, painted under via first-position) ---------- */
  const gp = s.pt([CX, 476]);
  const under = `<ellipse cx="${f1(gp[0])}" cy="${f1(gp[1])}" rx="${f1(230 * Math.cos(view.yaw))}" ry="14" class="shadow"/>`;

  /* ---------- annotations: leaders, balloons, dimension, title block ---------- */
  const pl = (a, b, cls, extra = "") =>
    s.paper(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" class="${cls}" ${extra}/>`);
  if (e > 0.05) {
    const lead = (from, to) => pl(from, to, "dash", `opacity="${(e * 0.9).toFixed(2)}"`);
    lead(s.pt([CX, hy + 70]), s.pt([CX, 376]));
    lead(s.pt([348, 262]), s.pt([348, plate.y]));
    lead(s.pt([572, 262]), s.pt([572, plate.y]));
    lead(s.pt([CX + 19, hy], szF), s.pt([CX + 19, hy], -60));
  }
  const balloon = (n, p, dx, dy) => {
    const q = [p[0] + dx, p[1] + dy];
    pl(p, q, "mut");
    s.paper(`<circle cx="${f1(q[0])}" cy="${f1(q[1])}" r="12" class="bl"/><text x="${f1(q[0])}" y="${f1(q[1] + 4)}" class="bt" text-anchor="middle">${n}</text>`);
  };
  balloon(1, s.pt([CX - 68, hy], 34), -54, 6);
  balloon(2, s.pt([348, lerp(plate.y, 262) - 14], 9), -34, -40);
  balloon(3, s.pt([CX + 14, hy], szN), 58, -18);
  const d1 = s.pt([plate.x, 452]), d2 = s.pt([plate.x + plate.w, 452]);
  pl(d1, d2, "mut", 'marker-start="url(#lwarr)" marker-end="url(#lwarr)"');
  s.paper(`<text x="${f1((d1[0] + d2[0]) / 2)}" y="${f1(d1[1] - 8)}" class="an" text-anchor="middle">320 mm</text>`);
  s.paper(`<g class="tb"><rect x="668" y="492" width="238" height="54" class="tbr"/>
    <line x1="668" y1="511" x2="906" y2="511" class="mut"/>
    <text x="678" y="506" class="tt">LINEWORK · DWG 001</text>
    <text x="678" y="527" class="an">PILLOW BLOCK · EXPLODED ${(e * 100).toFixed(0)} %</text>
    <text x="678" y="541" class="an">PAINTER-SORTED · ${s.count()} SHAPES</text></g>`);

  /* ---------- render, timed — the objectivity readout ---------- */
  const count = s.count();
  const t0 = performance.now();
  const svg = under + s.render();
  const ms = performance.now() - t0;
  return { svg, count, ms };
}
