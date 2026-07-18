# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).

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
  via `npm run hero`.

[0.1.0]: https://github.com/isaacrowntree/linework/releases/tag/v0.1.0
