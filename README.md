# linework

A tiny **true-3D renderer for annotated technical drawings**, output as plain SVG strings. Rotate → project → depth-sort → paint. Zero dependencies, ~180 lines, fully tested.

Built because this category is empty: 3D libraries (three.js) make *shaded surfaces* easy and annotated linework painful — thin strokes, dash patterns, line-weight hierarchy, crawlable text callouts are all fights against WebGL. Pseudo-3D toys (Zdog, unmaintained since 2019) can't do text or real depth sorting granularity. Nothing ships "parametric technical illustration." This does exactly that, and nothing else.

## What you get

- **The classic pipeline, honestly implemented**: model in 3D points → yaw/pitch rotation → perspective projection → painter's-algorithm depth sorting per frame → SVG string out.
- **Shapes built for drawings, not games**: multi-stroke paths (hollow-tube outlines in one shape), discs that project to correct ellipses, stylized cylinder end-caps, backface-culled quads for boxes.
- **Per-object sorting for animated parts**: shapes sharing a `part` key sort as one unit and emit inside one `<g>` wrapper — CSS transforms/transitions on parts keep working.
- **Depth cueing**: far strokes dim gently instead of hidden-line removal — reads as "behind," stays printable.
- **SVG strings, not a canvas**: your output is themeable with CSS variables, accessible, crawlable, printable. Styling lives in your stylesheet, not the library.

## Usage

```ts
import { render, type Shape, type View } from "./src/linework";

const view: View = { yaw: 0.42, pitch: 0.1, f: 1600, cx: 460, cy: 340 };

const shapes: Shape[] = [
  // a wheel: disc in the model's xy-plane → correct ellipse under rotation
  { t: "disc", c: [180, 400, 0], r: 148, strokes: [{ cls: "tire" }, { cls: "tire-in" }] },
  // a frame tube: fat outline + panel-colored core = hollow tube, one shape
  { t: "path", d: [["M", [180, 400, 40]], ["Q", [300, 420, 20], [420, 340, 10]]],
    strokes: [{ cls: "tube", w: 9 }, { cls: "tube-in", w: 4 }] },
  // an animated part: sorts as one object, emits inside its own <g>
  { t: "face", c: [420, 430, 28], r: 24, strokes: [{ cls: "accent" }], part: "motor" },
];

const svg = render(shapes, view, { motor: { attrs: 'id="motor" class="part"' } });
element.innerHTML = svg; // rebuild per frame for a drag turntable — it's ~1ms
```

Known limitation (shared with every painter's-algorithm renderer): cyclic overlaps can't sort correctly — split long members into segments if you hit one. Faces (`t: "face"`) deliberately stay round instead of thinning to lenses edge-on; parts must stay readable in a diagram.

## Tests

```bash
npm install && npm test
```

Nine invariants: projection identity, 3D symmetry vs on-screen perspective asymmetry, parallax direction, pitch orientation, far-to-near paint order, stable coplanar ordering, part grouping, backface culling, disc foreshortening.

## Provenance

Extracted from [Fitment](https://fitment.cc) — a "will that part fit your bike?" planner whose exploded service-manual drawings are rendered entirely by this engine, live-orbitable, with dimension callouts in flat paper space over the rotating model.

MIT.
