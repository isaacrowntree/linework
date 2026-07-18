export function orbit(el, o) {
    const v = { ...o.view };
    const [ylo, yhi] = o.yawRange ?? [-1.1, 1.1];
    const [plo, phi] = o.pitchRange ?? [-0.3, 0.6];
    const idleAmp = o.idle ?? 0.12;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    let dragging = false, x0 = 0, y0 = 0, yaw0 = 0, p0 = 0, raf = 0, stopped = false;
    let idleOn = idleAmp > 0 &&
        (typeof matchMedia === "undefined" || !matchMedia("(prefers-reduced-motion: reduce)").matches);
    const frame = () => { raf = 0; o.onFrame({ ...v }); };
    const req = () => { if (!raf)
        raf = requestAnimationFrame(frame); };
    el.addEventListener("pointerdown", (e) => {
        const ev = e;
        if (ev.target?.closest?.("[data-no-orbit]"))
            return;
        idleOn = false;
        dragging = true;
        x0 = ev.clientX;
        y0 = ev.clientY;
        yaw0 = v.yaw;
        p0 = v.pitch;
        el.setPointerCapture?.(ev.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
        if (!dragging)
            return;
        const ev = e;
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
    const sway = (t) => {
        if (stopped)
            return;
        if (idleOn) {
            v.yaw = clamp(o.view.yaw + Math.sin((t - t0) / 1700) * idleAmp, ylo, yhi);
            v.pitch = clamp(o.view.pitch + Math.sin((t - t0) / 2500) * idleAmp * 0.35, plo, phi);
            o.onFrame({ ...v });
        }
        requestAnimationFrame(sway);
    };
    o.onFrame({ ...v }); // first paint
    if (idleOn)
        requestAnimationFrame(sway);
    return { view: v, redraw: () => o.onFrame({ ...v }), stop: () => { stopped = true; idleOn = false; } };
}
