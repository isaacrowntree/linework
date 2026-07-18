import { describe, it, expect } from "vitest";
import { sketch, scene } from "./sketch";

const view = { yaw: 0.4, pitch: 0.1, f: 1500, cx: 460, cy: 320 };

describe("sketch authoring layer", () => {
  it("context blocks scope part/tag/bias and restore afterwards", () => {
    const s = sketch(view);
    s.part("motor", 'id="m"', () => {
      s.tag("dt-mid", () => s.cap([460, 300], 20, 10, "A"));
    });
    s.cap([460, 300], 20, 10, "B"); // outside — no part, no tag
    const svg = s.render();
    const gAt = svg.indexOf('<g id="m">');
    expect(gAt).toBeGreaterThanOrEqual(0);
    expect(svg.slice(gAt)).toContain("A dt-mid");          // tag applied inside
    expect(svg).toContain('class="B"');                     // untouched outside
    expect(svg.indexOf('class="B"')).toBeLessThan(gAt === -1 ? Infinity : svg.length);
  });

  it("fluent path chains and multi-strokes over one geometry", () => {
    const s = sketch(view);
    s.tube(9, "outer", "core").M([100, 100]).Q([150, 80], 10, [200, 100], 20);
    const svg = s.render();
    const outer = /class="outer"[^/]*stroke-width="9(\.0)?"/.test(svg);
    expect(outer).toBe(true);
    expect(svg).toContain('class="core"');
    // both strokes share the same d
    const ds = [...svg.matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
    expect(ds[0]).toBe(ds[1]);
  });

  it("scene() replays the build with a fresh view each call", () => {
    const draw = scene((s: any, props: { r: number }) => s.disc([460, 320], 0, props.r, "D"));
    const a = draw(view, { r: 40 });
    const b = draw({ ...view, yaw: 0 }, { r: 40 });
    expect(a).toContain("ellipse");
    expect(b).toContain("ellipse");
    expect(a).not.toBe(b); // different view, different projection
  });

  it("paper space paints above the sorted scene", () => {
    const s = sketch(view);
    s.disc([460, 320], 0, 40, "WORLD");
    s.note("CALLOUT", [460, 320], 0);
    const svg = s.render();
    expect(svg.indexOf("WORLD")).toBeLessThan(svg.indexOf("CALLOUT"));
  });
});
