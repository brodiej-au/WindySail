import { describe, it, expect } from 'vitest';
import { expandFrontier, pruneToSectors, traceRoute, checkArrival } from '../../src/routing/IsochroneRouter';
import type { IsochronePoint, LatLon, PolarData, WindGridData } from '../../src/routing/types';

const simplePolar: PolarData = {
    name: 'Test',
    twaAngles: [0, 45, 90, 135, 180],
    twsSpeeds: [10],
    speeds: [[0], [5], [7], [6], [4]],
};

// Uniform 10m/s southerly wind (from 180°) across a 4x4 grid, single timestamp
function makeUniformWindGrid(): WindGridData {
    const lats = [-36, -35, -34, -33];
    const lons = [150, 151, 152, 153];
    const timestamps = [0];
    // Wind FROM south (180°): blows northward, so u=0, v=+10
    // windComponentsToSpeedDir(0, 10) uses atan2(-0, -10) = PI → 180°. Correct.
    const windU: number[][][] = lats.map(() => lons.map(() => [0]));
    const windV: number[][][] = lats.map(() => lons.map(() => [10]));
    return { lats, lons, timestamps, windU, windV };
}

describe('expandFrontier', () => {
    it('generates candidate points in all headings', () => {
        const start: IsochronePoint = {
            lat: -34, lon: 151, parent: null,
            twa: 0, tws: 0, twd: 0, boatSpeed: 0, heading: 0, time: 0,
        };
        const windGrid = makeUniformWindGrid();
        const candidates = expandFrontier([start], windGrid, simplePolar, 1, 0);
        expect(candidates.length).toBe(72); // 360/5 = 72 headings
    });

    it('candidates with head-to-wind TWA have 0 boat speed', () => {
        const start: IsochronePoint = {
            lat: -34, lon: 151, parent: null,
            twa: 0, tws: 0, twd: 0, boatSpeed: 0, heading: 0, time: 0,
        };
        const windGrid = makeUniformWindGrid();
        const candidates = expandFrontier([start], windGrid, simplePolar, 1, 0);
        // Wind from 180°. Heading 180° = sailing into wind = TWA 0 = speed 0
        const headToWind = candidates.find(c => c.heading === 180);
        expect(headToWind).toBeDefined();
        expect(headToWind!.boatSpeed).toBe(0);
    });
});

describe('motorboat mode', () => {
    it('uses cruise speed in calm swell, ignoring polar', () => {
        const polar = { name: 'unused', twaAngles: [0, 180], twsSpeeds: [0, 30], speeds: [[0, 0], [0, 0]] };
        const windGrid = makeUniformWindGrid();
        const frontier = [{ lat: -34, lon: 151, parent: null as number | null, twa: 0, tws: 0, twd: 0, boatSpeed: 0, heading: 0, time: 0, isMotoring: false, sog: 0 }];
        const out = expandFrontier(frontier as any, windGrid, polar as any, 1, 0, {
            motorboat: { enabled: true, cruiseKt: 7, heavyKt: 5, swellThresholdM: 2.5 },
        });
        expect(out[0].boatSpeed).toBe(7);
        expect(out[0].isMotoring).toBe(true);
    });
});

describe('reef factor', () => {
    it('reduces boat speed by reefFactor when TWS exceeds threshold', () => {
        // Strong wind: windV = -12.86 m/s ≈ 25 kt from north.
        const lats = [-36, -35, -34, -33];
        const lons = [150, 151, 152, 153];
        const timestamps = [0, 3600_000];
        const windU: number[][][] = lats.map(() => lons.map(() => [0, 0]));
        const windV: number[][][] = lats.map(() => lons.map(() => [-12.86, -12.86]));
        const windGrid = { lats, lons, timestamps, windU, windV };
        const polar = { name: 'reef-test', twaAngles: [0, 90, 180], twsSpeeds: [10, 20, 30], speeds: [[0, 0, 0], [7, 8, 9], [0, 0, 0]] };
        const frontier = [{ lat: -34, lon: 151, parent: null as number | null, twa: 0, tws: 0, twd: 0, boatSpeed: 0, heading: 0, time: 0, isMotoring: false, sog: 0 }];
        const withReef = expandFrontier(frontier as any, windGrid as any, polar as any, 1, 0, {
            advanced: { tackPenaltyS: 0, gybePenaltyS: 0, motorAboveTws: null, motorBelowTws: null, nightSpeedFactor: 1, reefAboveTws: 20, reefFactor: 0.8 },
        });
        const withoutReef = expandFrontier(frontier as any, windGrid as any, polar as any, 1, 0, {});
        const reefed = withReef.find(c => c.heading === 90);
        const unreefed = withoutReef.find(c => c.heading === 90);
        expect(reefed!.boatSpeed).toBeLessThan(unreefed!.boatSpeed);
    });
});

describe('TWS motor limits', () => {
    it('forces motor when wind exceeds motorAboveTws', () => {
        // ~35 kt wind: windV = -18 m/s
        const lats = [-36, -35, -34, -33];
        const lons = [150, 151, 152, 153];
        const timestamps = [0, 3600_000];
        const windU: number[][][] = lats.map(() => lons.map(() => [0, 0]));
        const windV: number[][][] = lats.map(() => lons.map(() => [-18, -18]));
        const windGrid = { lats, lons, timestamps, windU, windV };
        const polar = { name: 'tws-test', twaAngles: [0, 90, 180], twsSpeeds: [30, 40], speeds: [[0, 0], [9, 10], [0, 0]] };
        const frontier = [{ lat: -34, lon: 151, parent: null as number | null, twa: 0, tws: 0, twd: 0, boatSpeed: 0, heading: 0, time: 0, isMotoring: false, sog: 0 }];
        const out = expandFrontier(frontier as any, windGrid as any, polar as any, 1, 0, {
            motor: { enabled: true, threshold: 2, speed: 5 },
            advanced: { tackPenaltyS: 0, gybePenaltyS: 0, motorAboveTws: 30, motorBelowTws: null, nightSpeedFactor: 1, reefAboveTws: null, reefFactor: 1 },
        });
        const anyMotoring = out.find(c => c.isMotoring);
        expect(anyMotoring).toBeDefined();
        expect(anyMotoring!.boatSpeed).toBe(5);
    });
});

describe('modifier stack walkthrough (F-1 audit)', () => {
    // Documents the modifier order: polar lookup → swell penalty → motor check → current.
    // Paper walkthrough: twa=110, tws=15 (Bavaria 38 ~7.85 kt); swell 2.0m @ 180°, hdg 200°
    // gives relSwellAngle=20°, beamFactor=sin(20°)=0.342, penaltyPerMeter=0.04,
    // penalty=min(0.5, 2.0*0.342*0.04)=0.0274 → boatSpeed≈7.64 kt. With motor threshold 3
    // and speed 6, no motor engages. With zero current, sog == boatSpeed.
    it('produces one candidate per heading step when the pipeline runs end-to-end', () => {
        const polar: PolarData = {
            name: 'Audit',
            twaAngles: [0, 110, 180],
            twsSpeeds: [15],
            speeds: [[0], [7.3], [0]],
        };
        const windGrid = makeUniformWindGrid();
        const frontier: IsochronePoint[] = [{
            lat: -33.5, lon: 151.5, parent: null,
            twa: 0, tws: 0, twd: 0, boatSpeed: 0,
            heading: 0, time: 0, isMotoring: false, sog: 0,
        }];
        const out = expandFrontier(frontier, windGrid, polar, 1, 0);
        expect(out.length).toBe(72); // 360 / 5-deg heading step
    });
});

describe('pruneToSectors', () => {
    it('keeps one point per sector', () => {
        const start: LatLon = { lat: -34, lon: 151 };
        const end: LatLon = { lat: -33, lon: 152 };
        const points: IsochronePoint[] = Array.from({ length: 10 }, (_, i) => ({
            lat: -33.9 + i * 0.001, lon: 151.1, parent: 0,
            twa: 90, tws: 10, twd: 180, boatSpeed: 7, heading: 45, time: 3600000,
        }));
        const pruned = pruneToSectors(points, start, end, 72);
        expect(pruned.length).toBe(1);
        expect(pruned[0].lat).toBeCloseTo(-33.891);
    });

    it('keeps points from different sectors', () => {
        const start: LatLon = { lat: 0, lon: 0 };
        const end: LatLon = { lat: 1, lon: 0 };
        const points: IsochronePoint[] = [
            { lat: 0.1, lon: 0.5, parent: 0, twa: 90, tws: 10, twd: 180, boatSpeed: 7, heading: 90, time: 3600000 },
            { lat: 0.1, lon: -0.5, parent: 0, twa: 90, tws: 10, twd: 180, boatSpeed: 7, heading: 270, time: 3600000 },
        ];
        const pruned = pruneToSectors(points, start, end, 72);
        expect(pruned.length).toBe(2);
    });
});

describe('traceRoute', () => {
    it('traces back from final point through isochrones', () => {
        const isochrones: IsochronePoint[][] = [
            [{ lat: -34, lon: 151, parent: null, twa: 0, tws: 0, twd: 0, boatSpeed: 0, heading: 0, time: 0 }],
            [{ lat: -33.5, lon: 151.5, parent: 0, twa: 45, tws: 15, twd: 180, boatSpeed: 6, heading: 135, time: 3600000 }],
            [{ lat: -33.0, lon: 152.0, parent: 0, twa: 90, tws: 12, twd: 180, boatSpeed: 7, heading: 90, time: 7200000 }],
        ];
        const route = traceRoute(isochrones, 0);
        expect(route.length).toBe(3);
        expect(route[0].lat).toBeCloseTo(-34);
        expect(route[1].lat).toBeCloseTo(-33.5);
        expect(route[2].lat).toBeCloseTo(-33);
    });
});

describe('checkArrival', () => {
    it('returns index of arriving point', () => {
        const dest: LatLon = { lat: -33, lon: 152 };
        const candidates: IsochronePoint[] = [
            { lat: -34, lon: 151, parent: 0, twa: 90, tws: 10, twd: 180, boatSpeed: 7, heading: 45, time: 3600000 },
            { lat: -33.001, lon: 151.999, parent: 0, twa: 90, tws: 10, twd: 180, boatSpeed: 7, heading: 45, time: 3600000 },
        ];
        expect(checkArrival(candidates, dest, 1.0)).toBe(1);
    });

    it('returns -1 when no point has arrived', () => {
        const dest: LatLon = { lat: -33, lon: 152 };
        const candidates: IsochronePoint[] = [
            { lat: -34, lon: 151, parent: 0, twa: 90, tws: 10, twd: 180, boatSpeed: 7, heading: 45, time: 3600000 },
        ];
        expect(checkArrival(candidates, dest, 1.0)).toBe(-1);
    });
});
