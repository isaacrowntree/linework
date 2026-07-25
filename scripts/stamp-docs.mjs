// Stamp content hashes onto the demo's module imports.
//
// Cloudflare serves docs/*.js with `cache-control: max-age=31536000` (a 1-year
// browser TTL), while the HTML that imports them carries max-age=600. On
// unversioned URLs that means a returning visitor keeps whatever import.js they
// first downloaded, essentially forever — which is how the demo ended up linking
// a v0.2.0 import.js against a current index.html and failing with
// "does not provide an export named 'parseSTL'".
//
// Rewriting each specifier to ./name.js?v=<hash of that file> makes the URL
// change whenever the bytes change, so a new build is a new cache key at both
// the edge and in the browser. Runs as part of `npm run build`.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const page = join(docs, "index.html");

const hash = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 8);

const before = readFileSync(page, "utf8");
const stamped = new Map();

// Matches: from "./import.js"  and  from "./import.js?v=abc12345"
const after = before.replace(
  /from "\.\/([\w.-]+)\.js(?:\?v=[a-f0-9]+)?"/g,
  (whole, name) => {
    const target = join(docs, `${name}.js`);
    if (!existsSync(target)) {
      console.warn(`stamp-docs: no such file docs/${name}.js — leaving as-is`);
      return whole;
    }
    const v = hash(target);
    stamped.set(`${name}.js`, v);
    return `from "./${name}.js?v=${v}"`;
  },
);

if (after === before) {
  console.log("stamp-docs: index.html already current");
} else {
  writeFileSync(page, after);
  console.log(
    `stamp-docs: ${[...stamped].map(([f, v]) => `${f}?v=${v}`).join(" ")}`,
  );
}
