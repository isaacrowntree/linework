// Regenerates the README hero image (docs/import-lantern.svg) from the
// committed geometry-only lantern (docs/lantern.glb), entirely in Node —
// proof of the zero-client-JS render path. Run: `npm run images`.
//
// docs/lantern.glb was bootstrapped once from the Khronos glTF-Sample-Assets
// "Lantern" (CC0 1.0, public domain), texture-stripped to geometry only.
import { readFileSync, writeFileSync } from "node:fs";
import { parseGLB, meshToShapes } from "../dist/import.js";
import { render } from "../dist/linework.js";

const glb = readFileSync(new URL("../docs/lantern.glb", import.meta.url));
const ab = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
const meshes = parseGLB(ab);
const tris = meshes.reduce((a, m) => a + m.indices.length / 3, 0);

const shapes = meshToShapes(meshes, { angle: 25, cls: "ink", fit: { cx: 400, cy: 290, size: 420 } });
const view = { yaw: 0.62, pitch: 0.32, f: 1500, cx: 400, cy: 290 };

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" font-family="system-ui">
<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1D3B69" stroke-width="1"/></pattern></defs>
<rect width="800" height="560" fill="#0D2140"/><rect width="800" height="560" fill="url(#g)"/>
<style>.ink{stroke:#F4F9FF;stroke-width:1.1;fill:none;stroke-linecap:round}.an{font:12px ui-monospace,Menlo,monospace;fill:#7FA3C9}.tt{font:700 12px Futura,sans-serif;fill:#FFC24B;letter-spacing:.1em}</style>
${render(shapes, view)}
<text x="24" y="40" class="tt">IMPORTED · CC0 LANTERN</text>
<text x="24" y="536" class="an">glTF mesh · ${tris} triangles → ${shapes.length} feature edges · one function call</text></svg>`;

writeFileSync(new URL("../docs/import-lantern.svg", import.meta.url), svg);
console.log(`docs/import-lantern.svg regenerated — ${tris} triangles → ${shapes.length} feature edges, in Node`);
