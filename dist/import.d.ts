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
/**
 * Parse a `.glb` ArrayBuffer into world-space meshes. **Input is treated as
 * untrusted:** every offset and length read from the file is bounds-checked
 * before use, element counts are capped, and cyclic node graphs are guarded,
 * so a malformed or malicious file throws a typed `Error` rather than reading
 * out of bounds, over-allocating, or looping forever.
 */
export declare function parseGLB(buffer: ArrayBuffer): Mesh[];
/** Parse a Wavefront .obj string into a single mesh (triangulated). */
export declare function parseOBJ(text: string): Mesh[];
/**
 * Parse a binary or ASCII `.stl` into a single mesh. Binary is detected by
 * the exact-size invariant (84 + 50·count bytes) rather than the unreliable
 * "solid" prefix, since some binary exporters write "solid" in the header.
 */
export declare function parseSTL(data: ArrayBuffer | string): Mesh[];
/**
 * Adapt a three.js `BufferGeometry` (or anything with the same shape) into a
 * linework `Mesh` — no three.js dependency, it just reads the typed arrays.
 * Bring an existing three scene's geometry straight into a technical drawing.
 */
export declare function fromBufferGeometry(geometry: {
    attributes: {
        position: {
            array: ArrayLike<number>;
        };
    };
    index?: {
        array: ArrayLike<number>;
    } | null;
}): Mesh;
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
export declare function fromOcct(result: {
    meshes: Array<{
        attributes: {
            position: {
                array: ArrayLike<number>;
            };
        };
        index?: {
            array: ArrayLike<number>;
        } | null;
    }>;
}): Mesh[];
export interface EdgeOptions {
    /** crease threshold in degrees; edges sharper than this are kept. Default 25. */
    angle?: number;
    /** position weld tolerance as a fraction of the model's bounding-box diagonal. Default 1e-4. */
    weld?: number;
}
/**
 * Feature edges of a mesh: every edge that is a boundary (belongs to one
 * triangle) or a sharp crease (the two triangles sharing it meet at an
 * angle greater than `angle`). Returns pairs of world-space points.
 */
export declare function featureEdges(mesh: Mesh, opts?: EdgeOptions): [V3, V3][];
export interface ImportOptions extends EdgeOptions {
    /** stroke class for the emitted edges. Default "ink". */
    cls?: string;
    /** fit the model into this screen box; returns shapes already centered/scaled. */
    fit?: {
        cx: number;
        cy: number;
        size: number;
    };
    /** flip Y (glTF is Y-up; screen space is Y-down). Default true. */
    flipY?: boolean;
    /** tag each emitted Shape with its source mesh `name` as `part` — so the
     *  consumer can annotate, explode, swap or depth-sort per part (L1). */
    grouped?: boolean;
    /** simplify each part's edges (merge collinear chains, drop tiny segments)
     *  before emitting — cleaner line-art from over-tessellated meshes (L4). */
    simplify?: {
        minLen?: number;
        collinearDeg?: number;
        weld?: number;
    };
    /** chain edges + round them into smooth Bézier curves (L7) — makes a faceted
     *  low-poly wheel/rim draw as a real circle instead of a polygon. `true` traces
     *  smooth curves through crossings (drivetrain); pass an object to tune. */
    smooth?: boolean | {
        throughJunctions?: number;
    };
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
export declare function meshToShapes(meshes: Mesh[], opts?: ImportOptions): Shape[];
/**
 * Build a capped cylinder mesh between two points (authoring primitive). A bike
 * frame is tubes between geometry points, so this is the unit for generating a
 * real, low-poly, own-it 3D frame that flows through the whole pipeline — the
 * tube's circular cross-section makes it read as a solid tube under rotation,
 * and L7/L8 keep the ends round. `segments` sets the tube's facet count.
 */
export declare function cylinderMesh(a: V3, b: V3, radius: number, segments?: number): Mesh;
/**
 * Vertex-cluster decimation (L9) — snap vertices to a grid and merge, so a
 * high-poly (or scanned) model collapses to a low-poly one BEFORE edge
 * extraction: fast, and it yields the clean line art of a low-poly asset from
 * any source. O(n). `grid` is the number of cells across the longest axis
 * (higher = more detail retained). Degenerate triangles are dropped.
 */
export declare function decimate(meshes: Mesh[], opts?: {
    grid?: number;
}): Mesh[];
/**
 * Auto-orient meshes to a canonical side profile (L5) via PCA: the longest
 * principal axis becomes screen-X (bike length), the next screen-Y (height), and
 * the thinnest becomes view depth Z — so an arbitrary downloaded model renders as
 * a clean side view without hand-tuning. Pure; returns new meshes.
 */
export declare function orient(meshes: Mesh[]): Mesh[];
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
export declare function meshGroups(meshes: Mesh[], opts?: EdgeOptions): MeshGroup[];
/**
 * Simplify a feature-edge set (L4): drop sub-`minLen` segments and merge chains
 * of near-collinear edges (meeting at a degree-2 vertex, directions within
 * `collinearDeg`) into single edges. Real meshes over-tessellate straight rails
 * into many segments; this recovers the clean lines a draftsperson would draw.
 * Pure. Order-independent within tolerance.
 */
export declare function simplifyEdges(edges: [V3, V3][], opts?: {
    minLen?: number;
    collinearDeg?: number;
    weld?: number;
}): [V3, V3][];
export interface Chain {
    points: V3[];
    closed: boolean;
}
/**
 * Connect an edge set into polylines/loops (L7). Walks degree-2 runs and breaks
 * at junctions (a vertex where 3+ edges meet) and endpoints — so a wheel rim
 * comes out as ONE closed loop while a frame's tubes stay separate chains. The
 * chains are what `smoothPath` rounds into real curves.
 */
export declare function chainEdges(edges: [V3, V3][], opts?: {
    weld?: number;
    throughJunctions?: number;
}): Chain[];
export interface FittedCircle {
    center: V3;
    radius: number;
    u: V3;
    v: V3;
}
/**
 * Fit a circle to a closed point loop (L8) — a wheel / chainring / rotor / cog is
 * radially symmetric, so a TRUE circle at its real centre + radius is both
 * perfectly round and more accurate than any low-poly polygon. Returns null when
 * the loop isn't a circle (too few sides, non-uniform radius, or non-planar), so
 * frame parts are never mistaken for wheels.
 */
export declare function fitCircle(points: V3[]): FittedCircle | null;
/** Resample a fitted circle into `segments` even points on it (in its plane). */
export declare function circlePoints(c: FittedCircle, segments?: number): V3[];
/**
 * Turn a chain of points into a SMOOTH path (L7) via midpoint quadratic Béziers
 * — a faceted 12-gon wheel becomes a round curve. Straight and 2-point chains
 * stay straight. Closed chains emit M…Q…Z.
 */
export declare function smoothPath(points: V3[], closed: boolean): Cmd[];
/**
 * Exploded view (L2): push each part outward from the assembly centre by
 * `factor` (0 = assembled, 1 = one part-radius out). Optionally constrain the
 * offset to an axis (e.g. explode a drivetrain along the wheel axle). Pure —
 * returns new meshes, never mutates the input. Explode BEFORE edge extraction so
 * each part's edges come out in its exploded position.
 */
export declare function explode(meshes: Mesh[], factor: number, opts?: {
    center?: V3;
    axis?: V3;
}): Mesh[];
