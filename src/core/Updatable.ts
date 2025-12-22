// Updatable interface for systems that need per-frame updates

import type { GameContext } from './GameContext';

/**
 * Interface for systems that need to be updated each frame
 */
export interface Updatable {
    /**
     * Update the system
     * @param ctx - Game context with time and state info
     */
    update: (ctx: GameContext) => void;
}

/**
 * Simple registry for updatable systems
 */
export class SystemRegistry {
    private systems: Updatable[] = [];

    /**
     * Register a system for updates
     */
    add(system: Updatable): void {
        this.systems.push(system);
    }

    /**
     * Remove a system
     */
    remove(system: Updatable): void {
        const index = this.systems.indexOf(system);
        if (index !== -1) {
            this.systems.splice(index, 1);
        }
    }

    /**
     * Update all registered systems
     */
    updateAll(ctx: GameContext): void {
        for (const system of this.systems) {
            system.update(ctx);
        }
    }

    /**
     * Get number of registered systems
     */
    get count(): number {
        return this.systems.length;
    }
}
