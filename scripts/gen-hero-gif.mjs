// Regenerates the animated README hero (docs/hero-orbit.gif) — a seamless 360°
// orbit of the imported CC0 lantern, every frame rendered by the library in
// Node, then rasterised with rsvg-convert and encoded with ffmpeg.
//
// A still image can't show the one thing that distinguishes this from an SVG
// clip-art exporter: the paint order is *recomputed per frame*. The loop is the
// proof. Run: `npm run gif` (needs rsvg-convert + ffmpeg on PATH).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseGLB, meshToShapes } from "../dist/import.js";
import { render } from "../dist/linework.js";

const FRAMES = 36; // 36 × 1/18s = a 2-second loop
const FPS = 18;
const W = 800, H = 560;

const glb = readFileSync(new URL("../docs/lantern.glb", import.meta.url));
const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
const meshes = parseGLB(ab);
const tris = meshes.reduce((a, m) => a + m.indices.length / 3, 0);

// Feature edges are extracted ONCE — only the view changes per frame, so the
// per-frame cost is rotate → project → depth-sort, which is the point.
const shapes = meshToShapes(meshes, { angle: 25, cls: "ink", fit: { cx: 400, cy: 290, size: 420 } });

const chrome = `<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1D3B69" stroke-width="1"/></pattern></defs>
<rect width="${W}" height="${H}" fill="#0D2140"/><rect width="${W}" height="${H}" fill="url(#g)"/>
<style>.ink{stroke:#F4F9FF;stroke-width:1.1;fill:none;stroke-linecap:round}.an{font:12px ui-monospace,Menlo,monospace;fill:#7FA3C9}.tt{font:700 12px Futura,sans-serif;fill:#FFC24B;letter-spacing:.1em}</style>`;

const dir = mkdtempSync(join(tmpdir(), "linework-gif-"));
let ms = 0;

try {
  for (let i = 0; i < FRAMES; i++) {
    // Not a full 360° turn: at yaw ≈ 0 and ≈ π/2 the lantern's crossbar points
    // straight at the camera and the whole drawing collapses to a flat
    // elevation. A cosine ping-pong stays inside the three-quarter view that
    // reads as *drawn*, and is seamless for free — cos is periodic, and its
    // zero derivative at both ends eases the turnarounds without extra work.
    const phase = (i / FRAMES) * Math.PI * 2;
    const view = {
      yaw: 0.85 + 0.42 * Math.cos(phase),
      pitch: 0.30 + 0.06 * Math.sin(phase),
      f: 1500, cx: 400, cy: 290,
    };
    const t0 = performance.now();
    const body = render(shapes, view);
    ms += performance.now() - t0;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="system-ui">
${chrome}
${body}
<text x="24" y="40" class="tt">IMPORTED · CC0 LANTERN</text>
<text x="24" y="536" class="an">glTF mesh · ${tris} triangles → ${shapes.length} feature edges · depth-sorted every frame</text></svg>`;
    const stem = join(dir, `f-${String(i).padStart(3, "0")}`);
    writeFileSync(`${stem}.svg`, svg);
    execFileSync("rsvg-convert", ["-w", String(W), "-h", String(H), "-o", `${stem}.png`, `${stem}.svg`]);
  }

  const out = new URL("../docs/hero-orbit.gif", import.meta.url).pathname;
  // Two-pass palette: line art on a flat field quantises cleanly at 64 colours,
  // and a light Bayer dither keeps the grid from banding without fuzzing strokes.
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error",
    "-framerate", String(FPS),
    "-i", join(dir, "f-%03d.png"),
    "-filter_complex",
    "[0:v] split [a][b];[a] palettegen=max_colors=64:stats_mode=diff [p];[b][p] paletteuse=dither=bayer:bayer_scale=3",
    "-loop", "0",
    out,
  ]);

  console.log(
    `docs/hero-orbit.gif — ${FRAMES} frames, ${tris} triangles → ${shapes.length} edges, ` +
    `${(ms / FRAMES).toFixed(2)} ms/frame of actual render time`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
