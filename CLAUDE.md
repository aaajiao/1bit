# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**1bit (1-Bit Chimera Void)** is an interactive 3D experience built with Three.js and TypeScript. It combines procedural world generation, 1-bit dithering aesthetics, and narrative game mechanics exploring psychological themes through a first-person exploration of procedurally-generated "chimera ruins." Fully client-side with no backend.

## Commands

Package manager is **Bun**. Install dependencies with `bun install`.

```bash
bun run dev          # Vite dev server (localhost:5173)
bun run build        # Type check + production build
bun run typecheck    # TypeScript checking only
bun run test         # Run tests once (vitest run)
bun run test:watch   # Watch mode (vitest)
```

Run a single test file: `bunx vitest run tests/GazeMechanic.test.ts`


## Code Style

- ESLint via `@antfu/eslint-config`: **4-space indents, single quotes, semicolons required**
- No Prettier — ESLint handles all formatting
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Disabled rules: `no-console`, `no-new` (Three.js patterns), `style/max-statements-per-line` (shader code)

## Architecture

### Domain Structure

| Directory | Purpose |
|-----------|---------|
| `core/` | Scene setup, post-processing, and the per-frame update helpers `main.ts` calls (cable-audio proximity, shader-uniform sync) |
| `config/` | All gameplay constants and thresholds (single source of truth) |
| `player/` | Player controls, hand model, flower prop, gaze/override mechanics |
| `world/` | Chunk management, building/flora factories, cables, sky eye, weather, day/night |
| `audio/` | AudioController (business logic) + AudioEngine (Web Audio API wrapper) |
| `shaders/` | DitherShader — 1-bit dithering, edge detection, weather overlays |
| `stats/` | Behavior tracking, snapshot generation, sunset overlay display |
| `types/` | Modular type definitions with unified re-export via `index.ts` |
| `utils/` | Hash, dispose, screenshot |

### Key Patterns

**Manual orchestration in `main.ts`** (`ChimeraVoid`): There is no central registry or event bus. The `ChimeraVoid` class owns every system as a field, instantiates them in its constructor, and calls each one's `update()` by hand inside `animate()`. It threads the shared per-frame state — `delta`, elapsed time `t`, the freshly-updated player position, and the current `RoomType` — into each `update()` call explicitly, in a fixed order (player first so every consumer sees this frame's position).

**Manager orchestration** (`player/PlayerManager.ts`): High-level managers compose subsystems (Controls, HandsModel, GazeMechanic, OverrideMechanic) and wire them together, exposing a single `update()` to `main.ts`.

**Room-based state** (`world/RoomConfig.ts`): World position maps to one of four `RoomType` values (INFO_OVERFLOW, FORCED_ALIGNMENT, IN_BETWEEN, POLARIZED), each driving distinct shader parameters and audio behavior.

**Centralized config** (`config/constants.ts`): All magic numbers live here — gameplay thresholds, cable proximity ranges, performance LOD distances, gaze intensity curves, etc. No hardcoded values in system files.

### Entry Point & Render Loop

`src/main.ts` contains the `ChimeraVoid` class which:
1. Initializes scene, camera, renderer, post-processing
2. Creates all systems (player, world, audio, weather, stats)
3. Runs the `animate()` loop: updates all systems, detects room transitions, updates shader uniforms, renders via post-processing composer

### Shader System

`src/shaders/DitherShader.ts` is the core visual identity — a post-processing shader with 32+ uniforms controlling: 4x4/8x8 Bayer dithering, Sobel edge detection, weather effects (static/rain/glitch), room-specific contrast/noise, day/night color inversion, and override feedback.

### Chunk-Based World

`ChunkManager` handles infinite terrain with 80-unit chunks and 2-chunk render distance. Generation is deterministic via hash-based seeding from chunk coordinates. Buildings come in 4 procedural styles (TREE, SPIKES, BLOCKS, FLUID) with LOD-based animation.

## Development Rules (from ARCHITECTURE.md)

- **One system per file** — never put business logic in `main.ts`
- **main.ts does only three things**: import systems, instantiate in constructor, call update in animate()
- Keep `main.ts` under 300 lines; extract to new system files when approaching limit
- New features go in their domain folder (`world/`, `player/`, `audio/`, etc.)
- Shared types go in `types/`; module-private types stay in-file

## Testing

Tests live in `tests/` and cover pure logic: hash utilities, GazeMechanic (27 cases), RunStatsCollector, StateSnapshotGenerator, and config validation. Test strategy focuses on logic separation — pure functions over mocked Three.js scenes.

## Dependencies

Single production dependency: `three` (^0.173.0). All audio is procedurally generated via Web Audio API — no audio files or synthesis libraries.
