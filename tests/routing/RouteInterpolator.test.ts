import { describe, it, expect } from 'vitest';
import { interpolateAtTime, lerp, lerpAngle } from '../../src/routing/RouteInterpolator';
import type { RoutePoint } from '../../src/routing/types';

function makePoint(overrides: Partial<RoutePoint> & { time: number }): RoutePoint {
    return {
        lat: 0,
        lon: 0,
        twa: 45,
        tws: 10,
        twd: 180,
        boatSpeed: 5,
        heading: 90,
        ...overrides,
    };
}

describe('lerp', () => {
    it('returns a at t=0', () => {
        expect(lerp(10, 20, 0)).toBeCloseTo(10);
    });
    it('returns b at t=1', () => {
        expect(lerp(10, 20, 1)).toBeCloseTo(20);
    });
    it('returns midpoint at t=0.5', () => {
        expect(lerp(10, 20, 0.5)).toBeCloseTo(15);
    });
});

describe('lerpAngle', () => {
    it('interpolates normally within 0-180', () => {
        expect(lerpAngle(10, 30, 0.5)).toBeCloseTo(20);
    });
    it('wraps from 350 to 10 through 0 (not backwards through 180)', () => {
        // delta = 10 - 350 = -340, adjusted to +20, at t=0.5 => 350 + 10 = 360 => 0
        expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0);
    });
    it('wraps from 5 to 355 through 360 (shortest arc counterclockwise)', () => {
        // delta = 355 - 5 = 350, adjusted to -10, at t=0.5 => 5 - 5 = 0
        expect(lerpAngle(5, 355, 0.5)).toBeCloseTo(0);
    });
    it('returns a at t=0', () => {
        expect(lerpAngle(90, 270, 0)).toBeCloseTo(90);
    });
    it('returns b at t=1', () => {
        expect(lerpAngle(90, 270, 1)).toBeCloseTo(270);
    });
});

describe('interpolateAtTime', () => {
    describe('empty path', () => {
        it('returns null for empty path', () => {
            expect(interpolateAtTime([], 1000)).toBeNull();
        });
    });

    describe('single point', () => {
        it('returns that point for any time before it', () => {
            const p = makePoint({ time: 1000, lat: 10, lon: 20, twa: 60, tws: 12 });
            const result = interpolateAtTime([p], 500);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(10);
            expect(result!.lon).toBeCloseTo(20);
            expect(result!.twa).toBeCloseTo(60);
            expect(result!.tws).toBeCloseTo(12);
        });
        it('returns that point for any time after it', () => {
            const p = makePoint({ time: 1000, lat: 10, lon: 20 });
            const result = interpolateAtTime([p], 5000);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(10);
        });
        it('returns that point at its exact time', () => {
            const p = makePoint({ time: 1000, lat: 10, lon: 20 });
            const result = interpolateAtTime([p], 1000);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(10);
        });
    });

    describe('time before start', () => {
        it('returns first point values', () => {
            const p1 = makePoint({ time: 1000, lat: 10, lon: 20, boatSpeed: 5 });
            const p2 = makePoint({ time: 2000, lat: 11, lon: 21, boatSpeed: 7 });
            const result = interpolateAtTime([p1, p2], 500);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(10);
            expect(result!.lon).toBeCloseTo(20);
            expect(result!.boatSpeed).toBeCloseTo(5);
            expect(result!.time).toBe(1000);
        });
    });

    describe('time after end', () => {
        it('returns last point values', () => {
            const p1 = makePoint({ time: 1000, lat: 10, lon: 20, boatSpeed: 5 });
            const p2 = makePoint({ time: 2000, lat: 11, lon: 21, boatSpeed: 7 });
            const result = interpolateAtTime([p1, p2], 9999);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(11);
            expect(result!.lon).toBeCloseTo(21);
            expect(result!.boatSpeed).toBeCloseTo(7);
            expect(result!.time).toBe(2000);
        });
    });

    describe('exact midpoint between two points', () => {
        it('interpolates lat, lon, twa, tws, boatSpeed linearly', () => {
            const p1 = makePoint({
                time: 0,
                lat: 0,
                lon: 0,
                twa: 40,
                tws: 10,
                boatSpeed: 4,
                twd: 90,
                heading: 90,
            });
            const p2 = makePoint({
                time: 2000,
                lat: 2,
                lon: 4,
                twa: 60,
                tws: 20,
                boatSpeed: 8,
                twd: 110,
                heading: 110,
            });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(1);
            expect(result!.lon).toBeCloseTo(2);
            expect(result!.twa).toBeCloseTo(50);
            expect(result!.tws).toBeCloseTo(15);
            expect(result!.boatSpeed).toBeCloseTo(6);
            expect(result!.time).toBe(1000);
        });
        it('interpolates twd and heading at midpoint', () => {
            const p1 = makePoint({ time: 0, twd: 90, heading: 45 });
            const p2 = makePoint({ time: 2000, twd: 110, heading: 85 });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result).not.toBeNull();
            expect(result!.twd).toBeCloseTo(100);
            expect(result!.heading).toBeCloseTo(65);
        });
    });

    describe('between segments in a 3-point path', () => {
        it('uses the correct segment (p2 to p3)', () => {
            const p1 = makePoint({ time: 0, lat: 0, lon: 0 });
            const p2 = makePoint({ time: 1000, lat: 1, lon: 1 });
            const p3 = makePoint({ time: 2000, lat: 3, lon: 5 });
            // At t=1500, we're halfway between p2 and p3
            const result = interpolateAtTime([p1, p2, p3], 1500);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(2);
            expect(result!.lon).toBeCloseTo(3);
            expect(result!.time).toBe(1500);
        });
        it('uses the correct segment (p1 to p2)', () => {
            const p1 = makePoint({ time: 0, lat: 0, lon: 0 });
            const p2 = makePoint({ time: 1000, lat: 2, lon: 4 });
            const p3 = makePoint({ time: 2000, lat: 3, lon: 5 });
            // At t=500, halfway between p1 and p2
            const result = interpolateAtTime([p1, p2, p3], 500);
            expect(result).not.toBeNull();
            expect(result!.lat).toBeCloseTo(1);
            expect(result!.lon).toBeCloseTo(2);
        });
    });

    describe('angle wrapping — twd', () => {
        it('goes through 0° when twd goes from 350 to 10', () => {
            const p1 = makePoint({ time: 0, twd: 350, heading: 0 });
            const p2 = makePoint({ time: 2000, twd: 10, heading: 0 });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result).not.toBeNull();
            // Midpoint should be 0 (not 180)
            expect(result!.twd).toBeCloseTo(0);
        });
        it('goes forward from 10 to 350 through 0 (shortest arc)', () => {
            const p1 = makePoint({ time: 0, twd: 10, heading: 0 });
            const p2 = makePoint({ time: 2000, twd: 350, heading: 0 });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result).not.toBeNull();
            // Midpoint should be 0 (not 180)
            expect(result!.twd).toBeCloseTo(0);
        });
    });

    describe('angle wrapping — heading', () => {
        it('goes through 360 when heading goes from 5 to 355', () => {
            const p1 = makePoint({ time: 0, heading: 5, twd: 180 });
            const p2 = makePoint({ time: 2000, heading: 355, twd: 180 });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result).not.toBeNull();
            // Shortest arc from 5 to 355 is -10 degrees (counterclockwise), midpoint is 0
            expect(result!.heading).toBeCloseTo(0);
        });
        it('interpolates heading going clockwise from 350 to 370 (10)', () => {
            const p1 = makePoint({ time: 0, heading: 350, twd: 180 });
            const p2 = makePoint({ time: 2000, heading: 10, twd: 180 });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result).not.toBeNull();
            // Going from 350 to 10 clockwise (+20 deg), midpoint is 360 => 0
            expect(result!.heading).toBeCloseTo(0);
        });
    });

    describe('exact boundary times', () => {
        it('returns first point at exact start time', () => {
            const p1 = makePoint({ time: 1000, lat: 5 });
            const p2 = makePoint({ time: 2000, lat: 10 });
            const result = interpolateAtTime([p1, p2], 1000);
            expect(result!.lat).toBeCloseTo(5);
            expect(result!.time).toBe(1000);
        });
        it('returns last point at exact end time', () => {
            const p1 = makePoint({ time: 1000, lat: 5 });
            const p2 = makePoint({ time: 2000, lat: 10 });
            const result = interpolateAtTime([p1, p2], 2000);
            expect(result!.lat).toBeCloseTo(10);
            expect(result!.time).toBe(2000);
        });
    });
});
