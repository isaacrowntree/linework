/**
 * linework/import — turn a 3D mesh (glTF/GLB, OBJ, STL, or a three.js
 * BufferGeometry) into linework strokes.
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
 * Zero dependencies. GLB, OBJ and STL are parsed by hand; no Draco.
 */
import type { Shape, V3, Cmd } from "./linework.js";

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

interface TypedArrayCtor {
  new (buffer: ArrayBufferLike, byteOffset: number, length: number): ArrayLike<number>;
  BYTES_PER_ELEMENT: number;
}
const COMPONENT: Record<number, { array: TypedArrayCtor; size: number }> = {
  5120: { array: Int8Array, size: 1 },
  5121: { array: Uint8Array, size: 1 },
  5122: { array: Int16Array, size: 2 },
  5123: { array: Uint16Array, size: 2 },
  5125: { array: Uint32Array, size: 4 },
  5126: { array: Float32Array, size: 4 },
};
const NUM_COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const GLB_MAGIC = 0x46546c67, GLB_VERSION = 2, GLB_JSON = 0x4e4f534a, GLB_BIN = 0x004e4942;
/** Hard cap on elements read from any one accessor — guards against a malicious
 *  or corrupt count triggering a giant allocation or an out-of-bounds read. */
const MAX_ACCESSOR_ELEMENTS = 64_000_000;

/** `glTF` JSON is untrusted; type it loosely but bounds-check every value. */
type GltfJson = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { mesh?: number; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[]; children?: number[] }[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; indices?: number }[] }[];
  accessors?: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength?: number }[];
};

const fail = (msg: string): never => { throw new Error("[import] " + msg); };

/**
 * Parse a `.glb` ArrayBuffer into world-space meshes. **Input is treated as
 * untrusted:** every offset and length read from the file is bounds-checked
 * before use, element counts are capped, and cyclic node graphs are guarded,
 * so a malformed or malicious file throws a typed `Error` rather than reading
 * out of bounds, over-allocating, or looping forever.
 */
export function parseGLB(buffer: ArrayBuffer): Mesh[] {
  const dv = new DataView(buffer);
  if (dv.byteLength < 12) fail("truncated GLB (no header)");
  if (dv.getUint32(0, true) !== GLB_MAGIC) fail("not a GLB (bad magic)");
  if (dv.getUint32(4, true) !== GLB_VERSION) fail("unsupported GLB version (need 2)");
  if (dv.getUint32(8, true) > dv.byteLength) fail("declared length exceeds the buffer");
  if (dv.byteLength < 20) fail("truncated GLB (no JSON chunk)");
  const jsonLen = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== GLB_JSON) fail("first chunk is not JSON");
  if (20 + jsonLen > dv.byteLength) fail("JSON chunk length exceeds the buffer");
  let json: GltfJson;
  try { json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLen))); }
  catch { return fail("invalid glTF JSON"); }
  // BIN chunk follows the JSON chunk
  let bin: Uint8Array | null = null;
  let off = 20 + jsonLen;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (off + 8 + len > dv.byteLength) fail("chunk length exceeds the buffer");
    if (type === GLB_BIN) bin = new Uint8Array(buffer, off + 8, len);
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  return extractMeshes(json, bin);
}

function readAccessor(json: GltfJson, bin: Uint8Array | null, index: number): Float64Array {
  const acc = json.accessors?.[index];
  if (!acc) return fail(`accessor ${index} not found`);
  const bv = json.bufferViews?.[acc.bufferView];
  if (!bv) return fail(`bufferView ${acc.bufferView} not found`);
  const comp = COMPONENT[acc.componentType];
  const n = NUM_COMPONENTS[acc.type];
  if (!comp || !n) return fail(`unsupported accessor type (${acc.type} / ${acc.componentType})`);
  const count = acc.count >>> 0;
  if (count * n > MAX_ACCESSOR_ELEMENTS) return fail("accessor too large");
  if (!bin) return fail("external buffers not supported — use a .glb");
  const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  if (base < 0 || base + count * n * comp.size > bin.byteLength) return fail("accessor range is out of bounds");
  const src = new comp.array(bin.buffer, bin.byteOffset + base, count * n);
  return Float64Array.from(src);
}

function extractMeshes(json: GltfJson, bin: Uint8Array | null): Mesh[] {
  const out: Mesh[] = [];
  const scene = json.scenes?.[json.scene ?? 0];
  const roots: number[] = scene?.nodes ?? json.nodes?.map((_, i) => i) ?? [];
  const seen = new Set<number>();

  const walk = (nodeIdx: number, parent: Mat4) => {
    if (seen.has(nodeIdx)) return; // guard against cyclic node graphs
    seen.add(nodeIdx);
    const node = json.nodes?.[nodeIdx];
    if (!node) return;
    const local = node.matrix ? (node.matrix as Mat4) : fromTRS(node.translation, node.rotation, node.scale);
    const world = matMul(parent, local);
    if (node.mesh != null) {
      const mesh = json.meshes?.[node.mesh];
      for (const prim of mesh?.primitives ?? []) {
        if (prim.attributes.POSITION == null) continue;
        const pos = readAccessor(json, bin, prim.attributes.POSITION);
        const world3 = new Float32Array(pos.length);
        for (let i = 0; i < pos.length; i += 3) {
          const [x, y, z] = applyMat(world, pos[i], pos[i + 1], pos[i + 2]);
          world3[i] = x; world3[i + 1] = y; world3[i + 2] = z;
        }
        let indices: Uint32Array;
        if (prim.indices != null) {
          indices = Uint32Array.from(readAccessor(json, bin, prim.indices));
        } else {
          indices = new Uint32Array(pos.length / 3);
          for (let i = 0; i < indices.length; i++) indices[i] = i;
        }
        out.push({ positions: world3, indices, name: mesh?.name });
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

/* ============================ STL ============================ */

/** Build an unindexed mesh from flat triangle-soup positions (STL has no
 *  shared indices; featureEdges welds by position to recover topology). */
function meshFromSoup(positions: Float32Array): Mesh {
  const indices = new Uint32Array(positions.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  return { positions, indices };
}

function parseAsciiSTL(text: string): Mesh[] {
  const verts: number[] = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) verts.push(+m[1], +m[2], +m[3]);
  return [meshFromSoup(Float32Array.from(verts))];
}

/**
 * Parse a binary or ASCII `.stl` into a single mesh. Binary is detected by
 * the exact-size invariant (84 + 50·count bytes) rather than the unreliable
 * "solid" prefix, since some binary exporters write "solid" in the header.
 */
export function parseSTL(data: ArrayBuffer | string): Mesh[] {
  if (typeof data === "string") return parseAsciiSTL(data);
  const dv = new DataView(data);
  const count = dv.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  const isBinary = dv.byteLength === 84 + count * 50;
  if (!isBinary) {
    const text = new TextDecoder().decode(new Uint8Array(data));
    if (/^\s*solid/.test(text) && text.includes("vertex")) return parseAsciiSTL(text);
    throw new Error("[import] not a recognisable STL (bad size and no ASCII facets)");
  }
  const positions = new Float32Array(count * 9);
  for (let i = 0; i < count; i++) {
    const o = 84 + i * 50 + 12; // skip the 12-byte per-face normal
    for (let v = 0; v < 9; v++) positions[i * 9 + v] = dv.getFloat32(o + v * 4, true);
  }
  return [meshFromSoup(positions)];
}

/* ==================== three.js adapter ==================== */

/**
 * Adapt a three.js `BufferGeometry` (or anything with the same shape) into a
 * linework `Mesh` — no three.js dependency, it just reads the typed arrays.
 * Bring an existing three scene's geometry straight into a technical drawing.
 */
export function fromBufferGeometry(geometry: {
  attributes: { position: { array: ArrayLike<number> } };
  index?: { array: ArrayLike<number> } | null;
}): Mesh {
  const src = geometry.attributes.position.array;
  const positions = src instanceof Float32Array ? src : Float32Array.from(src);
  const indices = geometry.index
    ? Uint32Array.from(geometry.index.array)
    : meshFromSoup(positions).indices;
  return { positions, indices };
}

/**
 * Adapt the result of [occt-import-js](https://github.com/kovacsv/occt-import-js)
 * — OpenCASCADE compiled to WASM — which is the practical way to get geometry
 * out of a **STEP / IGES / BREP** CAD file. You bring the kernel (it's ~6 MB,
 * so it stays an optional peer, not a linework dependency); each mesh it
 * returns already matches a BufferGeometry, so this just maps and merges them.
 *
 *   const occt = await occtimportjs();
 *   const result = occt.ReadStepFile(new Uint8Array(buf), null);
 *   const shapes = meshToShapes(fromOcct(result), { fit });
 */
export function fromOcct(result: {
  meshes: Array<{
    attributes: { position: { array: ArrayLike<number> } };
    index?: { array: ArrayLike<number> } | null;
  }>;
}): Mesh[] {
  return result.meshes.map(fromBufferGeometry);
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
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
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
  /** tag each emitted Shape with its source mesh `name` as `part` — so the
   *  consumer can annotate, explode, swap or depth-sort per part (L1). */
  grouped?: boolean;
  /** simplify each part's edges (merge collinear chains, drop tiny segments)
   *  before emitting — cleaner line-art from over-tessellated meshes (L4). */
  simplify?: { minLen?: number; collinearDeg?: number; weld?: number };
  /** chain edges + round them into smooth Bézier curves (L7) — makes a faceted
   *  low-poly wheel/rim draw as a real circle instead of a polygon. `true` traces
   *  smooth curves through crossings (drivetrain); pass an object to tune. */
  smooth?: boolean | { throughJunctions?: number };
}

/**
 * One-call convenience: meshes → feature edges → linework Shapes, fitted
 * to a screen box. Feed the result straight to render()/sketch.
 *
 * With `grouped: true`, each shape carries `part` = its source mesh name, so a
 * multi-mesh model (a bike: frame / wheels / drivetrain) keeps per-part identity
 * for annotation, exploded views, and per-object depth sorting. Parts share one
 * global fit transform, so their relative positions are preserved.
 */
export function meshToShapes(meshes: Mesh[], opts: ImportOptions = {}): Shape[] {
  const cls = opts.cls ?? "ink";
  const flipY = opts.flipY ?? true;
  const edges: { e: [V3, V3]; part?: string }[] = []; // straight-line path (default)
  const chains: (Chain & { part?: string })[] = []; // smoothed path (opts.smooth)
  for (const m of meshes) {
    const part = opts.grouped ? m.name : undefined;
    let es = featureEdges(m, opts);
    if (opts.simplify) es = simplifyEdges(es, opts.simplify); // per-part: never merge across parts
    if (opts.smooth) {
      const tj = typeof opts.smooth === "object" ? opts.smooth.throughJunctions ?? 30 : 30;
      for (const ch of chainEdges(es, { throughJunctions: tj })) chains.push({ ...ch, part });
    } else for (const e of es) edges.push({ e, part });
  }

  // fit transform (uniform scale about the model center → screen box), global
  const pts: V3[] = opts.smooth ? chains.flatMap((c) => c.points) : edges.flatMap((r) => r.e);
  let map = (v: V3): V3 => v;
  if (opts.fit) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const v of pts)
      for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    const s = opts.fit.size / span;
    const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const sy = flipY ? -s : s;
    map = (v) => [opts.fit!.cx + (v[0] - c[0]) * s, opts.fit!.cy + (v[1] - c[1]) * sy, (v[2] - c[2]) * s];
  } else if (flipY) {
    map = (v) => [v[0], -v[1], v[2]];
  }

  if (opts.smooth) {
    return chains.map((c) => {
      const sh: any = { t: "path", d: smoothPath(c.points.map(map), c.closed), strokes: [{ cls }] };
      if (c.part) sh.part = c.part;
      return sh as Shape;
    });
  }
  return edges.map(({ e: [a, b], part }) => {
    const sh: any = { t: "path", d: [["M", map(a)], ["L", map(b)]], strokes: [{ cls }] };
    if (part) sh.part = part;
    return sh as Shape;
  });
}

/** Mean vertex of a mesh — the part's centroid. */
function centroid(m: Mesh): V3 {
  const p = m.positions, n = p.length / 3 || 1;
  let cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < p.length; j += 3) { cx += p[j]; cy += p[j + 1]; cz += p[j + 2]; }
  return [cx / n, cy / n, cz / n];
}

export interface MeshGroup {
  name: string;
  /** this part's feature edges, in model coordinates (unfitted) */
  edges: [V3, V3][];
  /** part centroid (mean vertex), for explode offsets + callout anchors */
  centroid: V3;
}

/**
 * Per-part geometry for annotation/explode: each mesh's feature edges plus its
 * centroid (mean vertex). Unnamed meshes get a positional fallback name.
 */
export function meshGroups(meshes: Mesh[], opts: EdgeOptions = {}): MeshGroup[] {
  return meshes.map((m, i) => ({
    name: m.name ?? `part-${i}`,
    edges: featureEdges(m, opts),
    centroid: centroid(m),
  }));
}

/**
 * Simplify a feature-edge set (L4): drop sub-`minLen` segments and merge chains
 * of near-collinear edges (meeting at a degree-2 vertex, directions within
 * `collinearDeg`) into single edges. Real meshes over-tessellate straight rails
 * into many segments; this recovers the clean lines a draftsperson would draw.
 * Pure. Order-independent within tolerance.
 */
export function simplifyEdges(edges: [V3, V3][], opts: { minLen?: number; collinearDeg?: number; weld?: number } = {}): [V3, V3][] {
  const minLen = opts.minLen ?? 0;
  const cosT = Math.cos((opts.collinearDeg ?? 5) * Math.PI / 180);
  const q = opts.weld ?? 1e-4;
  const key = (v: V3) => `${Math.round(v[0] / q)},${Math.round(v[1] / q)},${Math.round(v[2] / q)}`;
  const len = (a: V3, b: V3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const unit = (a: V3, b: V3): V3 => { const d = len(a, b) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d]; };

  let list: [V3, V3][] = edges.filter(([a, b]) => len(a, b) > 1e-9).map(([a, b]) => [[...a], [...b]] as [V3, V3]);

  let changed = true;
  while (changed) {
    changed = false;
    const inc = new Map<string, number[]>();
    list.forEach((e, i) => { for (const v of e) { const k = key(v); (inc.get(k) ?? inc.set(k, []).get(k)!).push(i); } });
    for (const [, idxs] of inc) {
      const uniq = [...new Set(idxs)];
      if (uniq.length !== 2) continue; // only merge at a clean degree-2 joint
      const [i, j] = uniq;
      const ei = list[i], ej = list[j];
      // the shared vertex sv; the two far ends
      const sameKey = (a: V3, b: V3) => key(a) === key(b);
      const svi = sameKey(ei[0], ej[0]) || sameKey(ei[0], ej[1]) ? ei[0] : ei[1];
      const fi: V3 = sameKey(ei[0], svi) ? ei[1] : ei[0];
      const fj: V3 = sameKey(ej[0], svi) ? ej[1] : ej[0];
      // collinear straight-through: directions sv→fi and sv→fj point opposite
      const di = unit(svi, fi), dj = unit(svi, fj);
      const dot = di[0] * dj[0] + di[1] * dj[1] + di[2] * dj[2];
      if (dot > -cosT) continue; // not a straight pass-through
      // merge: replace both with one edge fi→fj
      list = list.filter((_, k) => k !== i && k !== j);
      list.push([fi, fj]);
      changed = true;
      break;
    }
  }
  return list.filter(([a, b]) => len(a, b) >= minLen);
}

export interface Chain { points: V3[]; closed: boolean }

/**
 * Connect an edge set into polylines/loops (L7). Walks degree-2 runs and breaks
 * at junctions (a vertex where 3+ edges meet) and endpoints — so a wheel rim
 * comes out as ONE closed loop while a frame's tubes stay separate chains. The
 * chains are what `smoothPath` rounds into real curves.
 */
export function chainEdges(edges: [V3, V3][], opts: { weld?: number; throughJunctions?: number } = {}): Chain[] {
  const q = opts.weld ?? 1e-4;
  const key = (v: V3) => `${Math.round(v[0] / q)},${Math.round(v[1] / q)},${Math.round(v[2] / q)}`;
  const nodes = new Map<string, { pt: V3; nbrs: Set<string> }>();
  const get = (v: V3): [string, { pt: V3; nbrs: Set<string> }] => {
    const k = key(v); let n = nodes.get(k);
    if (!n) { n = { pt: v, nbrs: new Set() }; nodes.set(k, n); }
    return [k, n];
  };
  for (const [a, b] of edges) {
    const [ka, na] = get(a), [kb, nb] = get(b);
    if (ka === kb) continue;
    na.nbrs.add(kb); nb.nbrs.add(ka);
  }
  const ekey = (a: string, b: string) => (a < b ? a + "|" + b : b + "|" + a);
  const unit = (a: V3, b: V3): V3 => { const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]; };
  const cosMax = opts.throughJunctions !== undefined ? Math.cos(opts.throughJunctions * Math.PI / 180) : null;
  const used = new Set<string>();
  const chains: Chain[] = [];

  const startFrom = (k0: string) => {
    const n0 = nodes.get(k0)!;
    for (const first of [...n0.nbrs]) {
      if (used.has(ekey(k0, first))) continue;
      used.add(ekey(k0, first));
      const points = [n0.pt, nodes.get(first)!.pt];
      let prev = k0, cur = first, closed = false;
      for (;;) {
        const node = nodes.get(cur)!;
        const cand = [...node.nbrs].filter((x) => !used.has(ekey(cur, x)));
        let next: string | undefined;
        if (cosMax !== null) {
          // continue along the straightest available edge, if within the turn limit
          const inDir = unit(nodes.get(prev)!.pt, node.pt);
          let bestDot = -2;
          for (const x of cand) {
            const d = unit(node.pt, nodes.get(x)!.pt);
            const dot = inDir[0] * d[0] + inDir[1] * d[1] + inDir[2] * d[2];
            if (dot > bestDot) { bestDot = dot; next = x; }
          }
          if (next === undefined || bestDot < cosMax) break;
        } else {
          if (node.nbrs.size !== 2) break; // strict: stop at any junction
          next = cand.find((x) => x !== prev);
          if (next === undefined) break;
        }
        if (next === k0) { used.add(ekey(cur, next)); closed = true; break; }
        used.add(ekey(cur, next));
        points.push(nodes.get(next)!.pt);
        prev = cur; cur = next;
      }
      chains.push({ points, closed });
    }
  };

  // endpoints first, then junctions, then pure loops — so a line flows through a
  // crossing (started from its end) before the crossing spawns stubs.
  const byDeg = (pred: (n: number) => boolean) => { for (const k of nodes.keys()) if (pred(nodes.get(k)!.nbrs.size)) startFrom(k); };
  byDeg((n) => n === 1);
  byDeg((n) => n >= 3);
  byDeg((n) => n === 2);
  return chains;
}

const mid3 = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Turn a chain of points into a SMOOTH path (L7) via midpoint quadratic Béziers
 * — a faceted 12-gon wheel becomes a round curve. Straight and 2-point chains
 * stay straight. Closed chains emit M…Q…Z.
 */
export function smoothPath(points: V3[], closed: boolean): Cmd[] {
  const P = points, n = P.length;
  if (n < 3) return n === 2 ? [["M", P[0]], ["L", P[1]]] : [["M", P[0]]];
  const cmds: Cmd[] = [];
  if (closed) {
    cmds.push(["M", mid3(P[n - 1], P[0])]);
    for (let i = 0; i < n; i++) cmds.push(["Q", P[i], mid3(P[i], P[(i + 1) % n])]);
    cmds.push(["Z"]);
  } else {
    cmds.push(["M", P[0]], ["L", mid3(P[0], P[1])]);
    for (let i = 1; i < n - 1; i++) cmds.push(["Q", P[i], mid3(P[i], P[i + 1])]);
    cmds.push(["L", P[n - 1]]);
  }
  return cmds;
}

/**
 * Exploded view (L2): push each part outward from the assembly centre by
 * `factor` (0 = assembled, 1 = one part-radius out). Optionally constrain the
 * offset to an axis (e.g. explode a drivetrain along the wheel axle). Pure —
 * returns new meshes, never mutates the input. Explode BEFORE edge extraction so
 * each part's edges come out in its exploded position.
 */
export function explode(meshes: Mesh[], factor: number, opts: { center?: V3; axis?: V3 } = {}): Mesh[] {
  const cents = meshes.map(centroid);
  const center = opts.center ?? [
    cents.reduce((s, c) => s + c[0], 0) / (cents.length || 1),
    cents.reduce((s, c) => s + c[1], 0) / (cents.length || 1),
    cents.reduce((s, c) => s + c[2], 0) / (cents.length || 1),
  ];
  let axis: V3 | null = null;
  if (opts.axis) {
    const [x, y, z] = opts.axis;
    const len = Math.hypot(x, y, z) || 1;
    axis = [x / len, y / len, z / len];
  }
  return meshes.map((m, i) => {
    let dir: V3 = [cents[i][0] - center[0], cents[i][1] - center[1], cents[i][2] - center[2]];
    if (axis) {
      const d = dir[0] * axis[0] + dir[1] * axis[1] + dir[2] * axis[2];
      dir = [axis[0] * d, axis[1] * d, axis[2] * d];
    }
    const ox = dir[0] * factor, oy = dir[1] * factor, oz = dir[2] * factor;
    const positions = new Float32Array(m.positions.length);
    for (let j = 0; j < m.positions.length; j += 3) {
      positions[j] = m.positions[j] + ox;
      positions[j + 1] = m.positions[j + 1] + oy;
      positions[j + 2] = m.positions[j + 2] + oz;
    }
    return { ...m, positions };
  });
}
