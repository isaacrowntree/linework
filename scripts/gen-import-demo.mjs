// Regenerates the import demo assets: a geometry-only lantern.glb (small,
// texture-free) for the live Pages importer, and a preview SVG for the README.
// Source model: Khronos glTF-Sample-Assets "Lantern" (CC0 1.0, public domain).
import { readFileSync, writeFileSync } from "node:fs";
import { parseGLB, meshToShapes, featureEdges } from "file:///Users/isaacrowntree/src/personal/linework/dist/import.js";
import { render } from "file:///Users/isaacrowntree/src/personal/linework/dist/linework.js";

const src = process.argv[2];                 // path to full Lantern.glb
const buf = readFileSync(src);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const meshes = parseGLB(ab);

// merge world-space meshes → one positions+indices pair
let P = [], I = [], base = 0;
for (const m of meshes) {
  P.push(...m.positions);
  for (const idx of m.indices) I.push(idx + base);
  base += m.positions.length / 3;
}
const positions = new Float32Array(P), indices = new Uint32Array(I);

// --- minimal geometry-only GLB writer ---
const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
for (let i=0;i<positions.length;i+=3) for(let k=0;k<3;k++){min[k]=Math.min(min[k],positions[i+k]);max[k]=Math.max(max[k],positions[i+k]);}
const posBytes = positions.byteLength, idxBytes = indices.byteLength;
const bin = new Uint8Array(posBytes + idxBytes);
bin.set(new Uint8Array(positions.buffer), 0);
bin.set(new Uint8Array(indices.buffer), posBytes);
const gltf = {
  asset:{version:"2.0",generator:"linework/gen-import-demo"},
  scene:0, scenes:[{nodes:[0]}], nodes:[{mesh:0}],
  meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
  accessors:[
    {bufferView:0,componentType:5126,count:positions.length/3,type:"VEC3",min,max},
    {bufferView:1,componentType:5125,count:indices.length,type:"SCALAR"},
  ],
  bufferViews:[
    {buffer:0,byteOffset:0,byteLength:posBytes,target:34962},
    {buffer:0,byteOffset:posBytes,byteLength:idxBytes,target:34963},
  ],
  buffers:[{byteLength:bin.length}],
};
const enc = new TextEncoder();
let jsonBytes = enc.encode(JSON.stringify(gltf));
while (jsonBytes.length % 4) jsonBytes = Uint8Array.from([...jsonBytes, 0x20]);
let binPad = bin;
if (binPad.length % 4) binPad = Uint8Array.from([...binPad, ...new Array(4 - binPad.length%4).fill(0)]);
const total = 12 + 8 + jsonBytes.length + 8 + binPad.length;
const glb = new Uint8Array(total); const dv = new DataView(glb.buffer);
dv.setUint32(0,0x46546c67,true); dv.setUint32(4,2,true); dv.setUint32(8,total,true);
dv.setUint32(12,jsonBytes.length,true); dv.setUint32(16,0x4e4f534a,true);
glb.set(jsonBytes,20);
let o=20+jsonBytes.length;
dv.setUint32(o,binPad.length,true); dv.setUint32(o+4,0x004e4942,true);
glb.set(binPad,o+8);
writeFileSync("docs/lantern.glb", glb);

// --- README preview SVG (blueprint styled) ---
const shapes = meshToShapes(meshes, { angle: 25, cls:"ink", fit:{cx:400,cy:290,size:420} });
const view = { yaw:0.62, pitch:0.32, f:1500, cx:400, cy:290 };
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" font-family="system-ui">
<defs><pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#1D3B69" stroke-width="1"/></pattern></defs>
<rect width="800" height="560" fill="#0D2140"/><rect width="800" height="560" fill="url(#g)"/>
<style>.ink{stroke:#F4F9FF;stroke-width:1.1;fill:none;stroke-linecap:round}.an{font:12px ui-monospace,Menlo,monospace;fill:#7FA3C9}.tt{font:700 12px Futura,sans-serif;fill:#FFC24B;letter-spacing:.1em}</style>
${render(shapes, view)}
<text x="24" y="40" class="tt">IMPORTED · CC0 LANTERN</text>
<text x="24" y="536" class="an">glTF mesh · ${meshes.reduce((a,m)=>a+m.indices.length/3,0)} triangles → ${shapes.length} feature edges · one function call</text></svg>`;
writeFileSync("docs/import-lantern.svg", svg);
console.log(`lantern.glb: ${(glb.length/1024).toFixed(0)} KB · preview: ${shapes.length} edges`);
