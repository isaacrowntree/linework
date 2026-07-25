import { describe, it, expect } from "vitest";
import { featureEdges, parseGLB, parseOBJ, parseSTL, fromBufferGeometry, fromOcct, meshToShapes, meshGroups, explode, type Mesh } from "./import";

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

/* ---- emit a cube as STL both ways, then read it back ---- */
function tris(m: Mesh): [number[], number[], number[]][] {
  const p = m.positions, out: [number[], number[], number[]][] = [];
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = (k: number) => [p[m.indices[t + k] * 3], p[m.indices[t + k] * 3 + 1], p[m.indices[t + k] * 3 + 2]];
    out.push([v(0), v(1), v(2)]);
  }
  return out;
}
function toAsciiSTL(m: Mesh): string {
  let s = "solid cube\n";
  for (const [a, b, c] of tris(m))
    s += `facet normal 0 0 0\nouter loop\nvertex ${a.join(" ")}\nvertex ${b.join(" ")}\nvertex ${c.join(" ")}\nendloop\nendfacet\n`;
  return s + "endsolid cube\n";
}
function toBinarySTL(m: Mesh): ArrayBuffer {
  const T = tris(m), buf = new ArrayBuffer(84 + T.length * 50), dv = new DataView(buf);
  dv.setUint32(80, T.length, true);
  T.forEach(([a, b, c], i) => {
    let o = 84 + i * 50 + 12; // skip normal
    for (const v of [a, b, c]) for (const n of v) { dv.setFloat32(o, n, true); o += 4; }
  });
  return buf;
}

describe("STL parsing", () => {
  it("reads a binary STL cube back to 12 feature edges", () => {
    const [m] = parseSTL(toBinarySTL(cube()));
    expect(m.indices.length).toBe(36);           // 12 triangles, unindexed
    expect(featureEdges(m).length).toBe(12);
  });
  it("reads an ASCII STL cube back to 12 feature edges", () => {
    const [m] = parseSTL(toAsciiSTL(cube()));
    expect(featureEdges(m).length).toBe(12);
  });
  it("prefers binary detection by exact size, even when the header says 'solid'", () => {
    const buf = toBinarySTL(cube());
    new Uint8Array(buf).set([115, 111, 108, 105, 100], 0); // write "solid" into the binary header
    expect(featureEdges(parseSTL(buf)[0]).length).toBe(12);
  });
});

describe("three.js BufferGeometry adapter", () => {
  it("adapts an indexed geometry-like object", () => {
    const c = cube();
    const geo = { attributes: { position: { array: c.positions } }, index: { array: c.indices } };
    const m = fromBufferGeometry(geo);
    expect(featureEdges(m).length).toBe(12);
  });
  it("handles non-indexed geometry (sequential indices)", () => {
    const geo = { attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } } };
    const m = fromBufferGeometry(geo);
    expect(m.indices.length).toBe(3);
    expect(featureEdges(m).length).toBe(3);
  });
});

describe("grouped import (L1 — per-part identity for annotation/explode/swap)", () => {
  const named = (name: string): Mesh => ({ ...cube(), name });

  it("tags each shape with its source mesh name when grouped", () => {
    const shapes = meshToShapes([named("frame"), named("wheel")], { grouped: true });
    const parts = new Set(shapes.map((s) => (s as any).part));
    expect(parts.has("frame")).toBe(true);
    expect(parts.has("wheel")).toBe(true);
    expect(shapes.every((s) => (s as any).part)).toBe(true); // nothing left untagged
  });

  it("ungrouped (default) leaves shapes untagged — unchanged behaviour", () => {
    const shapes = meshToShapes([named("frame")]);
    expect(shapes.every((s) => !(s as any).part)).toBe(true);
  });

  it("grouped parts still share one coordinate frame (fit is global)", () => {
    // two boxes offset in x → fitting keeps their relative positions
    const a = named("a");
    const b: Mesh = { ...cube(), name: "b", positions: cube().positions.map((v, i) => (i % 3 === 0 ? v + 10 : v)) as any };
    const shapes = meshToShapes([a, b], { grouped: true, fit: { cx: 0, cy: 0, size: 100 } });
    const xs = (p: string) => shapes.filter((s) => (s as any).part === p).flatMap((s: any) => s.d.map((c: any) => c[1][0]));
    expect(Math.max(...xs("b"))).toBeGreaterThan(Math.max(...xs("a"))); // b sits to a's right
  });

  it("meshGroups returns per-part edges + centroid", () => {
    const groups = meshGroups([named("frame")]);
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe("frame");
    expect(groups[0].edges.length).toBe(12); // a cube's 12 feature edges
    expect(groups[0].centroid).toHaveLength(3);
    // unit cube centred at origin
    for (const c of groups[0].centroid) expect(Math.abs(c)).toBeLessThan(1e-6);
  });
});

describe("explode (L2 — separate parts along centroid vectors)", () => {
  // two unit cubes offset left (-3) and right (+3) of the origin
  const shift = (dx: number, name: string): Mesh => ({ name, indices: cube().indices, positions: cube().positions.map((v, i) => (i % 3 === 0 ? v + dx : v)) as any });
  const left = () => shift(-3, "left");
  const right = () => shift(3, "right");
  const cx = (m: Mesh) => { let s = 0, n = m.positions.length / 3; for (let j = 0; j < m.positions.length; j += 3) s += m.positions[j]; return s / n; };

  it("factor 0 leaves parts untouched", () => {
    const [l, r] = explode([left(), right()], 0);
    expect(cx(l)).toBeCloseTo(-3);
    expect(cx(r)).toBeCloseTo(3);
  });

  it("factor > 0 pushes each part outward from the assembly centre", () => {
    const [l, r] = explode([left(), right()], 1);
    expect(cx(l)).toBeLessThan(-3); // left moves further left
    expect(cx(r)).toBeGreaterThan(3); // right moves further right
  });

  it("does not mutate the input meshes", () => {
    const orig = left();
    explode([orig, right()], 1);
    expect(cx(orig)).toBeCloseTo(-3);
  });

  it("an explicit axis constrains the offset to that axis", () => {
    // parts differ only in x; exploding along Y should not move them in x
    const [l] = explode([left(), right()], 1, { axis: [0, 1, 0] });
    expect(cx(l)).toBeCloseTo(-3);
  });
});

describe("occt-import-js (STEP/IGES) adapter", () => {
  it("maps an occt result's meshes through to feature edges", () => {
    const c = cube();
    // shape of what occt-import-js ReadStepFile returns
    const occtResult = { meshes: [{ attributes: { position: { array: Array.from(c.positions) } }, index: { array: Array.from(c.indices) } }] };
    const meshes = fromOcct(occtResult);
    expect(meshes.length).toBe(1);
    expect(featureEdges(meshes[0]).length).toBe(12);
  });
});

/** Build a minimal valid GLB from a mesh; opts can corrupt fields for the
 *  untrusted-input tests. */
function buildGLB(m: Mesh, opts: { posCount?: number; componentType?: number; cyclic?: boolean } = {}): ArrayBuffer {
  const pos = m.positions, idx = m.indices;
  const bin = new Uint8Array(pos.byteLength + idx.byteLength);
  bin.set(new Uint8Array(pos.buffer), 0);
  bin.set(new Uint8Array(idx.buffer), pos.byteLength);
  const nodes: any[] = [{ mesh: 0 }];
  if (opts.cyclic) { nodes[0].children = [1]; nodes.push({ children: [0] }); } // node 0 ↔ 1 cycle
  const json = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: opts.componentType ?? 5126, count: opts.posCount ?? pos.length / 3, type: "VEC3" },
      { bufferView: 1, componentType: 5125, count: idx.length, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: idx.byteLength },
    ],
    buffers: [{ byteLength: bin.length }],
  };
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  while (jsonBytes.length % 4) jsonBytes = Uint8Array.from([...jsonBytes, 0x20]);
  let binPad = bin;
  if (binPad.length % 4) binPad = Uint8Array.from([...binPad, ...new Array(4 - (binPad.length % 4)).fill(0)]);
  const total = 12 + 8 + jsonBytes.length + 8 + binPad.length;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true); dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  const o = 20 + jsonBytes.length;
  dv.setUint32(o, binPad.length, true); dv.setUint32(o + 4, 0x004e4942, true);
  out.set(binPad, o + 8);
  return out.buffer;
}

describe("GLB parsing — untrusted input is bounds-checked", () => {
  it("round-trips a valid GLB", () => {
    const meshes = parseGLB(buildGLB(cube()));
    expect(meshes.length).toBe(1);
    expect(featureEdges(meshes[0]).length).toBe(12);
  });
  it("rejects an empty / truncated buffer", () => {
    expect(() => parseGLB(new ArrayBuffer(0))).toThrow(/truncated|GLB/);
    expect(() => parseGLB(new ArrayBuffer(8))).toThrow();
  });
  it("rejects a bad magic number", () => {
    const buf = buildGLB(cube());
    new DataView(buf).setUint32(0, 0xdeadbeef, true);
    expect(() => parseGLB(buf)).toThrow(/magic/);
  });
  it("rejects an oversized JSON chunk length", () => {
    const buf = buildGLB(cube());
    new DataView(buf).setUint32(12, 0xffffff, true); // jsonLen way past the buffer
    expect(() => parseGLB(buf)).toThrow(/JSON chunk length|exceeds/);
  });
  it("rejects an accessor whose count runs past the binary chunk (no OOB read)", () => {
    expect(() => parseGLB(buildGLB(cube(), { posCount: 9_000_000 }))).toThrow(/out of bounds|too large/);
  });
  it("rejects an unsupported accessor component type", () => {
    expect(() => parseGLB(buildGLB(cube(), { componentType: 9999 }))).toThrow(/unsupported/);
  });
  it("does not hang on a cyclic node graph", () => {
    const meshes = parseGLB(buildGLB(cube(), { cyclic: true })); // must return, not loop forever
    expect(meshes.length).toBe(1);
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
