# Contributing to linework

Thanks for taking a look. linework is small on purpose — the whole point is a
tight, dependency-free core you can read in one sitting. Contributions are
welcome as long as they keep it that way.

## Ground rules

- **No runtime dependencies.** Ever. Dev dependencies (TypeScript, Vitest) are fine.
- **Every geometry change ships a test.** A renderer that's subtly wrong produces
  confident-looking wrong pictures — worse than a crash. If you touch projection,
  sorting, or a shape emitter, add or update an invariant in `src/*.test.ts`.
- **The library never styles.** It emits class names the consumer defines. Don't
  bake in colors, stroke widths, or fonts.
- **Keep the core small.** New ergonomics belong in `sketch`, `helpers`, or a new
  optional entry point — not in `linework.ts`.

## Getting set up

```bash
git clone https://github.com/isaacrowntree/linework
cd linework
npm install
npm test            # 13 invariant tests
npm run typecheck
npm run build       # tsc → dist/ (ESM + .d.ts)
npm run hero        # regenerate docs/hero.svg (server-side render demo)
```

The demo page under `docs/` is served by GitHub Pages and doubles as a manual
test surface — open `docs/index.html` (any static server) and drag the drawing.

## Project layout

| Path | What |
|---|---|
| `src/linework.ts` | The core: pipeline, `xform`, `render`, `Shape` types |
| `src/helpers.ts` | Primitive builders (`tube`, `box3`, `cyl3`, `disc`…) |
| `src/sketch.ts` | Fluent authoring layer with scoped context blocks |
| `src/orbit.ts` | Drag-to-orbit interaction helper |
| `docs/` | The live demo page + generated hero |
| `scripts/render-hero.mjs` | Server-side render of the README image |

## Submitting

1. Fork, branch, and make your change with tests.
2. `npm test && npm run typecheck && npm run build` all green.
3. Open a PR describing the change and, for anything visual, include a before/after.

CI runs typecheck + tests + build on every PR.
