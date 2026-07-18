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
  yaw: number;   // about the vertical axis through cx
  pitch: number; // about the horizontal screen axis through cy
  f: number;     // perspective focal distance
  cx: number;
  cy: number;
}

export interface Pt { x: number; y: number; z: number; k: number }

/** Build the world→screen transform for a view. */
export function xform(v: View): (p: V3) => Pt {
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
  const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  return (p) => {
    const dx = p[0] - v.cx, dy = p[1] - v.cy;
    // yaw about vertical
    const x1 = cy * dx - sy * p[2];
    const z1 = sy * dx + cy * p[2];
    // pitch about horizontal (screen y grows downward; +pitch = camera above)
    const y2 = cp * dy + sp * z1;
    const z2 = -sp * dy + cp * z1;
    const k = v.f / (v.f - z2);
    return { x: v.cx + x1 * k, y: v.cy + y2 * k, z: z2, k };
  };
}

export interface Stroke { cls: string; w?: number }

export type Cmd = ["M", V3] | ["L", V3] | ["Q", V3, V3] | ["Z"];

export type Shape =
  /** polyline/curve; multi-stroke renders the same d repeatedly (hollow tubes) */
  | { t: "path"; d: Cmd[]; strokes: Stroke[]; fill?: string; bias?: number; tag?: string; part?: string }
  /** circle lying in a constant-z model plane (wheels, rings) → ellipse */
  | { t: "disc"; c: V3; r: number; strokes: Stroke[]; fill?: string; bias?: number; tag?: string; part?: string }
  /** circle facing along z (cylinder caps) — stylized: stays round */
  | { t: "face"; c: V3; r: number; strokes: Stroke[]; fill?: string; bias?: number; tag?: string; part?: string }
  /** flat filled quad (box faces); cull=true drops backfaces */
  | { t: "quad"; q: [V3, V3, V3, V3]; cls: string; cull?: boolean; bias?: number; tag?: string; part?: string };

export interface PartDef { attrs: string }

const f1 = (n: number) => n.toFixed(1);

function pathD(d: Cmd[], X: (p: V3) => Pt): { str: string; zs: number[] } {
  const zs: number[] = [];
  const str = d
    .map((c) => {
      if (c[0] === "Z") return "Z";
      if (c[0] === "Q") {
        const a = X(c[1]), b = X(c[2]);
        zs.push(a.z, b.z);
        return `Q ${f1(a.x)} ${f1(a.y)} ${f1(b.x)} ${f1(b.y)}`;
      }
      const p = X(c[1]);
      zs.push(p.z);
      return `${c[0]} ${f1(p.x)} ${f1(p.y)}`;
    })
    .join(" ");
  return { str, zs };
}

/** depth-cue opacity: far → gently dimmer. Tuned so the far side of the
 *  bike reads as "behind", never as "ghosted". */
const dim = (z: number) => (z < -12 ? Math.max(0.55, 1 + (z + 12) / 420).toFixed(2) : "");

function emit(sh: Shape, X: (p: V3) => Pt): { svg: string; depth: number } {
  if (sh.t === "path") {
    const { str, zs } = pathD(sh.d, X);
    const depth = zs.reduce((a, b) => a + b, 0) / (zs.length || 1);
    const op = dim(depth);
    const fill = sh.fill ?? "none";
    const svg = sh.strokes
      .map(
        (s, i) =>
          `<path d="${str}" class="${s.cls}${sh.tag ? " " + sh.tag : ""}"${s.w ? ` stroke-width="${f1(s.w)}"` : ""} fill="${i === 0 ? fill : "none"}"${op && i === 0 ? ` opacity="${op}"` : op ? ` opacity="${op}"` : ""}/>`,
      )
      .join("");
    return { svg, depth: depth + (sh.bias ?? 0) };
  }
  if (sh.t === "disc" || sh.t === "face") {
    const c = X(sh.c);
    const op = dim(c.z);
    let core: string;
    if (sh.t === "disc") {
      // project the disc's plane basis to get the ellipse
      const u = X([sh.c[0] + 1, sh.c[1], sh.c[2]]);
      const v = X([sh.c[0], sh.c[1] + 1, sh.c[2]]);
      const rx = Math.hypot(u.x - c.x, u.y - c.y) * sh.r;
      const ry = Math.hypot(v.x - c.x, v.y - c.y) * sh.r;
      const rot = (Math.atan2(u.y - c.y, u.x - c.x) * 180) / Math.PI;
      core = `<ellipse cx="${f1(c.x)}" cy="${f1(c.y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(rot)} ${f1(c.x)} ${f1(c.y)})"`;
    } else {
      core = `<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(sh.r * c.k)}"`;
    }
    const fill = sh.fill ?? "none";
    const svg = sh.strokes
      .map(
        (s, i) =>
          core +
          ` class="${s.cls}${sh.tag ? " " + sh.tag : ""}"${s.w ? ` stroke-width="${f1(s.w)}"` : ""} fill="${i === 0 ? fill : "none"}"${op ? ` opacity="${op}"` : ""}/>`,
      )
      .join("");
    return { svg, depth: c.z + (sh.bias ?? 0) };
  }
  // quad
  const q = sh.q.map(X);
  // backface cull via signed screen area
  const area =
    (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[2].x - q[0].x) * (q[1].y - q[0].y);
  if (sh.cull && area <= 0) return { svg: "", depth: -Infinity };
  const depth = (q[0].z + q[1].z + q[2].z + q[3].z) / 4 + (sh.bias ?? 0);
  const d = `M ${f1(q[0].x)} ${f1(q[0].y)} L ${f1(q[1].x)} ${f1(q[1].y)} L ${f1(q[2].x)} ${f1(q[2].y)} L ${f1(q[3].x)} ${f1(q[3].y)} Z`;
  return { svg: `<path d="${d}" class="${sh.cls}${sh.tag ? " " + sh.tag : ""}"/>`, depth };
}

/**
 * Render shapes with painter's-algorithm depth sorting.
 * Shapes sharing a `part` key sort as one object (per-object sorting keeps
 * animated <g part> wrappers intact) and are wrapped with that part's attrs.
 */
export function render(shapes: Shape[], view: View, parts: Record<string, PartDef> = {}): string {
  const X = xform(view);
  type Slot = { svg: string; depth: number; part?: string };
  const slots: Slot[] = [];
  const byPart = new Map<string, { svgs: string[]; depths: number[] }>();

  for (const sh of shapes) {
    const e = emit(sh, X);
    if (!e.svg) continue;
    if (sh.part) {
      const b = byPart.get(sh.part) ?? { svgs: [], depths: [] };
      b.svgs.push(e.svg);
      b.depths.push(e.depth);
      byPart.set(sh.part, b);
    } else {
      slots.push(e);
    }
  }
  for (const [key, b] of byPart) {
    const depth = b.depths.reduce((a, c) => a + c, 0) / b.depths.length;
    const def = parts[key];
    slots.push({
      svg: `<g ${def ? def.attrs : ""}>${b.svgs.join("")}</g>`,
      depth,
      part: key,
    });
  }
  slots.sort((a, b) => a.depth - b.depth); // far → near
  return slots.map((s) => s.svg).join("");
}
