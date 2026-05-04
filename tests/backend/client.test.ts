import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { postInstall, postDisclaimerAck, postRoute } from '../../src/backend/client';
import { peekAll } from '../../src/backend/eventQueue';

describe('backend/client', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('postInstall sends emailHash-only payload (no raw email, no deviceId)', async () => {
        await postInstall({ emailHash: null, pluginVersion: '0.14.3', usedLang: 'en', userAgent: 'UA' });
        const call = (fetch as any).mock.calls[0];
        expect(call[0]).toContain('/install');
        const body = JSON.parse(call[1].body);
        expect(body).toEqual({ emailHash: null, pluginVersion: '0.14.3', usedLang: 'en', userAgent: 'UA' });
        expect(body).not.toHaveProperty('email');
        expect(body).not.toHaveProperty('deviceId');
    });

    it('postInstall queues on network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
        await postInstall({ emailHash: null, pluginVersion: '0.14.3', usedLang: 'en', userAgent: 'UA' });
        expect(peekAll()).toHaveLength(1);
    });

    it('postDisclaimerAck posts emailHash-only payload', async () => {
        await postDisclaimerAck({
            emailHash: 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6',
            pluginVersion: '0.14.3',
            disclaimerVersion: '2026-04',
            acceptedAt: new Date().toISOString(),
        });
        const call = (fetch as any).mock.calls[0];
        expect(call[0]).toContain('/disclaimer-ack');
        const body = JSON.parse(call[1].body);
        expect(body.emailHash).toBe('a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6');
        expect(body).not.toHaveProperty('email');
        expect(body).not.toHaveProperty('deviceId');
    });

    it('postRoute does not transmit email or deviceId', async () => {
        await postRoute({
            emailHash: null,
            pluginVersion: '0.14.3',
            usedLang: 'en',
            mode: 'single',
            startedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            departureTime: new Date().toISOString(),
            polarName: 'Test',
            motorboatMode: false,
            selectedModels: ['ecmwf'],
            start: { lat: 0, lon: 0 },
            end: { lat: 1, lon: 1 },
            waypointCount: 0,
            waypoints: [],
            results: [],
            failedReason: null,
        });
        const call = (fetch as any).mock.calls[0];
        const body = JSON.parse(call[1].body);
        expect(body).not.toHaveProperty('email');
        expect(body).not.toHaveProperty('deviceId');
    });
});
