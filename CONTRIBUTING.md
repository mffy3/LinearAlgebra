# Contributing

Thanks for taking a look. This project is deliberately small: static HTML,
vanilla JavaScript, Canvas 2D, no build step, and no runtime dependencies.

## Run it locally

From the repository root:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Then open <http://127.0.0.1:4173/index.html>.

You can also open `index.html` directly, but a local server is recommended for
consistent browser behavior.

## Before opening a pull request

1. Run the math tests:

   ```powershell
   node tests/math.test.js
   ```

   Current baseline: 45 passed, 0 failed.

2. Check the page at desktop and mobile widths.
3. Test the interaction you changed with a real pointer, not only programmatic
   clicks.
4. Check the browser console: no new errors.
5. Check for horizontal overflow at 390 px and 1440 px.
6. If you changed a formula, add or update a case in `tests/math.test.js`.
7. Keep accessibility intact: native buttons/links, visible focus, labels for
   canvases, no keyboard traps.

## Scope and style

- Keep it dependency-free unless there is a strong, discussed reason.
- Put shared math in `js/lib/math.js`; do not duplicate formulas in demos.
- Put shared drawing helpers in `js/lib/canvas-utils.js`.
- Keep one page's visual language local; reuse the Morandi tokens in
  `css/main.css`.
- Prefer plain Chinese guidance over a professor persona or slogans.
- Do not add fake metrics, fake citations, or placeholder data presented as
  real.

## Assets

- New images must be original or properly licensed.
- Record the source and license in `NOTICE` and `REFERENCES.md` when relevant.
- Do not commit screenshots, browser profiles, environment files, logs, or
  internal documents.

## Commits

Use a short, scoped message, for example:

```text
fix: keep quiz option text visible during state change
feat: add keyboard controls to canvas demos
```

Do not rewrite published history or force-push.

## Reporting a problem

Open an issue with the page path, what you expected, what happened, and a
screenshot if useful. For security-sensitive reports, follow `SECURITY.md`
instead of posting details publicly.
