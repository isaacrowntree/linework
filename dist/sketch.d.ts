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
import { type Shape, type Stroke, type View, type V3, type Pt } from "./linework.js";
export type P2 = [number, number];
/** fluent path under construction — every verb returns itself */
export declare class Path {
    private shape;
    constructor(shape: Shape & {
        t: "path";
    });
    M(p: P2, z?: number): this;
    L(p: P2, z?: number): this;
    Q(c: P2, cz: number, p: P2, z?: number): this;
    close(): this;
    /** additional stroke over the same geometry (hollow tubes, glows) */
    stroke(cls: string, w?: number): this;
    fill(paint: string): this;
}
export declare class Sketch {
    readonly view: View;
    readonly X: (p: V3) => Pt;
    private shapes;
    private parts;
    private paperStrs;
    private ctx;
    constructor(view: View);
    private scoped;
    /** everything drawn inside belongs to one animated part (one <g>, one sort unit) */
    part(name: string, attrs: string, fn: () => void): this;
    /** everything inside carries an extra class — visibility groups, themes */
    tag(cls: string, fn: () => void): this;
    /** deliberate layering for coplanar geometry */
    bias(n: number, fn: () => void): this;
    private opt;
    /** begin a fluent path: s.path("ink").M(a).Q(c, 10, b, 20) */
    path(cls: string, w?: number): Path;
    /** hollow-tube outline in one call: fat outer + core stroke */
    tube(w: number, outer?: string, inner?: string): Path;
    line(a: P2, za: number, b: P2, zb: number, cls: string, w?: number): this;
    /** circle in a constant-z plane — projects to a correct ellipse */
    disc(c: P2, z: number, r: number, cls: string | Stroke[], fill?: string): this;
    /** cylinder end-cap facing the viewer — stylized, stays readable */
    cap(c: P2, z: number, r: number, cls: string, fill?: string): this;
    /** six-faced box: face plate at z, body extruded away (z − dz) */
    box(x: number, y: number, w: number, h: number, z: number, dz: number, cls?: {
        face?: string;
        top?: string;
        side?: string;
    }): this;
    /** cylinder along z with silhouette rails computed from THIS sketch's view */
    cyl(c: P2, r: number, zNear: number, zFar: number, cls?: string, fill?: string): this;
    /** project a model point to screen — for hand-placed annotations */
    pt(p: P2, z?: number): P2;
    /** raw SVG painted above the sorted scene */
    paper(svg: string): this;
    /** paper-space text at a projected anchor */
    note(text: string, p: P2, z?: number, cls?: string, dx?: number, dy?: number): this;
    count(): number;
    render(): string;
}
export declare const sketch: (view: View) => Sketch;
/** define once, replay per frame with a fresh view — the orbit-loop idiom */
export declare function scene<P = void>(build: (s: Sketch, props: P) => void): (view: View, props: P) => string;
