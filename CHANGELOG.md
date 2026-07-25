# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

## [0.3.0] — 2026-07-24

### Added
- **More import formats** (`linework/import`): `parseSTL` (binary or ASCII — the
  3D-printing format), `fromBufferGeometry` (adapt a three.js `BufferGeometry`
  with no three.js dependency), and `fromOcct` (map [occt-import-js] STEP/IGES
  results in — the CAD kernel stays an optional ~6 MB peer, not a dependency).
- Live demo importer now accepts `.stl` alongside `.glb` / `.obj`.
- 6 more tests (binary + ASCII STL round-trips, size-based binary detection,
  three.js adapter indexed/non-indexed, occt result mapping). 25 total.

[occt-import-js]: https://github.com/kovacsv/occt-import-js

## [0.4.0] — 2026-07-25

### Security
- **Hardened GLB parsing against untrusted input.** The parser validates the
  header, version, and chunk lengths, bounds-checks every accessor byte range
  before reading, caps per-accessor element counts, guards against cyclic node
  graphs, and wraps JSON parsing — a malformed or malicious file now throws a
  typed `Error` instead of reading out of bounds, over-allocating, or looping
  forever. Added [`SECURITY.md`](SECURITY.md) with a reporting policy and the
  parsing threat model.
- Adversarial parser tests: bad magic, truncated buffer, oversized JSON chunk,
  out-of-bounds accessor count, unknown component type, cyclic node graph.

### Added
- `engines` (Node ≥ 18), `sideEffects: false` (tree-shaking), inlined-source
  build source maps, and an Environments/compatibility table in the README.
- Tooling: ESLint (flat config) + typescript-eslint, coverage (`test:coverage`),
  Dependabot (npm + actions), `.editorconfig`, `.nvmrc`.
- CI: Node 20/22/24 matrix, least-privilege token permissions, lint step.
- `release.yml` — publishes to npm with build **provenance** on a `v*` tag.

## [0.2.0] — 2026-07-24

### Added
- **Model import** (`linework/import`): turn a **glTF/GLB or OBJ mesh** into
  linework strokes via feature-edge extraction — boundary edges plus sharp
  creases (configurable `angle`), with vertices welded by position so shared
  edges aren't mistaken for boundaries. `parseGLB` / `parseOBJ` / `featureEdges`
  / `meshToShapes`, all zero-dependency; no Draco, geometry-only.
- Live "drop a .glb / .obj" importer on the demo page, running entirely in the
  browser, defaulting to a CC0 street lantern (5,394 tris → feature edges).
- 6 new tests (cube edge count, crease threshold, boundary detection, vertex
  welding, OBJ parsing, fitted emit). 19 total.

[0.2.0]: https://github.com/isaacrowntree/linework/releases/tag/v0.2.0

## [0.1.0] — 2026-07-18

First public release.

### Added
- **Core renderer** (`linework`): the classic pipeline — 3D points → yaw/pitch
  rotation → perspective projection → painter's-algorithm depth sorting → SVG
  strings. Multi-stroke paths, plane-correct disc ellipses, backface-culled
  quads, per-object sorting for animated part groups, depth cueing.
- **Sketch layer** (`linework/sketch`): fluent authoring API with scoped context
  blocks (`part` / `tag` / `bias`), chainable paths, a view-aware `cyl`, paper-space
  notes, and the `scene()` replay idiom for animation frames.
- **Orbit helper** (`linework/orbit`): drag-to-orbit boilerplate as a one-liner —
  pointer capture, yaw/pitch clamping, rAF batching, double-click reset, and
  reduced-motion-aware idle sway.
- **Helpers** (`linework/helpers`): the primitive-builder middle layer.
- 13 invariant tests, GitHub Actions CI, ESM build with type declarations.
- Blueprint demo site rendered entirely by the library; server-side hero image
  rendered in Node.

[0.1.0]: https://github.com/isaacrowntree/linework/releases/tag/v0.1.0
