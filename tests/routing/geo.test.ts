import { describe, it, expect } from 'vitest';
import {
    normaliseAngle,
    toRadians,
    toDegrees,
    distance,
    bearing,
    advancePosition,
    computeTWA,
} from '../../src/routing/geo';

describe('normaliseAngle', () => {
    it('returns angle unchanged when 0-360', () => {
        expect(normaliseAngle(180)).toBe(180);
        expect(normaliseAngle(0)).toBe(0);
        expect(normaliseAngle(359.9)).toBeCloseTo(359.9);
    });
    it('wraps negative angles', () => {
        expect(normaliseAngle(-10)).toBeCloseTo(350);
        expect(normaliseAngle(-180)).toBeCloseTo(180);
        expect(normaliseAngle(-360)).toBeCloseTo(0);
    });
    it('wraps angles above 360', () => {
        expect(normaliseAngle(370)).toBeCloseTo(10);
        expect(normaliseAngle(720)).toBeCloseTo(0);
    });
});

describe('toRadians / toDegrees', () => {
    it('converts degrees to radians', () => {
        expect(toRadians(180)).toBeCloseTo(Math.PI);
        expect(toRadians(90)).toBeCloseTo(Math.PI / 2);
        expect(toRadians(0)).toBe(0);
    });
    it('converts radians to degrees', () => {
        expect(toDegrees(Math.PI)).toBeCloseTo(180);
        expect(toDegrees(Math.PI / 2)).toBeCloseTo(90);
    });
    it('round-trips', () => {
        expect(toDegrees(toRadians(123.456))).toBeCloseTo(123.456);
    });
});

describe('distance', () => {
    it('computes distance between Sydney and Mooloolaba (~430nm)', () => {
        const sydney = { lat: -33.626, lon: 151.31 };
        const mooloolaba = { lat: -26.68, lon: 153.13 };
        const d = distance(sydney, mooloolaba);
        expect(d).toBeGreaterThan(408);
        expect(d).toBeLessThan(452);
    });
    it('returns 0 for same point', () => {
        const p = { lat: -33.626, lon: 151.31 };
        expect(distance(p, p)).toBeCloseTo(0, 1);
    });
    it('computes short coastal distance (~10nm)', () => {
        const a = { lat: -33.85, lon: 151.27 };
        const b = { lat: -33.7, lon: 151.3 };
        const d = distance(a, b);
        expect(d).toBeGreaterThan(8);
        expect(d).toBeLessThan(12);
    });
});

describe('bearing', () => {
    it('computes bearing due north', () => {
        expect(bearing({ lat: -34, lon: 151 }, { lat: -33, lon: 151 })).toBeCloseTo(0, 0);
    });
    it('computes bearing due east', () => {
        expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90, 0);
    });
    it('computes bearing due south', () => {
        expect(bearing({ lat: -33, lon: 151 }, { lat: -34, lon: 151 })).toBeCloseTo(180, 0);
    });
    it('computes bearing due west', () => {
        expect(bearing({ lat: 0, lon: 1 }, { lat: 0, lon: 0 })).toBeCloseTo(270, 0);
    });
});

describe('advancePosition', () => {
    it('advances north by 60nm equals ~1 degree lat', () => {
        const result = advancePosition(-34.0, 151.0, 0, 60);
        expect(result.lat).toBeCloseTo(-33.0, 0);
        expect(result.lon).toBeCloseTo(151.0, 0);
    });
    it('advances east along equator by 60nm equals ~1 degree lon', () => {
        const result = advancePosition(0, 100, 90, 60);
        expect(result.lat).toBeCloseTo(0, 0);
        expect(result.lon).toBeCloseTo(101, 0);
    });
    it('returns same point for 0 distance', () => {
        const result = advancePosition(-33.5, 151.2, 45, 0);
        expect(result.lat).toBeCloseTo(-33.5);
        expect(result.lon).toBeCloseTo(151.2);
    });
});

describe('computeTWA', () => {
    it('head-to-wind is 0', () => { expect(computeTWA(180, 180)).toBeCloseTo(0); });
    it('running downwind is 180', () => { expect(computeTWA(180, 0)).toBeCloseTo(180); });
    it('beam reach is 90', () => { expect(computeTWA(0, 270)).toBeCloseTo(90); });
    it('is always 0-180 regardless of tack', () => {
        expect(computeTWA(90, 0)).toBeCloseTo(computeTWA(270, 0));
    });
    it('close hauled ~45 degrees', () => { expect(computeTWA(45, 0)).toBeCloseTo(45); });
});
