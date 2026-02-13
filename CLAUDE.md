# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**1bit (1-Bit Chimera Void)** is an interactive 3D experience built with Three.js and TypeScript. It combines procedural world generation, 1-bit dithering aesthetics, and narrative game mechanics exploring psychological themes through a first-person exploration of procedurally-generated "chimera ruins." Fully client-side with no backend.

## Commands

```bash
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Type check + production build
npm run typecheck    # TypeScript checking only
npm run test         # Run tests once (vitest run)
npm run test:watch   # Watch mode (vitest)
```

Run a single test file: `npx vitest run tests/GazeMechanic.test.ts`

## Code Style

- ESLint via `@antfu/eslint-config`: **4-space indents, single quotes, semicolons required**
- No Prettier — ESLint handles all formatting
- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- Disabled rules: `no-console`, `no-new` (Three.js patterns), `style/max-statements-per-line` (shader code)

## Architecture

### Domain Structure

| Directory | Purpose |
|-----------|---------|
| `core/` | Scene setup, game context, signal system, system registry, post-processing |
| `config/` | All gameplay constants and thresholds (single source of truth) |
| `player/` | Player controls, hand model, flower prop, gaze/override mechanics |
| `world/` | Chunk management, building/flora factories, cables, sky eye, weather, day/night |
| `audio/` | AudioController (business logic) + AudioEngine (Web Audio API wrapper) |
| `shaders/` | DitherShader — 1-bit dithering, edge detection, weather overlays |
| `stats/` | Behavior tracking, snapshot generation, sunset overlay display |
| `state/` | Game save/load via localStorage |
| `types/` | Modular type definitions with unified re-export via `index.ts` |
| `utils/` | Hash, dispose, object pool, screenshot |

### Key Patterns

**System Registry** (`core/Updatable.ts`): All per-frame systems implement the `Updatable` interface and register with `SystemRegistry`. Each receives a `GameContext` (time, delta, player position, room type) on every frame.

**Signal-based communication** (`core/Signal.ts`): Lightweight pub/sub for decoupled inter-system events. Systems emit signals rather than calling each other directly.

**Manager orchestration** (`player/PlayerManager.ts`): High-level managers compose subsystems (Controls, HandsModel, GazeMechanic, OverrideMechanic) and wire them together.

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

Tests live in `tests/` and cover pure logic: hash utilities, GazeMechanic (27 cases), RunStatsCollector, StateSnapshotGenerator, Signal, config validation, SystemRegistry. Test strategy focuses on logic separation — pure functions over mocked Three.js scenes.

## Dependencies

Single production dependency: `three` (^0.173.0). All audio is procedurally generated via Web Audio API — no audio files or synthesis libraries.
