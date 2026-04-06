import { describe, it, expect } from 'vitest';
import { getSpeed } from '../../src/routing/Polar';
import type { PolarData } from '../../src/routing/types';

const polar: PolarData = {
    name: 'Test Polar',
    twaAngles: [0, 30, 40, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180],
    twsSpeeds: [4, 6, 8, 10, 12, 14, 16, 20, 25],
    speeds: [
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [1.5, 2.8, 3.5, 4.0, 4.3, 4.5, 4.6, 4.6, 4.5],
        [2.5, 3.8, 4.8, 5.3, 5.6, 5.8, 5.9, 5.9, 5.8],
        [3.2, 4.5, 5.5, 6.2, 6.6, 6.8, 7.0, 7.0, 6.9],
        [3.5, 4.8, 5.8, 6.5, 7.0, 7.2, 7.4, 7.4, 7.3],
        [3.8, 5.2, 6.2, 6.8, 7.3, 7.5, 7.7, 7.8, 7.7],
        [3.9, 5.3, 6.3, 7.0, 7.5, 7.8, 8.0, 8.2, 8.1],
        [3.8, 5.2, 6.2, 6.9, 7.4, 7.7, 8.0, 8.5, 8.6],
        [3.6, 5.0, 6.0, 6.7, 7.2, 7.5, 7.8, 8.3, 8.5],
        [3.2, 4.5, 5.5, 6.2, 6.7, 7.0, 7.3, 7.8, 8.0],
        [2.6, 3.8, 4.8, 5.5, 6.0, 6.3, 6.5, 7.0, 7.2],
        [2.0, 3.2, 4.2, 4.8, 5.3, 5.6, 5.8, 6.3, 6.5],
        [1.5, 2.5, 3.5, 4.2, 4.6, 4.9, 5.1, 5.5, 5.7],
    ],
};

describe('getSpeed', () => {
    it('returns exact value at grid point', () => { expect(getSpeed(polar, 90, 10)).toBeCloseTo(7.0); });
    it('returns 0 at TWA=0', () => { expect(getSpeed(polar, 0, 10)).toBe(0); });
    it('interpolates between TWS grid points', () => { expect(getSpeed(polar, 90, 9)).toBeCloseTo(6.65); });
    it('interpolates between TWA grid points', () => { expect(getSpeed(polar, 85, 10)).toBeCloseTo(6.933, 1); });
    it('bilinear interpolation', () => {
        const result = getSpeed(polar, 85, 9);
        expect(result).toBeGreaterThan(6.2);
        expect(result).toBeLessThan(7.0);
    });
    it('handles symmetric TWA (270 = 90)', () => { expect(getSpeed(polar, 270, 10)).toBeCloseTo(getSpeed(polar, 90, 10)); });
    it('handles TWA > 180 via symmetry', () => { expect(getSpeed(polar, 200, 10)).toBeCloseTo(getSpeed(polar, 160, 10)); });
    it('returns 0 for TWS=0', () => { expect(getSpeed(polar, 90, 0)).toBe(0); });
    it('clamps TWS below minimum', () => {
        const result = getSpeed(polar, 90, 2);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(getSpeed(polar, 90, 4));
    });
    it('clamps TWS above maximum', () => { expect(getSpeed(polar, 90, 30)).toBeCloseTo(getSpeed(polar, 90, 25)); });
});
