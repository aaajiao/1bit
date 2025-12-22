// Game State Management
// Save and load game state to localStorage

import { RoomType } from '../world/RoomConfig';

/**
 * Saveable game state
 */
export interface GameState {
    // Meta
    version: number;
    savedAt: number;

    // Player
    player: {
        x: number;
        y: number;
        z: number;
        flowerIntensity: number;
    };

    // World
    world: {
        currentRoom: RoomType;
        timeOfDay: number;
    };

    // Stats
    stats: {
        totalGazeTime: number;
        overrideCount: number;
        totalDistance: number;
        sessionDuration: number;
    };
}

const STORAGE_KEY = '1bit-chimera-state';
const STATE_VERSION = 1;

/**
 * Manages game state persistence
 */
export class GameStateManager {
    private state: GameState;

    constructor() {
        this.state = this.createDefaultState();
    }

    /**
     * Create default/initial state
     */
    private createDefaultState(): GameState {
        return {
            version: STATE_VERSION,
            savedAt: Date.now(),
            player: {
                x: 0,
                y: 2,
                z: 0,
                flowerIntensity: 0.5,
            },
            world: {
                currentRoom: RoomType.INFO_OVERFLOW,
                timeOfDay: 0,
            },
            stats: {
                totalGazeTime: 0,
                overrideCount: 0,
                totalDistance: 0,
                sessionDuration: 0,
            },
        };
    }

    /**
     * Update player state
     */
    updatePlayer(x: number, y: number, z: number, flowerIntensity: number): void {
        this.state.player = { x, y, z, flowerIntensity };
    }

    /**
     * Update world state
     */
    updateWorld(currentRoom: RoomType, timeOfDay: number): void {
        this.state.world = { currentRoom, timeOfDay };
    }

    /**
     * Update stats
     */
    updateStats(gazeTime: number, overrideCount: number, distance: number, duration: number): void {
        this.state.stats = {
            totalGazeTime: gazeTime,
            overrideCount,
            totalDistance: distance,
            sessionDuration: duration,
        };
    }

    /**
     * Save state to localStorage
     */
    save(): boolean {
        try {
            this.state.savedAt = Date.now();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            console.log('[GameState] Saved successfully');
            return true;
        }
        catch (e) {
            console.error('[GameState] Save failed:', e);
            return false;
        }
    }

    /**
     * Load state from localStorage
     */
    load(): boolean {
        try {
            const json = localStorage.getItem(STORAGE_KEY);
            if (!json) {
                console.log('[GameState] No saved state found');
                return false;
            }

            const loaded = JSON.parse(json) as GameState;

            // Version check
            if (loaded.version !== STATE_VERSION) {
                console.warn('[GameState] Version mismatch, using defaults');
                return false;
            }

            this.state = loaded;
            console.log('[GameState] Loaded successfully');
            return true;
        }
        catch (e) {
            console.error('[GameState] Load failed:', e);
            return false;
        }
    }

    /**
     * Clear saved state
     */
    clear(): void {
        localStorage.removeItem(STORAGE_KEY);
        this.state = this.createDefaultState();
        console.log('[GameState] Cleared');
    }

    /**
     * Get current state (readonly copy)
     */
    getState(): Readonly<GameState> {
        return { ...this.state };
    }

    /**
     * Check if a saved state exists
     */
    hasSavedState(): boolean {
        return localStorage.getItem(STORAGE_KEY) !== null;
    }

    /**
     * Export state as JSON string (for file download)
     */
    exportAsJSON(): string {
        return JSON.stringify(this.state, null, 2);
    }

    /**
     * Import state from JSON string
     */
    importFromJSON(json: string): boolean {
        try {
            const imported = JSON.parse(json) as GameState;
            if (imported.version !== STATE_VERSION) {
                console.warn('[GameState] Import version mismatch');
                return false;
            }
            this.state = imported;
            return true;
        }
        catch {
            console.error('[GameState] Import failed');
            return false;
        }
    }
}
