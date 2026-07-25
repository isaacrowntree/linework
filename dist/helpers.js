export const v3 = (p, z = 0) => [p[0], p[1], z];
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
/** straight segment between two 3D points */
export const line3 = (a, za, b, zb, cls, opt = {}) => ({
    t: "path", d: [["M", v3(a, za)], ["L", v3(b, zb)]], strokes: [{ cls }], ...opt,
});
/** arbitrary path from Cmd list */
export const path3 = (d, strokes, opt = {}) => ({
    t: "path", d, strokes, ...opt,
});
/** hollow-tube outline: fat outer stroke + panel-colored core, one shape */
export const tube = (d, w, outerCls = "tube", innerCls = "tube-in", opt = {}) => ({
    t: "path", d, strokes: [{ cls: outerCls, w }, { cls: innerCls, w: Math.max(1.5, w - 5) }], ...opt,
});
/** circle lying in a constant-z plane (wheels, rings) — projects to a correct ellipse */
export const disc = (p, z, r, strokes, opt = {}) => ({
    t: "disc", c: v3(p, z), r, strokes, ...opt,
});
/** circle facing along z (cylinder caps) — stylized: stays round and readable */
export const faceCap = (p, z, r, strokes, opt = {}) => ({
    t: "face", c: v3(p, z), r, strokes, ...opt,
});
/**
 * A six-faced box: face plate at z, body extruded away from the viewer
 * (z − dz). Outward windings + backface culling keep it contiguous at
 * any yaw/pitch. Classes: face plate `faceCls`, top/bottom `topCls`,
 * left/right `sideCls`.
 */
export function box3(x, y, w, h, z, dz, faceCls = "face3", topCls = "top3", sideCls = "side3", opt = {}) {
    const zB = z - dz;
    const A = [x, y, z], B = [x + w, y, z], C = [x + w, y + h, z], D = [x, y + h, z];
    const A2 = [x, y, zB], B2 = [x + w, y, zB], C2 = [x + w, y + h, zB], D2 = [x, y + h, zB];
    const b0 = opt.bias ?? 0;
    const q = (qq, cls, bias) => ({ t: "quad", q: qq, cls, cull: true, ...opt, bias });
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
export function cyl3(X, p, r, zNear, zFar, capCls = "cap3", opt = {}) {
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
//# sourceMappingURL=helpers.js.map