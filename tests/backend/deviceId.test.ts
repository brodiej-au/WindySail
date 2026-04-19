import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateDeviceId } from '../../src/backend/deviceId';

describe('getOrCreateDeviceId', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
    });

    it('generates and persists a UUID on first call', () => {
        const id1 = getOrCreateDeviceId();
        expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const id2 = getOrCreateDeviceId();
        expect(id2).toBe(id1);
    });

    it('falls back to in-memory id when localStorage throws', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => {},
        });
        const id1 = getOrCreateDeviceId();
        const id2 = getOrCreateDeviceId();
        // In-memory fallback is stable within a single module load
        expect(id1).toBe(id2);
        expect(id1).toMatch(/^[0-9a-f]{8}/);
    });
});
