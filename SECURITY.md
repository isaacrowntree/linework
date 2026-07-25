# Security Policy

## Reporting a vulnerability

Please report security issues **privately** through GitHub Security Advisories:
[Report a vulnerability](https://github.com/isaacrowntree/linework/security/advisories/new).

Do not open a public issue for anything security-sensitive. You can expect an
initial response within a few days.

## Supported versions

The latest published `0.x` release receives security fixes. There is no support
commitment for older versions before a `1.0` release.

## Threat model

`linework/import` parses **untrusted 3D files** (glTF/GLB, OBJ, STL). Treat any
file you did not author as untrusted input, and note:

- **Bounds-checked binary parsing.** The GLB parser validates the header,
  version, chunk lengths, and every accessor's byte range before reading, caps
  per-accessor element counts, and guards against cyclic node graphs. Malformed
  or malicious input throws a typed `Error` (`[import] …`) rather than reading
  out of bounds, over-allocating, or looping forever. The binary STL parser
  admits a file as binary only when its size exactly matches the declared
  triangle count, so a lying count cannot force an over-read.
- **CPU-bound and synchronous.** Import runs on the calling thread. For large or
  unknown files, run it inside a **Web Worker** so a pathological model cannot
  block your UI. There is no built-in time or size budget beyond the allocation
  caps.
- **No transitive supply chain.** linework has **zero runtime dependencies**, so
  there is no dependency tree to audit. Releases are published from CI with
  [npm provenance](https://docs.npmjs.com/generating-provenance-statements).

The core renderer (`render`, `sketch`, `helpers`) does not parse input — it only
emits SVG strings from data you provide. As with any HTML/SVG you assemble,
sanitise any untrusted text you place into labels before inserting the output
into the DOM.
