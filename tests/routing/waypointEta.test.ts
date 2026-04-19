import { describe, it, expect } from 'vitest';
import { waypointEtas } from '../../src/routing/waypointEta';

describe('waypointEtas', () => {
    it('returns the time of the route point nearest each waypoint', () => {
        const route = [
            { lat: 0, lon: 0, time: 0 } as any,
            { lat: 0.5, lon: 0.5, time: 1000 } as any,
            { lat: 1, lon: 1, time: 2000 } as any,
            { lat: 1.5, lon: 1.5, time: 3000 } as any,
        ];
        const waypoints = [{ lat: 0.4, lon: 0.4 }, { lat: 1.4, lon: 1.4 }];
        expect(waypointEtas(route, waypoints)).toEqual([1000, 3000]);
    });

    it('returns empty array when no waypoints', () => {
        expect(waypointEtas([{ lat: 0, lon: 0, time: 0 } as any], [])).toEqual([]);
    });
});
