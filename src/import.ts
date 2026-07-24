/**
 * linework/import — turn a 3D mesh (glTF/GLB or OBJ) into linework strokes.
 *
 * The pipeline:
 *   parse mesh triangles (+ node transforms)
 *   → weld vertices by position
 *   → keep only FEATURE edges (boundary + sharp creases)
 *   → emit linework `path` Shapes at their 3D coordinates.
 *
 * A shaded 3D model carries no lines — its form lives in where the
 * surface bends. Feature-edge extraction recovers exactly the lines a
 * draftsperson would draw: the outline and the hard creases, nothing
 * from the smooth interior of a face. The result drops straight into
 * render()/sketch and rotates like any other linework scene.
 *
 * Zero dependencies. GLB and OBJ are parsed by hand; no Draco.
 */
import type { Shape, V3 } from "./linework.js";

export interface Mesh {
  /** flat [x,y,z, x,y,z, …] in world space (node transforms applied) */
  positions: Float32Array;
  /** triangle vertex indices */
  indices: Uint32Array;
  name?: string;
}

/* ============================ GLB / glTF ============================ */

type Mat4 = number[]; // column-major, glTF convention

const IDENT: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function matMul(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0) as Mat4;
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function fromTRS(t?: number[], r?: number[], s?: number[]): Mat4 {
  const [tx, ty, tz] = t ?? [0, 0, 0];
  const [x, y, z, w] = r ?? [0, 0, 0, 1];
  const [sx, sy, sz] = s ?? [1, 1, 1];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function applyMat(m: Mat4, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

const COMPONENT: Record<number, { array: any; size: number }> = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};
const NUM_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Parse a .glb ArrayBuffer into world-space meshes. */
export function parseGLB(buffer: ArrayBuffer): Mesh[] {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("[import] not a GLB (bad magic)");
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLen)));
  // BIN chunk follows the JSON chunk
  let bin: Uint8Array | null = null;
  let off = 20 + jsonLen;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x004e4942) bin = new Uint8Array(buffer, off + 8, len); // "BIN\0"
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return extractMeshes(json, bin, buffer);
}

function readAccessor(json: any, bin: Uint8Array | null, buffer: ArrayBuffer, index: number): Float64Array {
  const acc = json.accessors[index];
  const bv = json.bufferViews[acc.bufferView];
  const comp = COMPONENT[acc.componentType];
  const n = NUM_COMPONENTS[acc.type];
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  if (!bin) throw new Error("[import] external buffers not supported — use a .glb");
  const src = new comp.array(bin.buffer, bin.byteOffset + base, acc.count * n);
  return Float64Array.from(src as ArrayLike<number>);
}

function extractMeshes(json: any, bin: Uint8Array | null, buffer: ArrayBuffer): Mesh[] {
  const out: Mesh[] = [];
  const scene = json.scenes?.[json.scene ?? 0];
  const roots: number[] = scene?.nodes ?? json.nodes?.map((_: any, i: number) => i) ?? [];

  const walk = (nodeIdx: number, parent: Mat4) => {
    const node = json.nodes[nodeIdx];
    const local = node.matrix ? (node.matrix as Mat4) : fromTRS(node.translation, node.rotation, node.scale);
    const world = matMul(parent, local);
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.attributes.POSITION == null) continue;
        const pos = readAccessor(json, bin, buffer, prim.attributes.POSITION);
        const world3 = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const [x, y, z] = applyMat(world, pos[i], pos[i + 1], pos[i + 2]);
          world3[i] = x; world3[i + 1] = y; world3[i + 2] = z;
        }
        let indices: Uint32Array;
        if (prim.indices != null) {
          indices = Uint32Array.from(readAccessor(json, bin, buffer, prim.indices));
        } else {
          indices = new Uint32Array(pos.length / 3);
          for (let i = 0; i < indices.length; i++) indices[i] = i;
        }
        out.push({ positions: world3, indices, name: json.meshes[node.mesh].name });
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const r of roots) walk(r, IDENT);
  return out;
}

/* ============================ OBJ ============================ */

/** Parse a Wavefront .obj string into a single mesh (triangulated). */
export function parseOBJ(text: string): Mesh[] {
  const verts: number[] = [];
  const idx: number[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("v ")) {
      const p = t.slice(2).trim().split(/\s+/).map(Number);
      verts.push(p[0], p[1], p[2]);
    } else if (t.startsWith("f ")) {
      const f = t.slice(2).trim().split(/\s+/).map((tok) => parseInt(tok.split("/")[0], 10) - 1);
      for (let i = 1; i < f.length - 1; i++) idx.push(f[0], f[i], f[i + 1]); // fan-triangulate
    }
  }
  return [{ positions: Float32Array.from(verts), indices: Uint32Array.from(idx) }];
}

/* ==================== feature-edge extraction ==================== */

export interface EdgeOptions {
  /** crease threshold in degrees; edges sharper than this are kept. Default 25. */
  angle?: number;
  /** position weld tolerance as a fraction of the model's bounding-box diagonal. Default 1e-4. */
  weld?: number;
}

function faceNormal(p: Float32Array, a: number, b: number, c: number): [number, number, number] {
  const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
  const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const m = Math.hypot(nx, ny, nz) || 1;
  return [nx / m, ny / m, nz / m];
}

/**
 * Feature edges of a mesh: every edge that is a boundary (belongs to one
 * triangle) or a sharp crease (the two triangles sharing it meet at an
 * angle greater than `angle`). Returns pairs of world-space points.
 */
export function featureEdges(mesh: Mesh, opts: EdgeOptions = {}): [V3, V3][] {
  const angle = opts.angle ?? 25;
  const p = mesh.positions, idx = mesh.indices;

  // weld vertices by quantized position so shared edges are detected
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3)
    for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const q = diag * (opts.weld ?? 1e-4);
  const keyOf = (v: number) => `${Math.round(p[v * 3] / q)},${Math.round(p[v * 3 + 1] / q)},${Math.round(p[v * 3 + 2] / q)}`;
  const weld = new Map<string, number>();
  const rep = new Uint32Array(p.length / 3);
  for (let v = 0; v < p.length / 3; v++) {
    const k = keyOf(v);
    let r = weld.get(k);
    if (r == null) { r = v; weld.set(k, v); }
    rep[v] = r;
  }

  // accumulate the (up to two) face normals per undirected welded edge
  const cos = Math.cos((angle * Math.PI) / 180);
  const edges = new Map<string, { a: number; b: number; n: [number, number, number][] }>();
  for (let t = 0; t < idx.length; t += 3) {
    const A = rep[idx[t]], B = rep[idx[t + 1]], C = rep[idx[t + 2]];
    const n = faceNormal(p, A, B, C);
    for (const [u, v] of [[A, B], [B, C], [C, A]] as [number, number][]) {
      if (u === v) continue;
      const lo = Math.min(u, v), hi = Math.max(u, v);
      const key = lo + "_" + hi;
      const e = edges.get(key);
      if (e) e.n.push(n);
      else edges.set(key, { a: lo, b: hi, n: [n] });
    }
  }

  const pt = (v: number): V3 => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
  const out: [V3, V3][] = [];
  for (const e of edges.values()) {
    const keep =
      e.n.length === 1 || // boundary
      e.n.some((n1, i) => e.n.slice(i + 1).some((n2) => n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cos));
    if (keep) out.push([pt(e.a), pt(e.b)]);
  }
  return out;
}

/* ==================== fit + emit ==================== */

export interface ImportOptions extends EdgeOptions {
  /** stroke class for the emitted edges. Default "ink". */
  cls?: string;
  /** fit the model into this screen box; returns shapes already centered/scaled. */
  fit?: { cx: number; cy: number; size: number };
  /** flip Y (glTF is Y-up; screen space is Y-down). Default true. */
  flipY?: boolean;
}

/**
 * One-call convenience: meshes → feature edges → linework Shapes, fitted
 * to a screen box. Feed the result straight to render()/sketch.
 */
export function meshToShapes(meshes: Mesh[], opts: ImportOptions = {}): Shape[] {
  const cls = opts.cls ?? "ink";
  const flipY = opts.flipY ?? true;
  const allEdges: [V3, V3][] = [];
  for (const m of meshes) allEdges.push(...featureEdges(m, opts));

  // fit transform (uniform scale about the model center → screen box)
  let map = (v: V3): V3 => v;
  if (opts.fit) {
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const [a, b] of allEdges)
      for (const v of [a, b])
        for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    const s = opts.fit.size / span;
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const sy = flipY ? -s : s;
    map = (v) => [opts.fit!.cx + (v[0] - c[0]) * s, opts.fit!.cy + (v[1] - c[1]) * sy, (v[2] - c[2]) * s];
  } else if (flipY) {
    map = (v) => [v[0], -v[1], v[2]];
  }

  return allEdges.map(([a, b]) => ({
    t: "path",
    d: [["M", map(a)], ["L", map(b)]],
    strokes: [{ cls }],
  }) as Shape);
}
