# Performance Check

This note records the P6 performance gate with a reproducible local method. It is
not a promise that every device reaches the same numbers.

## Test conditions

- Date: 2026-10-19
- Browser: Microsoft Edge 155.0.4283.45, headless
- Viewport: 1440 × 1100 CSS px, device scale factor 1
- GPU: headless run with `--disable-gpu`
- Server: `python -m http.server 4173 --bind 127.0.0.1`
- Load: local loopback; no network throttling
- Input: real CDP mouse events, not synthetic DOM `click()`

## Results

| Gate | Target | Measured | Result |
| --- | --- | --- | --- |
| Entry first screen, excluding images | < 200 KB | **44.6 KB transfer** (45,684 bytes) | Pass |
| Matrix transform drag | ≥ 55 fps | **60.0 fps** | Pass |
| Frame pacing | — | p95 16.7 ms, max 16.8 ms | Stable |
| Drag actually changed the matrix | required | `a: 1 → 3.24`, `c: 0 → 0.82` | Pass |

The run collected 110 rAF frames over 1,816.6 ms while dragging the `e₁` handle.
The first-screen total includes the document, `css/main.css`, `css/entry.css`,
`js/lib/entry-scene.js`, and `js/lib/entry-flow.js`; images are excluded.

Two consecutive runs produced the same 44.6 KB and 60.0 fps results.

## What this does not cover

- Low-end phones, integrated GPUs, and browser throttling under heavy tabs.
- Firefox and Safari; the release regression currently runs in Edge.
- Long-session memory behavior.
- The 3D entry on a high-DPI display above the tested CSS viewport.

## Reproduce

Start the static server, then run the optional CDP harness:

```powershell
python -m http.server 4173 --bind 127.0.0.1
node tests/perf-check.js
```

The harness assumes Edge is installed at its default Windows path and exposes a
remote debugging port. Set `PREVIEW_URL` or `CDP_PORT` if your environment
differs. It is not part of CI because it needs a browser binary; CI runs only the
pure math tests.

## Reading the numbers

44.6 KB is the transfer weight of the initial entry page under the local server,
not a compressed production bundle. The project has no build step and no runtime
dependencies. 60 fps is the observed rAF cadence in this environment, not a
per-device guarantee; the roadmap gate is 55 fps.
