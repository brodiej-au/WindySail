import { describe, it, expect } from 'vitest';
import { getWindAt, msToKnots, windComponentsToSpeedDir } from '../../src/routing/WindGrid';
import type { WindGridData } from '../../src/routing/types';

const grid: WindGridData = {
    lats: [-34, -33],
    lons: [151, 152],
    timestamps: [1000, 2000],
    windU: [[[5, 10], [5, 10]], [[5, 10], [5, 10]]],
    windV: [[[0, 0], [0, 0]], [[0, 0], [0, 0]]],
};

describe('msToKnots', () => {
    it('converts m/s to knots', () => {
        expect(msToKnots(1)).toBeCloseTo(1.94384);
        expect(msToKnots(10)).toBeCloseTo(19.4384);
        expect(msToKnots(0)).toBe(0);
    });
});

describe('windComponentsToSpeedDir', () => {
    it('pure east wind (u=10, v=0) comes from 270', () => {
        const result = windComponentsToSpeedDir(10, 0);
        expect(result.speed).toBeCloseTo(msToKnots(10));
        expect(result.direction).toBeCloseTo(270);
    });
    it('pure north wind (u=0, v=10) comes from 180', () => {
        const result = windComponentsToSpeedDir(0, 10);
        expect(result.speed).toBeCloseTo(msToKnots(10));
        expect(result.direction).toBeCloseTo(180);
    });
    it('pure south wind (u=0, v=-10) comes from 0', () => {
        const result = windComponentsToSpeedDir(0, -10);
        expect(result.speed).toBeCloseTo(msToKnots(10));
        expect(result.direction).toBeCloseTo(0);
    });
    it('calm wind', () => {
        const result = windComponentsToSpeedDir(0, 0);
        expect(result.speed).toBe(0);
    });
});

describe('getWindAt', () => {
    it('returns exact value at grid point and time', () => {
        const result = getWindAt(grid, 1000, -34, 151);
        expect(result.speed).toBeCloseTo(msToKnots(5));
        expect(result.direction).toBeCloseTo(270);
    });
    it('interpolates between timestamps', () => {
        const result = getWindAt(grid, 1500, -34, 151);
        expect(result.speed).toBeCloseTo(msToKnots(7.5));
    });
    it('interpolates spatially between grid points', () => {
        const result = getWindAt(grid, 1000, -33.5, 151.5);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });
    it('clamps to nearest grid point when outside bounds', () => {
        const result = getWindAt(grid, 1000, -35, 151);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });
    it('clamps time to bounds', () => {
        const result = getWindAt(grid, 500, -34, 151);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });
});

describe('getWindAt with varying spatial data', () => {
    const spatialGrid: WindGridData = {
        lats: [0, 1], lons: [0, 1], timestamps: [0],
        windU: [[[0], [10]], [[0], [10]]],
        windV: [[[0], [0]], [[0], [0]]],
    };
    it('interpolates u component spatially', () => {
        const result = getWindAt(spatialGrid, 0, 0, 0.5);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });
});
