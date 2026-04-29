import { describe, it, expect } from 'vitest';
import { isNight } from '../../src/routing/sunAltitude';

describe('isNight', () => {
    // Sydney approximate coords
    const lat = -33.87;
    const lon = 151.21;

    it('returns false at local noon on equinox', () => {
        const noonUtc = Date.UTC(2026, 2, 20, 1, 0, 0); // 12:00 AEDT ≈ 01:00 UTC
        expect(isNight(lat, lon, noonUtc)).toBe(false);
    });

    it('returns true at local midnight on equinox', () => {
        const midnightUtc = Date.UTC(2026, 2, 20, 13, 0, 0); // 00:00 AEDT ≈ 13:00 UTC
        expect(isNight(lat, lon, midnightUtc)).toBe(true);
    });

    it('returns false at 2pm local time (daylight)', () => {
        const tsUtc = Date.UTC(2026, 2, 20, 3, 0, 0); // 14:00 AEDT
        expect(isNight(lat, lon, tsUtc)).toBe(false);
    });

    it('returns true at 2am local time (night)', () => {
        const tsUtc = Date.UTC(2026, 2, 20, 15, 0, 0); // 02:00 AEDT
        expect(isNight(lat, lon, tsUtc)).toBe(true);
    });
});
