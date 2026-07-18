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
export const v3 = (p: P2, z = 0): V3 => [p[0], p[1], z];
export const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export interface Opt {
  bias?: number;
  tag?: string;
  part?: string;
  fill?: string;
}

/** straight segment between two 3D points */
export const line3 = (a: P2, za: number, b: P2, zb: number, cls: string, opt: Opt = {}): Shape => ({
  t: "path", d: [["M", v3(a, za)], ["L", v3(b, zb)]], strokes: [{ cls }], ...opt,
});

/** arbitrary path from Cmd list */
export const path3 = (d: Cmd[], strokes: Stroke[], opt: Opt = {}): Shape => ({
  t: "path", d, strokes, ...opt,
});

/** hollow-tube outline: fat outer stroke + panel-colored core, one shape */
export const tube = (d: Cmd[], w: number, outerCls = "tube", innerCls = "tube-in", opt: Opt = {}): Shape => ({
  t: "path", d, strokes: [{ cls: outerCls, w }, { cls: innerCls, w: Math.max(1.5, w - 5) }], ...opt,
});

/** circle lying in a constant-z plane (wheels, rings) — projects to a correct ellipse */
export const disc = (p: P2, z: number, r: number, strokes: Stroke[], opt: Opt = {}): Shape => ({
  t: "disc", c: v3(p, z), r, strokes, ...opt,
});

/** circle facing along z (cylinder caps) — stylized: stays round and readable */
export const faceCap = (p: P2, z: number, r: number, strokes: Stroke[], opt: Opt = {}): Shape => ({
  t: "face", c: v3(p, z), r, strokes, ...opt,
});

/**
 * A six-faced box: face plate at z, body extruded away from the viewer
 * (z − dz). Outward windings + backface culling keep it contiguous at
 * any yaw/pitch. Classes: face plate `faceCls`, top/bottom `topCls`,
 * left/right `sideCls`.
 */
export function box3(
  x: number, y: number, w: number, h: number, z: number, dz: number,
  faceCls = "face3", topCls = "top3", sideCls = "side3", opt: Opt = {},
): Shape[] {
  const zB = z - dz;
  const A: V3 = [x, y, z], B: V3 = [x + w, y, z], C: V3 = [x + w, y + h, z], D: V3 = [x, y + h, z];
  const A2: V3 = [x, y, zB], B2: V3 = [x + w, y, zB], C2: V3 = [x + w, y + h, zB], D2: V3 = [x, y + h, zB];
  const b0 = opt.bias ?? 0;
  const q = (qq: [V3, V3, V3, V3], cls: string, bias: number): Shape => ({ t: "quad", q: qq, cls, cull: true, ...opt, bias });
  return [
    q([A, A2, B2, B], topCls, b0),
    q([D, C, C2, D2], topCls, b0),
    q([A, A2, D2, D], sideCls, b0),
    q([B, C, C2, B2], sideCls, b0),
    q([A2, D2, C2, B2], faceCls, b0 + 0.1),
    q([A, B, C, D], faceCls, b0 + 0.2),
  ];
}

/**
 * A stylized cylinder along the z axis: back cap, silhouette rails that
 * hug the PROJECTED axis (correct at any view), front cap. Needs the
 * current view's transform to place the rails; pass `xform(view)`.
 */
export function cyl3(
  X: (p: V3) => { x: number; y: number },
  p: P2, r: number, zNear: number, zFar: number,
  capCls = "cap3", opt: Opt = {},
): Shape[] {
  const n = X(v3(p, zNear)), f = X(v3(p, zFar));
  const dx = n.x - f.x, dy = n.y - f.y, m = Math.hypot(dx, dy) || 1;
  const ox = (-dy / m) * r, oy = (dx / m) * r;
  return [
    { t: "face", c: v3(p, zFar), r, strokes: [{ cls: capCls }], ...opt },
    line3([p[0] + ox, p[1] + oy], zFar, [p[0] + ox, p[1] + oy], zNear, capCls, opt),
    line3([p[0] - ox, p[1] - oy], zFar, [p[0] - ox, p[1] - oy], zNear, capCls, opt),
    { t: "face", c: v3(p, zNear), r, strokes: [{ cls: capCls }], ...opt, bias: (opt.bias ?? 0) + 0.5 },
  ];
}
