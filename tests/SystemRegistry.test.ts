import { describe, expect, it, vi } from 'vitest';
import { SystemRegistry } from '../src/core/Updatable';
import type { Updatable } from '../src/core/Updatable';
import type { GameContext } from '../src/core/GameContext';

// Mock GameContext
const createMockContext = (): GameContext => ({
    time: 0,
    delta: 0.016,
    playerPosition: { x: 0, y: 0, z: 0 } as any,
    currentRoomType: 0 as any,
    isRoomTransition: false,
});

describe('SystemRegistry', () => {
    it('should start with zero systems', () => {
        const registry = new SystemRegistry();
        expect(registry.count).toBe(0);
    });

    it('should add systems', () => {
        const registry = new SystemRegistry();
        const system: Updatable = { update: vi.fn() };

        registry.add(system);
        expect(registry.count).toBe(1);
    });

    it('should update all registered systems', () => {
        const registry = new SystemRegistry();
        const system1: Updatable = { update: vi.fn() };
        const system2: Updatable = { update: vi.fn() };

        registry.add(system1);
        registry.add(system2);

        const ctx = createMockContext();
        registry.updateAll(ctx);

        expect(system1.update).toHaveBeenCalledWith(ctx);
        expect(system2.update).toHaveBeenCalledWith(ctx);
    });

    it('should remove systems', () => {
        const registry = new SystemRegistry();
        const system: Updatable = { update: vi.fn() };

        registry.add(system);
        registry.remove(system);
        expect(registry.count).toBe(0);

        registry.updateAll(createMockContext());
        expect(system.update).not.toHaveBeenCalled();
    });

    it('should handle removing non-existent system gracefully', () => {
        const registry = new SystemRegistry();
        const system: Updatable = { update: vi.fn() };

        // Should not throw
        registry.remove(system);
        expect(registry.count).toBe(0);
    });
});
