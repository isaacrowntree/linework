/**
 * Invariant tests for the iso renderer — the same test-driven ethos as
 * bike-shock-planner: if the projection or sorting silently breaks, a
 * drawing full of confident-looking wrong geometry is worse than a crash.
 */
import { describe, it, expect } from "vitest";
import { xform, render, type Shape, type View } from "./linework";

const flat: View = { yaw: 0, pitch: 0, f: 1600, cx: 460, cy: 340 };
const turned: View = { yaw: 0.45, pitch: 0.12, f: 1600, cx: 460, cy: 340 };

describe("xform projection", () => {
  it("is the identity for in-plane points at zero yaw/pitch", () => {
    const X = xform(flat);
    const p = X([123.4, 456.7, 0]);
    expect(p.x).toBeCloseTo(123.4, 6);
    expect(p.y).toBeCloseTo(456.7, 6);
    expect(p.k).toBeCloseTo(1, 6);
  });

  it("separates ±z symmetrically in 3D, asymmetrically on screen (perspective)", () => {
    const X = xform({ ...flat, yaw: 0.4 });
    const near = X([460, 340, 50]);
    const far = X([460, 340, -50]);
    expect(near.z).toBeCloseTo(-far.z, 6);            // true 3D symmetry
    expect(near.x).toBeLessThan(460);                  // opposite screen sides
    expect(far.x).toBeGreaterThan(460);
    expect(Math.abs(near.x - 460)).toBeGreaterThan(    // near displaced MORE — parallax
      Math.abs(far.x - 460),
    );
  });

  it("gives real perspective parallax: the near end of the bike grows", () => {
    const X = xform(turned);
    const front = X([740, 400, 0]); // toward the head tube
    const rear = X([180, 400, 0]);  // rear dropout
    expect(front.k).toBeGreaterThan(1);
    expect(rear.k).toBeLessThan(1);
    expect(front.k).toBeGreaterThan(rear.k);
  });

  it("pitch>0 looks down: far side rises on screen, near side drops", () => {
    const X = xform({ ...flat, pitch: 0.3 });
    const near = X([460, 340, 60]);
    const far = X([460, 340, -60]);
    expect(near.y).toBeGreaterThan(far.y);
  });
});

describe("painter's algorithm", () => {
  const disc = (z: number, cls: string): Shape => ({
    t: "disc", c: [460, 340, z], r: 10, strokes: [{ cls }],
  });

  it("paints far shapes before near shapes", () => {
    const svg = render([disc(40, "NEAR"), disc(-40, "FAR")], { ...flat, yaw: 0.3 });
    expect(svg.indexOf("FAR")).toBeLessThan(svg.indexOf("NEAR"));
  });

  it("keeps insertion order for coplanar shapes (stable sort)", () => {
    const svg = render([disc(0, "FIRST"), disc(0, "SECOND")], turned);
    expect(svg.indexOf("FIRST")).toBeLessThan(svg.indexOf("SECOND"));
  });

  it("sorts an animated part as one object and wraps it in its <g>", () => {
    const shapes: Shape[] = [
      disc(0, "WORLD"),
      { t: "disc", c: [460, 340, 30], r: 5, strokes: [{ cls: "A" }], part: "p1" },
      { t: "disc", c: [460, 340, 34], r: 5, strokes: [{ cls: "B" }], part: "p1" },
    ];
    const svg = render(shapes, turned, { p1: { attrs: 'id="p1"' } });
    const gAt = svg.indexOf('<g id="p1">');
    expect(gAt).toBeGreaterThan(svg.indexOf("WORLD")); // nearer → painted after
    // both shapes inside one wrapper, in order
    const inner = svg.slice(gAt);
    expect(inner.indexOf("A")).toBeLessThan(inner.indexOf("B"));
    expect((svg.match(/<g id="p1">/g) ?? []).length).toBe(1);
  });
});

describe("faces and culling", () => {
  const topFace = (): Shape => ({
    t: "quad",
    q: [[400, 300, 0], [400, 300, 20], [500, 300, 20], [500, 300, 0]],
    cls: "TOP",
    cull: true,
  });

  it("culls a face when viewed from the wrong side, shows it from the right side", () => {
    const above = render([topFace()], { ...flat, yaw: 0.3, pitch: 0.3 });
    const below = render([topFace()], { ...flat, yaw: 0.3, pitch: -0.3 });
    const visibleAbove = above.includes("TOP");
    const visibleBelow = below.includes("TOP");
    expect(visibleAbove).not.toBe(visibleBelow); // exactly one side shows it
  });

  it("projects an in-plane disc as a circle at rest and an ellipse when turned", () => {
    const rest = render([{ t: "disc", c: [460, 340, 0], r: 50, strokes: [{ cls: "D" }] }], flat);
    const rx = Number(/rx="([\d.]+)"/.exec(rest)![1]);
    const ry = Number(/ry="([\d.]+)"/.exec(rest)![1]);
    expect(rx).toBeCloseTo(ry, 1);
    expect(rx).toBeCloseTo(50, 1);

    const turnedSvg = render([{ t: "disc", c: [460, 340, 0], r: 50, strokes: [{ cls: "D" }] }], turned);
    const rx2 = Number(/rx="([\d.]+)"/.exec(turnedSvg)![1]);
    const ry2 = Number(/ry="([\d.]+)"/.exec(turnedSvg)![1]);
    expect(rx2).toBeLessThan(ry2); // foreshortened along the turn
  });
});
