import { describe, expect, it } from 'vitest';
import { PERFORMANCE, ROOM_SKY, WORLD } from '../src/config/constants';
import { FA_RIFT, riftLineXForWorldX, ROOM_CONFIGS, RoomType } from '../src/world/RoomConfig';
import {
    celestialDiscDirection,
    ROOM_SKY_MODE,
    roomSkyMode,
    skyPalette,
    skySeamXForPlayerX,
    swapFlickerVisible,
} from '../src/world/RoomSky';

const ALL_ROOMS = [
    RoomType.INFO_OVERFLOW,
    RoomType.FORCED_ALIGNMENT,
    RoomType.IN_BETWEEN,
    RoomType.POLARIZED,
];

describe('roomSkyMode', () => {
    it('maps each room to its own sky treatment', () => {
        expect(roomSkyMode(RoomType.INFO_OVERFLOW)).toBe(ROOM_SKY_MODE.SPECKS);
        expect(roomSkyMode(RoomType.FORCED_ALIGNMENT)).toBe(ROOM_SKY_MODE.LEDGER);
        expect(roomSkyMode(RoomType.IN_BETWEEN)).toBe(ROOM_SKY_MODE.TWIN_DISCS);
        expect(roomSkyMode(RoomType.POLARIZED)).toBe(ROOM_SKY_MODE.SPLIT);
    });

    it('is bijective: four rooms, four distinct modes', () => {
        const modes = new Set(ALL_ROOMS.map(roomSkyMode));
        expect(modes.size).toBe(4);
    });
});

describe('skySeamXForPlayerX', () => {
    it('agrees with riftLineXForWorldX (single conversion source for seam x)', () => {
        for (const x of [-201, -80, -41, -39, 0, 39, 41, 80, 123.4]) {
            expect(skySeamXForPlayerX(x)).toBe(riftLineXForWorldX(x));
        }
    });

    it('snaps to the nearest chunk-column center (the floor seam line)', () => {
        const size = WORLD.CHUNK_SIZE;
        expect(skySeamXForPlayerX(0)).toBe(0);
        expect(skySeamXForPlayerX(size * 0.49)).toBe(0);
        expect(skySeamXForPlayerX(size * 0.51)).toBe(size);
        expect(skySeamXForPlayerX(-size * 0.51)).toBe(-size);
    });
});

describe('swapFlickerVisible', () => {
    it('hides on odd counts and shows on even counts', () => {
        expect(swapFlickerVisible(3)).toBe(false);
        expect(swapFlickerVisible(2)).toBe(true);
        expect(swapFlickerVisible(1)).toBe(false);
        expect(swapFlickerVisible(0)).toBe(true);
    });

    it('the configured countdown ends hidden, so the settle-visible frame reads as the swap landing', () => {
        // Counting SWAP_FLICKER_FRAMES..1 must both start and end hidden
        // (off/on/off), which requires an odd frame count.
        expect(ROOM_SKY.SWAP_FLICKER_FRAMES % 2).toBe(1);
        expect(swapFlickerVisible(ROOM_SKY.SWAP_FLICKER_FRAMES)).toBe(false);
        expect(swapFlickerVisible(1)).toBe(false);
    });
});

describe('celestialDiscDirection', () => {
    it('returns a unit vector', () => {
        for (const [az, el] of [[0, 0], [0.7, 0.62], [-1.2, 0.3], [3.0, 1.2]]) {
            const [x, y, z] = celestialDiscDirection(az, el);
            expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
        }
    });

    it('elevation lifts y; azimuth 0 points +z', () => {
        const [x0, y0, z0] = celestialDiscDirection(0, 0);
        expect(x0).toBeCloseTo(0, 12);
        expect(y0).toBeCloseTo(0, 12);
        expect(z0).toBeCloseTo(1, 12);
        const [, yUp] = celestialDiscDirection(0.5, Math.PI / 2);
        expect(yUp).toBeCloseTo(1, 12);
    });

    it('the configured twin discs are offset by roughly the misregister angle', () => {
        const a = celestialDiscDirection(ROOM_SKY.DISC_AZIMUTH, ROOM_SKY.DISC_ELEVATION);
        const b = celestialDiscDirection(
            ROOM_SKY.DISC_AZIMUTH + ROOM_SKY.DISC_OFFSET_AZIMUTH,
            ROOM_SKY.DISC_ELEVATION + ROOM_SKY.DISC_OFFSET_ELEVATION,
        );
        const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        const angle = Math.acos(Math.min(1, dot));
        // Misregistered, not detached: the two plates must OVERLAP — offset
        // smaller than the disc diameter but clearly nonzero.
        expect(angle).toBeGreaterThan(0.005);
        expect(angle).toBeLessThan(2 * ROOM_SKY.DISC_ANGULAR_RADIUS);
    });
});

describe('skyPalette', () => {
    it('day uses the room\'s own RoomConfig ink/paper', () => {
        for (const room of ALL_ROOMS) {
            const { ink, paper } = skyPalette(room, true);
            expect(ink).toEqual(ROOM_CONFIGS[room].shader.inkColor);
            expect(paper).toEqual(ROOM_CONFIGS[room].shader.paperColor);
        }
    });

    it('night hard-swaps the roles (polarity-stable under the global inversion)', () => {
        for (const room of ALL_ROOMS) {
            const { ink, paper } = skyPalette(room, false);
            expect(ink).toEqual(ROOM_CONFIGS[room].shader.paperColor);
            expect(paper).toEqual(ROOM_CONFIGS[room].shader.inkColor);
        }
    });
});

describe('rOOM_SKY config', () => {
    it('keeps the dome inside the camera far plane even at the rift bottom', () => {
        // Camera far is 1000 (SceneSetup); the deepest camera position is the
        // rift fall (FA_RIFT.FOG.BOTTOM), and the dome follows x/z only.
        expect(ROOM_SKY.RADIUS + Math.abs(FA_RIFT.FOG.BOTTOM)).toBeLessThan(1000);
    });

    it('keeps the dome beyond the fog horizon and the loaded-world footprint', () => {
        expect(ROOM_SKY.RADIUS).toBeGreaterThan(PERFORMANCE.FOG_FAR);
        // Loaded world reaches (RENDER_DISTANCE + 1) chunks in any direction.
        expect(ROOM_SKY.RADIUS).toBeGreaterThan((WORLD.RENDER_DISTANCE + 1) * WORLD.CHUNK_SIZE);
    });

    it('keeps the speck field sparse and the marks hard-drawable', () => {
        expect(ROOM_SKY.SPECK_FILL).toBeGreaterThan(0);
        expect(ROOM_SKY.SPECK_FILL).toBeLessThan(0.5);
        expect(ROOM_SKY.SPECK_SIZE).toBeGreaterThan(0);
        expect(ROOM_SKY.SPECK_SIZE).toBeLessThanOrEqual(1);
        expect(ROOM_SKY.LINE_THICKNESS).toBeGreaterThan(0);
        expect(ROOM_SKY.LINE_THICKNESS).toBeLessThan(0.5);
        expect(ROOM_SKY.DISC_ANGULAR_RADIUS).toBeGreaterThan(0);
        expect(ROOM_SKY.DISC_ANGULAR_RADIUS).toBeLessThan(Math.PI / 4);
    });
});
