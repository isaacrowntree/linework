/**
 * Generates docs/hero.svg — the README hero image — by running the demo
 * scene server-side. Proof of the zero-client-JS story: `npm run hero`.
 */
import { writeFileSync } from "node:fs";
import { scene, DEFAULT_VIEW } from "../docs/scene.js";

const { svg, count } = scene(DEFAULT_VIEW, 0.85);

const style = `
  .ink { stroke: #F4F9FF; stroke-width: 2; fill: none; stroke-linecap: round; }
  .mut { stroke: #7FA3C9; stroke-width: 1.1; fill: none; }
  .dash { stroke: #7FA3C9; stroke-width: 1.1; fill: none; stroke-dasharray: 5 5; }
  .face3 { fill: #1B3A66; stroke: #F4F9FF; stroke-width: 1.4; }
  .top3 { fill: #234476; stroke: #F4F9FF; stroke-width: 1.1; }
  .side3 { fill: #16325B; stroke: #F4F9FF; stroke-width: 1.1; }
  .shadow { fill: #000; opacity: .3; }
  .bl { fill: #11294A; stroke: #F4F9FF; stroke-width: 1.4; }
  .bt { font: 700 12px Futura, "Century Gothic", sans-serif; fill: #F4F9FF; }
  .an { font: 11px ui-monospace, Menlo, monospace; fill: #C9DFF5; }
  .tt { font: 700 11px Futura, "Century Gothic", sans-serif; fill: #F4F9FF; letter-spacing: .08em; }
  .tbr { fill: #11294A; stroke: #7FA3C9; }
`;

const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 560" font-family="system-ui">
<style>${style}</style>
<defs>
  <pattern id="g" width="24" height="24" patternUnits="userSpaceOnUse">
    <path d="M24 0H0V24" fill="none" stroke="#1D3B69" stroke-width="1"/>
  </pattern>
  <marker id="lwarr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M0 0L8 4L0 8z" fill="#7FA3C9"/>
  </marker>
</defs>
<rect width="920" height="560" fill="#0D2140"/>
<rect width="920" height="560" fill="url(#g)"/>
${svg}
</svg>`;

writeFileSync(new URL("../docs/hero.svg", import.meta.url), out);
console.log(`hero.svg written — ${count} shapes, rendered in Node with zero client JS`);
