const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function matMul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++)
                o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
}
function fromTRS(t, r, s) {
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
function applyMat(m, x, y, z) {
    return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
    ];
}
const COMPONENT = {
    5120: { array: Int8Array, size: 1 },
    5121: { array: Uint8Array, size: 1 },
    5122: { array: Int16Array, size: 2 },
    5123: { array: Uint16Array, size: 2 },
    5125: { array: Uint32Array, size: 4 },
    5126: { array: Float32Array, size: 4 },
};
const NUM_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const GLB_MAGIC = 0x46546c67, GLB_VERSION = 2, GLB_JSON = 0x4e4f534a, GLB_BIN = 0x004e4942;
/** Hard cap on elements read from any one accessor — guards against a malicious
 *  or corrupt count triggering a giant allocation or an out-of-bounds read. */
const MAX_ACCESSOR_ELEMENTS = 64_000_000;
const fail = (msg) => { throw new Error("[import] " + msg); };
/**
 * Parse a `.glb` ArrayBuffer into world-space meshes. **Input is treated as
 * untrusted:** every offset and length read from the file is bounds-checked
 * before use, element counts are capped, and cyclic node graphs are guarded,
 * so a malformed or malicious file throws a typed `Error` rather than reading
 * out of bounds, over-allocating, or looping forever.
 */
export function parseGLB(buffer) {
    const dv = new DataView(buffer);
    if (dv.byteLength < 12)
        fail("truncated GLB (no header)");
    if (dv.getUint32(0, true) !== GLB_MAGIC)
        fail("not a GLB (bad magic)");
    if (dv.getUint32(4, true) !== GLB_VERSION)
        fail("unsupported GLB version (need 2)");
    if (dv.getUint32(8, true) > dv.byteLength)
        fail("declared length exceeds the buffer");
    if (dv.byteLength < 20)
        fail("truncated GLB (no JSON chunk)");
    const jsonLen = dv.getUint32(12, true);
    if (dv.getUint32(16, true) !== GLB_JSON)
        fail("first chunk is not JSON");
    if (20 + jsonLen > dv.byteLength)
        fail("JSON chunk length exceeds the buffer");
    let json;
    try {
        json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLen)));
    }
    catch {
        return fail("invalid glTF JSON");
    }
    // BIN chunk follows the JSON chunk
    let bin = null;
    let off = 20 + jsonLen;
    while (off + 8 <= dv.byteLength) {
        const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
        if (off + 8 + len > dv.byteLength)
            fail("chunk length exceeds the buffer");
        if (type === GLB_BIN)
            bin = new Uint8Array(buffer, off + 8, len);
        off += 8 + len + ((4 - (len % 4)) % 4);
    }
    return extractMeshes(json, bin);
}
function readAccessor(json, bin, index) {
    const acc = json.accessors?.[index];
    if (!acc)
        return fail(`accessor ${index} not found`);
    const bv = json.bufferViews?.[acc.bufferView];
    if (!bv)
        return fail(`bufferView ${acc.bufferView} not found`);
    const comp = COMPONENT[acc.componentType];
    const n = NUM_COMPONENTS[acc.type];
    if (!comp || !n)
        return fail(`unsupported accessor type (${acc.type} / ${acc.componentType})`);
    const count = acc.count >>> 0;
    if (count * n > MAX_ACCESSOR_ELEMENTS)
        return fail("accessor too large");
    if (!bin)
        return fail("external buffers not supported — use a .glb");
    const base = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    if (base < 0 || base + count * n * comp.size > bin.byteLength)
        return fail("accessor range is out of bounds");
    const src = new comp.array(bin.buffer, bin.byteOffset + base, count * n);
    return Float64Array.from(src);
}
function extractMeshes(json, bin) {
    const out = [];
    const scene = json.scenes?.[json.scene ?? 0];
    const roots = scene?.nodes ?? json.nodes?.map((_, i) => i) ?? [];
    const seen = new Set();
    const walk = (nodeIdx, parent) => {
        if (seen.has(nodeIdx))
            return; // guard against cyclic node graphs
        seen.add(nodeIdx);
        const node = json.nodes?.[nodeIdx];
        if (!node)
            return;
        const local = node.matrix ? node.matrix : fromTRS(node.translation, node.rotation, node.scale);
        const world = matMul(parent, local);
        if (node.mesh != null) {
            const mesh = json.meshes?.[node.mesh];
            for (const prim of mesh?.primitives ?? []) {
                if (prim.attributes.POSITION == null)
                    continue;
                const pos = readAccessor(json, bin, prim.attributes.POSITION);
                const world3 = new Float32Array(pos.length);
                for (let i = 0; i < pos.length; i += 3) {
                    const [x, y, z] = applyMat(world, pos[i], pos[i + 1], pos[i + 2]);
                    world3[i] = x;
                    world3[i + 1] = y;
                    world3[i + 2] = z;
                }
                let indices;
                if (prim.indices != null) {
                    indices = Uint32Array.from(readAccessor(json, bin, prim.indices));
                }
                else {
                    indices = new Uint32Array(pos.length / 3);
                    for (let i = 0; i < indices.length; i++)
                        indices[i] = i;
                }
                out.push({ positions: world3, indices, name: mesh?.name });
            }
        }
        for (const child of node.children ?? [])
            walk(child, world);
    };
    for (const r of roots)
        walk(r, IDENT);
    return out;
}
/* ============================ OBJ ============================ */
/** Parse a Wavefront .obj string into a single mesh (triangulated). */
export function parseOBJ(text) {
    const verts = [];
    const idx = [];
    for (const line of text.split("\n")) {
        const t = line.trim();
        if (t.startsWith("v ")) {
            const p = t.slice(2).trim().split(/\s+/).map(Number);
            verts.push(p[0], p[1], p[2]);
        }
        else if (t.startsWith("f ")) {
            const f = t.slice(2).trim().split(/\s+/).map((tok) => parseInt(tok.split("/")[0], 10) - 1);
            for (let i = 1; i < f.length - 1; i++)
                idx.push(f[0], f[i], f[i + 1]); // fan-triangulate
        }
    }
    return [{ positions: Float32Array.from(verts), indices: Uint32Array.from(idx) }];
}
/* ============================ STL ============================ */
/** Build an unindexed mesh from flat triangle-soup positions (STL has no
 *  shared indices; featureEdges welds by position to recover topology). */
function meshFromSoup(positions) {
    const indices = new Uint32Array(positions.length / 3);
    for (let i = 0; i < indices.length; i++)
        indices[i] = i;
    return { positions, indices };
}
function parseAsciiSTL(text) {
    const verts = [];
    const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
    let m;
    while ((m = re.exec(text)))
        verts.push(+m[1], +m[2], +m[3]);
    return [meshFromSoup(Float32Array.from(verts))];
}
/**
 * Parse a binary or ASCII `.stl` into a single mesh. Binary is detected by
 * the exact-size invariant (84 + 50·count bytes) rather than the unreliable
 * "solid" prefix, since some binary exporters write "solid" in the header.
 */
export function parseSTL(data) {
    if (typeof data === "string")
        return parseAsciiSTL(data);
    const dv = new DataView(data);
    const count = dv.byteLength >= 84 ? dv.getUint32(80, true) : 0;
    const isBinary = dv.byteLength === 84 + count * 50;
    if (!isBinary) {
        const text = new TextDecoder().decode(new Uint8Array(data));
        if (/^\s*solid/.test(text) && text.includes("vertex"))
            return parseAsciiSTL(text);
        throw new Error("[import] not a recognisable STL (bad size and no ASCII facets)");
    }
    const positions = new Float32Array(count * 9);
    for (let i = 0; i < count; i++) {
        const o = 84 + i * 50 + 12; // skip the 12-byte per-face normal
        for (let v = 0; v < 9; v++)
            positions[i * 9 + v] = dv.getFloat32(o + v * 4, true);
    }
    return [meshFromSoup(positions)];
}
/* ==================== three.js adapter ==================== */
/**
 * Adapt a three.js `BufferGeometry` (or anything with the same shape) into a
 * linework `Mesh` — no three.js dependency, it just reads the typed arrays.
 * Bring an existing three scene's geometry straight into a technical drawing.
 */
export function fromBufferGeometry(geometry) {
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
export function fromOcct(result) {
    return result.meshes.map(fromBufferGeometry);
}
function faceNormal(p, a, b, c) {
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
export function featureEdges(mesh, opts = {}) {
    const angle = opts.angle ?? 25;
    const p = mesh.positions, idx = mesh.indices;
    // weld vertices by quantized position so shared edges are detected
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3)
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], p[i + k]);
            max[k] = Math.max(max[k], p[i + k]);
        }
    const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
    const q = diag * (opts.weld ?? 1e-4);
    const keyOf = (v) => `${Math.round(p[v * 3] / q)},${Math.round(p[v * 3 + 1] / q)},${Math.round(p[v * 3 + 2] / q)}`;
    const weld = new Map();
    const rep = new Uint32Array(p.length / 3);
    for (let v = 0; v < p.length / 3; v++) {
        const k = keyOf(v);
        let r = weld.get(k);
        if (r == null) {
            r = v;
            weld.set(k, v);
        }
        rep[v] = r;
    }
    // accumulate the (up to two) face normals per undirected welded edge
    const cos = Math.cos((angle * Math.PI) / 180);
    const edges = new Map();
    for (let t = 0; t < idx.length; t += 3) {
        const A = rep[idx[t]], B = rep[idx[t + 1]], C = rep[idx[t + 2]];
        const n = faceNormal(p, A, B, C);
        for (const [u, v] of [[A, B], [B, C], [C, A]]) {
            if (u === v)
                continue;
            const lo = Math.min(u, v), hi = Math.max(u, v);
            const key = lo + "_" + hi;
            const e = edges.get(key);
            if (e)
                e.n.push(n);
            else
                edges.set(key, { a: lo, b: hi, n: [n] });
        }
    }
    const pt = (v) => [p[v * 3], p[v * 3 + 1], p[v * 3 + 2]];
    const out = [];
    for (const e of edges.values()) {
        const keep = e.n.length === 1 || // boundary
            e.n.some((n1, i) => e.n.slice(i + 1).some((n2) => n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cos));
        if (keep)
            out.push([pt(e.a), pt(e.b)]);
    }
    return out;
}
/**
 * One-call convenience: meshes → feature edges → linework Shapes, fitted
 * to a screen box. Feed the result straight to render()/sketch.
 */
export function meshToShapes(meshes, opts = {}) {
    const cls = opts.cls ?? "ink";
    const flipY = opts.flipY ?? true;
    const allEdges = [];
    for (const m of meshes)
        allEdges.push(...featureEdges(m, opts));
    // fit transform (uniform scale about the model center → screen box)
    let map = (v) => v;
    if (opts.fit) {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const [a, b] of allEdges)
            for (const v of [a, b])
                for (let k = 0; k < 3; k++) {
                    min[k] = Math.min(min[k], v[k]);
                    max[k] = Math.max(max[k], v[k]);
                }
        const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
        const s = opts.fit.size / span;
        const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
        const sy = flipY ? -s : s;
        map = (v) => [opts.fit.cx + (v[0] - c[0]) * s, opts.fit.cy + (v[1] - c[1]) * sy, (v[2] - c[2]) * s];
    }
    else if (flipY) {
        map = (v) => [v[0], -v[1], v[2]];
    }
    return allEdges.map(([a, b]) => ({
        t: "path",
        d: [["M", map(a)], ["L", map(b)]],
        strokes: [{ cls }],
    }));
}
//# sourceMappingURL=import.js.map