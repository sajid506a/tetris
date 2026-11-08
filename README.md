# Tetris — Poster Edition

A keyboard Tetris game built with TypeScript and Canvas 2D. Ten columns, twenty rows, seven shapes, one hold slot. No frameworks, no game engine.

Play: https://sajid506a.github.io/tetris/

## Controls

| Key | Action |
| --- | --- |
| `←` `→` or `A` `D` | Move |
| `↑`, `W`, or `X` | Rotate clockwise |
| `Z` | Rotate counter-clockwise |
| `↓` or `S` | Soft drop |
| `Space` | Hard drop |
| `C` | Hold |
| `P` or `Escape` | Pause |
| `R` | Restart |

## Scoring

- Single / double / triple / tetris: 100 / 300 / 500 / 800 × level
- Soft drop: 1 point per row
- Hard drop: 2 points per row
- Level rises every 10 lines; gravity speeds up to a floor of 90 ms per row

The best score is saved in `localStorage`.

## Local development

```sh
bun install
bun run dev
```

Open http://localhost:3001. The dev server compiles `src/game.ts` when `/bundle.js` is requested, so a page reload picks up source changes.

## Static build

```sh
bun run build
```

This writes `bundle.js` next to `index.html`. GitHub Pages serves `index.html`, `bundle.js`, and `fonts/` straight from the `master` branch, so the built bundle is committed.

## Layout

- `index.html`, `bundle.js`, `fonts/` — the deployed site
- `src/game.ts` — game loop, input, rendering
- `src/pieces.ts` — shapes, 7-bag randomizer data, palette
- `src/types.ts` — shared types
- `index.ts` — local development server
