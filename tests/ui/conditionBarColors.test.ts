import { describe, it, expect } from 'vitest';
import { twsColor, sogColor, twaColor, swellColor } from '../../src/ui/conditionBarColors';

describe('twsColor', () => {
    it('returns blue for calm / motoring (< 4kt)', () => {
        expect(twsColor(2)).toBe('rgb(52, 152, 219)');
    });

    it('returns green for ideal sailing (10kt)', () => {
        const c = twsColor(10);
        expect(c).toMatch(/^rgb\(/);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns red for heavy wind (30kt)', () => {
        const c = twsColor(30);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });
});

describe('twaColor', () => {
    it('returns green for dead run (180)', () => {
        const c = twaColor(180);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns green for broad reach (120)', () => {
        const c = twaColor(120);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns red for hard on the wind (25)', () => {
        const c = twaColor(25);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });
});

describe('sogColor', () => {
    it('returns red for stalled (0kt)', () => {
        const c = sogColor(0);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });

    it('returns green for good speed (7kt)', () => {
        const c = sogColor(7);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });
});

describe('swellColor', () => {
    it('returns green for calm swell (0.5m)', () => {
        const c = swellColor(0.5);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns red for heavy swell (4m)', () => {
        const c = swellColor(4);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });
});
