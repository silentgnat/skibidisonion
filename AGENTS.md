# AGENTS.md

Guidance for AI agents working in this repository.

## Project overview

Browser-based game, built with Vite + TypeScript (vanilla, no framework). Renders to a
fullscreen 2D canvas with a fixed-timestep game loop. Output is a static site intended to
be trivially deployable (GitHub Pages, Netlify, Vercel, etc.).

## Commands

- `npm run dev` — start Vite dev server with HMR
- `npm run typecheck` — run `tsc --noEmit` (must pass before committing)
- `npm run build` — typecheck + production build to `dist/`
- `npm run preview` — serve the production build locally

Always run `npm run typecheck` (or `npm run build`) after making changes.

## Project structure

- `index.html` — entry HTML; contains only the `<canvas id="game">` element
- `src/main.ts` — bootstrap: imports `./style.css`, creates and starts the `Game`
- `src/game/Game.ts` — the game class: canvas setup, resize handling, game loop
  (fixed 60 Hz update step with delta accumulation), update/render split
- `src/style.css` — global styles

## Coding conventions

- TypeScript strictness comes from `tsconfig.json`; honor these constraints:
  - `verbatimModuleSyntax` — use `import type { ... }` for type-only imports
  - `erasableSyntaxOnly` — no enums, no class parameter properties, no namespaces
  - `noUnusedLocals` / `noUnusedParameters` — no dead code
- Game code lives in `src/game/`, organized by feature as it grows.
- No comments unless asked; no emojis.
- Canvas rendering uses CSS pixel sizes with `window.devicePixelRatio` scaling
  (`canvas.width = Math.floor(window.innerWidth * dpr)`, etc.).

## Gotchas

- `src/main.ts` MUST import `./style.css` — if that import is ever removed, the game
  silently loses all styling (default body margin causes scrollbars). A missing CSS
  asset in the `vite build` output is the symptom.
- Canvas bitmap size is set from `window.innerWidth`/`innerHeight`, not
  `canvas.clientWidth`/`clientHeight` (which can read as 0 before layout).
- Game world layers (`layer`/`solidLayer`/`bloodLayer`) are sized to the map, which is
  the screen size at load time times the "Bigger Map" upgrade scale, hard-capped at
  8192px per dimension. The world size is set once (on load/upgrade/reset), NOT
  re-scaled on window resize. On `resize` the camera `zoom` is scaled so the whole game
  tracks the window size (shrink the window and the game scales down; kept ≥ fit so the
  world never gets cropped). Physics/drawing code must use `worldW`/`worldH` bounds,
  never `canvas.width`/`canvas.height` (those are screen space). The camera
  (`camX`/`camY`/`zoom`) maps world to screen; UI hit-testing stays in device space.
- `index.html` should stay minimal: one canvas element, one module script tag.

## Updating this file

Keep AGENTS.md accurate as the project evolves. Update it when any of the following
change, in the same commit as the change itself:

- npm scripts or the build pipeline (add/remove/rename commands)
- project structure (new directories, moved entry points)
- coding conventions or TypeScript config constraints
- gotchas discovered while debugging (record the symptom and the fix)

Keep entries terse and actionable. If a section becomes stale, rewrite it rather than
appending corrections. When in doubt, run the documented commands to verify they still
match reality.