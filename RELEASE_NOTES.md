# Linear Algebra v1.0.1

Patch release: documentation links now open rendered GitHub pages instead of raw Markdown. The visualizer itself is unchanged.

## What is included

- 3D entry scene with three starting levels
- Zero-basis vectors lesson
- Five core chapters: matrix transform, determinant, rank/null space,
  eigenvectors, linear systems
- Nine interactive applications across physics, economics, software, and
  hardware
- Application atlas and release checklist
- Application-check quizzes with immediate feedback
- Keyboard controls for key Canvas demos
- No runtime dependencies, no build step, no backend

## Verification

- 45 math tests pass
- Full Edge regression: 0 console errors, no horizontal overflow
- Entry first screen: 44.6 KB transfer, excluding images
- Matrix transform drag: 60 fps in the documented headless test
- Local `file://` entry tested

## Known limits

See `pages/applications/release.html` and `PERFORMANCE.md`. In short: 2D only,
no real audio playback, Hamming(7,4) corrects one bit, Canvas charts do not have a
complete screen-reader data-table alternative, and performance on low-end
devices has not been measured.

## License

Code is MIT; original content is CC BY-SA 4.0. See `LICENSE`, `LICENSES/`, and
`NOTICE`. The project is independent and is not affiliated with MIT, Gilbert
Strang, or 3Blue1Brown.
