/**
 * helpers — the ergonomic layer over raw Shapes, extracted from real use
 * (the Fitment bike planner drew its entire scene through these).
 *
 * Everything returns Shape[] fragments you concat into one scene, or
 * pushes into the array you hand it. Class names are yours: the library
 * never dictates styling.
 */
import type { Shape, Stroke, V3, Cmd } from "./linework.js";
export type P2 = [number, number];
export declare const v3: (p: P2, z?: number) => V3;
export declare const lerp2: (a: P2, b: P2, t: number) => P2;
export interface Opt {
    bias?: number;
    tag?: string;
    part?: string;
    fill?: string;
}
/** straight segment between two 3D points */
export declare const line3: (a: P2, za: number, b: P2, zb: number, cls: string, opt?: Opt) => Shape;
/** arbitrary path from Cmd list */
export declare const path3: (d: Cmd[], strokes: Stroke[], opt?: Opt) => Shape;
/** hollow-tube outline: fat outer stroke + panel-colored core, one shape */
export declare const tube: (d: Cmd[], w: number, outerCls?: string, innerCls?: string, opt?: Opt) => Shape;
/** circle lying in a constant-z plane (wheels, rings) — projects to a correct ellipse */
export declare const disc: (p: P2, z: number, r: number, strokes: Stroke[], opt?: Opt) => Shape;
/** circle facing along z (cylinder caps) — stylized: stays round and readable */
export declare const faceCap: (p: P2, z: number, r: number, strokes: Stroke[], opt?: Opt) => Shape;
/**
 * A six-faced box: face plate at z, body extruded away from the viewer
 * (z − dz). Outward windings + backface culling keep it contiguous at
 * any yaw/pitch. Classes: face plate `faceCls`, top/bottom `topCls`,
 * left/right `sideCls`.
 */
export declare function box3(x: number, y: number, w: number, h: number, z: number, dz: number, faceCls?: string, topCls?: string, sideCls?: string, opt?: Opt): Shape[];
/**
 * A stylized cylinder along the z axis: back cap, silhouette rails that
 * hug the PROJECTED axis (correct at any view), front cap. Needs the
 * current view's transform to place the rails; pass `xform(view)`.
 */
export declare function cyl3(X: (p: V3) => {
    x: number;
    y: number;
}, p: P2, r: number, zNear: number, zFar: number, capCls?: string, opt?: Opt): Shape[];
