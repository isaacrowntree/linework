/**
 * linework — a tiny true-3D renderer for annotated technical drawings.
 *
 * The classic pipeline, properly this time:
 *   model (V3 points) → rotate (yaw, pitch) → perspective project
 *   → depth-sort (painter's algorithm) → emit SVG strings.
 *
 * Why not a library: nothing ships "parametric technical illustration"
 * (multi-weight strokes, dashed line styles, hollow tubes, CSS theming,
 * crawlable text). This is ~180 lines and does exactly that.
 *
 * Deliberate stylizations (schematic license, documented):
 *  - "face" discs (cylinder end-caps) stay round instead of thinning to
 *    lenses edge-on — they must stay readable as parts.
 *  - Depth cueing dims far strokes instead of hidden-line removal.
 */
export type V3 = [number, number, number];
export interface View {
    yaw: number;
    pitch: number;
    f: number;
    cx: number;
    cy: number;
}
export interface Pt {
    x: number;
    y: number;
    z: number;
    k: number;
}
/** Build the world→screen transform for a view. */
export declare function xform(v: View): (p: V3) => Pt;
export interface Stroke {
    cls: string;
    w?: number;
}
export type Cmd = ["M", V3] | ["L", V3] | ["Q", V3, V3] | ["Z"];
export type Shape = 
/** polyline/curve; multi-stroke renders the same d repeatedly (hollow tubes) */
{
    t: "path";
    d: Cmd[];
    strokes: Stroke[];
    fill?: string;
    bias?: number;
    tag?: string;
    part?: string;
}
/** circle lying in a constant-z model plane (wheels, rings) → ellipse */
 | {
    t: "disc";
    c: V3;
    r: number;
    strokes: Stroke[];
    fill?: string;
    bias?: number;
    tag?: string;
    part?: string;
}
/** circle facing along z (cylinder caps) — stylized: stays round */
 | {
    t: "face";
    c: V3;
    r: number;
    strokes: Stroke[];
    fill?: string;
    bias?: number;
    tag?: string;
    part?: string;
}
/** flat filled quad (box faces); cull=true drops backfaces */
 | {
    t: "quad";
    q: [V3, V3, V3, V3];
    cls: string;
    cull?: boolean;
    bias?: number;
    tag?: string;
    part?: string;
};
export interface PartDef {
    attrs: string;
}
/**
 * Render shapes with painter's-algorithm depth sorting.
 * Shapes sharing a `part` key sort as one object (per-object sorting keeps
 * animated <g part> wrappers intact) and are wrapped with that part's attrs.
 */
export declare function render(shapes: Shape[], view: View, parts?: Record<string, PartDef>): string;
