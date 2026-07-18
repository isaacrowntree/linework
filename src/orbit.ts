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

export function orbit(el: Element, o: OrbitOptions): OrbitHandle {
  const v: View = { ...o.view };
  const [ylo, yhi] = o.yawRange ?? [-1.1, 1.1];
  const [plo, phi] = o.pitchRange ?? [-0.3, 0.6];
  const idleAmp = o.idle ?? 0.12;
  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

  let dragging = false, x0 = 0, y0 = 0, yaw0 = 0, p0 = 0, raf = 0, stopped = false;
  let idleOn = idleAmp > 0 &&
    (typeof matchMedia === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches);

  const frame = () => { raf = 0; o.onFrame({ ...v }); };
  const req = () => { if (!raf) raf = requestAnimationFrame(frame); };

  el.addEventListener("pointerdown", (e) => {
    const ev = e as PointerEvent;
    if ((ev.target as Element | null)?.closest?.("[data-no-orbit]")) return;
    idleOn = false; dragging = true;
    x0 = ev.clientX; y0 = ev.clientY; yaw0 = v.yaw; p0 = v.pitch;
    (el as HTMLElement).setPointerCapture?.(ev.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const ev = e as PointerEvent;
    v.yaw = clamp(yaw0 + (ev.clientX - x0) / 260, ylo, yhi);
    v.pitch = clamp(p0 + (ev.clientY - y0) / 340, plo, phi);
    req();
  });
  const end = () => { dragging = false; };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  el.addEventListener("dblclick", () => { v.yaw = o.view.yaw; v.pitch = o.view.pitch; req(); });

  // gentle sway so the page is alive before anyone touches it
  const t0 = performance.now();
  const sway = (t: number) => {
    if (stopped) return;
    if (idleOn) {
      v.yaw = clamp(o.view.yaw + Math.sin((t - t0) / 1700) * idleAmp, ylo, yhi);
      v.pitch = clamp(o.view.pitch + Math.sin((t - t0) / 2500) * idleAmp * 0.35, plo, phi);
      o.onFrame({ ...v });
    }
    requestAnimationFrame(sway);
  };
  o.onFrame({ ...v }); // first paint
  if (idleOn) requestAnimationFrame(sway);

  return { view: v, redraw: () => o.onFrame({ ...v }), stop: () => { stopped = true; idleOn = false; } };
}
