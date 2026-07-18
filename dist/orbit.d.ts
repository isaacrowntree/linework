/**
 * orbit — the drag-to-orbit boilerplate every consumer would otherwise
 * copy-paste: pointer capture, yaw/pitch clamping, rAF batching,
 * double-click reset, and a gentle idle sway until first touch
 * (disabled under prefers-reduced-motion).
 */
import type { View } from "./linework.js";
export interface OrbitOptions {
    view: View;
    onFrame: (view: View) => void;
    yawRange?: [number, number];
    pitchRange?: [number, number];
    /** idle sway amplitude in radians (0 disables). Default 0.12. */
    idle?: number;
}
export interface OrbitHandle {
    view: View;
    redraw: () => void;
    stop: () => void;
}
export declare function orbit(el: Element, o: OrbitOptions): OrbitHandle;
