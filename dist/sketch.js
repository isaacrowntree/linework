/**
 * sketch — the expressive authoring layer. Designing a drawing should be
 * as pleasant as looking at one.
 *
 * Three ideas:
 *  1. A Sketch holds the view, so nothing needs `xform` passed around.
 *  2. Context blocks — `s.part()`, `s.tag()`, `s.bias()` — scope metadata
 *     over everything drawn inside them, killing per-call option noise.
 *  3. `scene(build)` returns a replayable frame function: define once,
 *     call with a new view every frame for orbit/explode animation.
 *
 *     const draw = scene((s, { e }) => {
 *       s.box(300, 380, 320, 42, 40, 80);
 *       s.part("shaft", () => s.cyl([460, 310], 19, 168, 24, "ink"));
 *     });
 *     el.innerHTML = draw({ yaw, pitch, f: 1500, cx: 460, cy: 320 }, { e });
 */
import { render, xform } from "./linework.js";
/** fluent path under construction — every verb returns itself */
export class Path {
    shape;
    constructor(shape) { this.shape = shape; }
    M(p, z = 0) { this.shape.d.push(["M", [p[0], p[1], z]]); return this; }
    L(p, z = 0) { this.shape.d.push(["L", [p[0], p[1], z]]); return this; }
    Q(c, cz, p, z = 0) { this.shape.d.push(["Q", [c[0], c[1], cz], [p[0], p[1], z]]); return this; }
    close() { this.shape.d.push(["Z"]); return this; }
    /** additional stroke over the same geometry (hollow tubes, glows) */
    stroke(cls, w) { this.shape.strokes.push({ cls, w }); return this; }
    fill(paint) { this.shape.fill = paint; return this; }
}
export class Sketch {
    view;
    X;
    shapes = [];
    parts = {};
    paperStrs = [];
    ctx = { bias: 0 };
    constructor(view) {
        this.view = view;
        this.X = xform(view);
    }
    /* ---------- context blocks ---------- */
    scoped(patch, fn) {
        const prev = this.ctx;
        this.ctx = { ...prev, ...patch, bias: prev.bias + (patch.bias ?? 0) };
        try {
            fn();
        }
        finally {
            this.ctx = prev;
        }
        return this;
    }
    /** everything drawn inside belongs to one animated part (one <g>, one sort unit) */
    part(name, attrs, fn) {
        this.parts[name] = { attrs };
        return this.scoped({ part: name }, fn);
    }
    /** everything inside carries an extra class — visibility groups, themes */
    tag(cls, fn) {
        return this.scoped({ tag: this.ctx.tag ? `${this.ctx.tag} ${cls}` : cls }, fn);
    }
    /** deliberate layering for coplanar geometry */
    bias(n, fn) { return this.scoped({ bias: n }, fn); }
    opt() {
        const o = {};
        if (this.ctx.part)
            o.part = this.ctx.part;
        if (this.ctx.tag)
            o.tag = this.ctx.tag;
        if (this.ctx.bias)
            o.bias = this.ctx.bias;
        return o;
    }
    /* ---------- primitives ---------- */
    /** begin a fluent path: s.path("ink").M(a).Q(c, 10, b, 20) */
    path(cls, w) {
        const shape = { t: "path", d: [], strokes: [{ cls, w }], ...this.opt() };
        this.shapes.push(shape);
        return new Path(shape);
    }
    /** hollow-tube outline in one call: fat outer + core stroke */
    tube(w, outer = "tube", inner = "tube-in") {
        return this.path(outer, w).stroke(inner, Math.max(1.5, w - 5));
    }
    line(a, za, b, zb, cls, w) {
        this.path(cls, w).M(a, za).L(b, zb);
        return this;
    }
    /** circle in a constant-z plane — projects to a correct ellipse */
    disc(c, z, r, cls, fill) {
        const strokes = typeof cls === "string" ? [{ cls }] : cls;
        this.shapes.push({ t: "disc", c: [c[0], c[1], z], r, strokes, fill, ...this.opt() });
        return this;
    }
    /** cylinder end-cap facing the viewer — stylized, stays readable */
    cap(c, z, r, cls, fill) {
        this.shapes.push({ t: "face", c: [c[0], c[1], z], r, strokes: [{ cls }], fill, ...this.opt() });
        return this;
    }
    /** six-faced box: face plate at z, body extruded away (z − dz) */
    box(x, y, w, h, z, dz, cls = {}) {
        const { face = "face3", top = "top3", side = "side3" } = cls;
        const zB = z - dz, o = this.opt(), b0 = o.bias ?? 0;
        const A = [x, y, z], B = [x + w, y, z], C = [x + w, y + h, z], D = [x, y + h, z];
        const A2 = [x, y, zB], B2 = [x + w, y, zB], C2 = [x + w, y + h, zB], D2 = [x, y + h, zB];
        const q = (qq, c2, bias) => this.shapes.push({ t: "quad", q: qq, cls: c2, cull: true, ...o, bias });
        q([A, A2, B2, B], top, b0);
        q([D, C, C2, D2], top, b0);
        q([A, A2, D2, D], side, b0);
        q([B, C, C2, B2], side, b0);
        q([A2, D2, C2, B2], face, b0 + 0.1);
        q([A, B, C, D], face, b0 + 0.2);
        return this;
    }
    /** cylinder along z with silhouette rails computed from THIS sketch's view */
    cyl(c, r, zNear, zFar, cls = "ink", fill) {
        const n = this.X([c[0], c[1], zNear]), f = this.X([c[0], c[1], zFar]);
        const dx = n.x - f.x, dy = n.y - f.y, m = Math.hypot(dx, dy) || 1;
        const ox = (-dy / m) * r, oy = (dx / m) * r;
        this.cap(c, zFar, r, cls);
        this.line([c[0] + ox, c[1] + oy], zFar, [c[0] + ox, c[1] + oy], zNear, cls);
        this.line([c[0] - ox, c[1] - oy], zFar, [c[0] - ox, c[1] - oy], zNear, cls);
        const o = this.opt();
        this.shapes.push({ t: "face", c: [c[0], c[1], zNear], r, strokes: [{ cls }], fill, ...o, bias: (o.bias ?? 0) + 0.5 });
        return this;
    }
    /* ---------- paper space (annotations that never rotate) ---------- */
    /** project a model point to screen — for hand-placed annotations */
    pt(p, z = 0) { const q = this.X([p[0], p[1], z]); return [q.x, q.y]; }
    /** raw SVG painted above the sorted scene */
    paper(svg) { this.paperStrs.push(svg); return this; }
    /** paper-space text at a projected anchor */
    note(text, p, z = 0, cls = "an", dx = 6, dy = 4) {
        const q = this.pt(p, z);
        return this.paper(`<text x="${(q[0] + dx).toFixed(1)}" y="${(q[1] + dy).toFixed(1)}" class="${cls}">${text}</text>`);
    }
    /* ---------- output ---------- */
    count() { return this.shapes.length; }
    render() { return render(this.shapes, this.view, this.parts) + this.paperStrs.join(""); }
}
export const sketch = (view) => new Sketch(view);
/** define once, replay per frame with a fresh view — the orbit-loop idiom */
export function scene(build) {
    return (view, props) => {
        const s = sketch(view);
        build(s, props);
        return s.render();
    };
}
//# sourceMappingURL=sketch.js.map