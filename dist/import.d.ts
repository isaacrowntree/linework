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
/** Parse a .glb ArrayBuffer into world-space meshes. */
export declare function parseGLB(buffer: ArrayBuffer): Mesh[];
/** Parse a Wavefront .obj string into a single mesh (triangulated). */
export declare function parseOBJ(text: string): Mesh[];
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
}
/**
 * One-call convenience: meshes → feature edges → linework Shapes, fitted
 * to a screen box. Feed the result straight to render()/sketch.
 */
export declare function meshToShapes(meshes: Mesh[], opts?: ImportOptions): Shape[];
