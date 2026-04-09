import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/adapters/RoutingOrchestrator', () => ({
    RoutingOrchestrator: vi.fn().mockImplementation(() => ({
        computeRoutes: vi.fn().mockResolvedValue([]),
        cancel: vi.fn(),
        destroy: vi.fn(),
    })),
}));

import { DeparturePlanner } from '../../src/adapters/DeparturePlanner';
import type { DepartureWindowConfig } from '../../src/routing/types';

describe('DeparturePlanner', () => {
    describe('generateDepartureTimes', () => {
        it('generates correct times for a 24h window at 6h intervals', () => {
            const base = new Date('2026-04-10T06:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base + 24 * 3600_000,
                intervalHours: 6,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times).toEqual([
                base,
                base + 6 * 3600_000,
                base + 12 * 3600_000,
                base + 18 * 3600_000,
                base + 24 * 3600_000,
            ]);
        });

        it('generates a single departure when window equals interval', () => {
            const base = new Date('2026-04-10T06:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base,
                intervalHours: 6,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times).toEqual([base]);
        });

        it('includes windowEnd even if not exactly on interval boundary', () => {
            const base = new Date('2026-04-10T06:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base + 7 * 3600_000,
                intervalHours: 6,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times).toEqual([
                base,
                base + 6 * 3600_000,
            ]);
        });

        it('generates correct times for 3h intervals over 12h', () => {
            const base = new Date('2026-04-10T00:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base + 12 * 3600_000,
                intervalHours: 3,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times.length).toBe(5);
        });
    });
});
