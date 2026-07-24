import { describe, it, expect } from "vitest";
import { featureEdges, parseOBJ, meshToShapes, type Mesh } from "./import";

/** unit cube, 8 shared corners, 12 triangles — closed, all creases 90° */
function cube(): Mesh {
  const positions = new Float32Array([
    -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, // back z-
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,      // front z+
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2,   // back
    4, 5, 6, 4, 6, 7,   // front
    0, 1, 5, 0, 5, 4,   // bottom
    3, 7, 6, 3, 6, 2,   // top
    0, 4, 7, 0, 7, 3,   // left
    1, 2, 6, 1, 6, 5,   // right
  ]);
  return { positions, indices };
}

describe("feature-edge extraction", () => {
  it("a closed cube yields exactly its 12 edges (face diagonals rejected)", () => {
    const edges = featureEdges(cube(), { angle: 25 });
    expect(edges.length).toBe(12);
  });

  it("raising the crease threshold past 90° drops every interior edge", () => {
    // a cube's creases are exactly 90°; a threshold above that keeps none
    expect(featureEdges(cube(), { angle: 95 }).length).toBe(0);
  });

  it("an open triangle is three boundary edges", () => {
    const tri: Mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
    expect(featureEdges(tri, { angle: 25 }).length).toBe(3);
  });

  it("welds coincident but separately-indexed vertices so shared edges aren't seen as boundaries", () => {
    // two triangles forming a flat quad, sharing an edge but NOT sharing indices
    const m: Mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, /*dup*/ 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
    // coplanar → the shared interior edge is NOT a feature; only the 4 outer edges are boundaries
    expect(featureEdges(m, { angle: 25 }).length).toBe(4);
  });
});

describe("OBJ parsing", () => {
  it("parses vertices and fan-triangulates faces", () => {
    const obj = "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n";
    const [m] = parseOBJ(obj);
    expect(m.positions.length).toBe(12);   // 4 verts
    expect(m.indices.length).toBe(6);      // quad → 2 triangles
    expect(featureEdges(m).length).toBe(4); // a flat quad outline
  });
});

describe("meshToShapes", () => {
  it("emits one path per edge, fitted into the screen box", () => {
    const shapes = meshToShapes([cube()], { fit: { cx: 100, cy: 100, size: 80 }, cls: "ink" });
    expect(shapes.length).toBe(12);
    expect(shapes.every((s) => s.t === "path")).toBe(true);
    // fitted: every projected coordinate lands within the box half-extent of center
    for (const s of shapes as any[])
      for (const cmd of s.d)
        if (cmd[0] !== "Z") {
          expect(Math.abs(cmd[1][0] - 100)).toBeLessThanOrEqual(41);
          expect(Math.abs(cmd[1][1] - 100)).toBeLessThanOrEqual(41);
        }
  });
});
