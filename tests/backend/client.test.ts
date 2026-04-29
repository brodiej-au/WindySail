import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { postInstall, postHeartbeat, postDisclaimerAck, shouldSendHeartbeat } from '../../src/backend/client';
import { peekAll } from '../../src/backend/eventQueue';
import { HEARTBEAT_MIN_INTERVAL_MS } from '../../src/backend/config';

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

    it('postInstall resolves when fetch succeeds', async () => {
        await postInstall({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', usedLang: 'en', userAgent: 'UA' });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/install'), expect.any(Object));
    });

    it('postInstall queues on network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')));
        await postInstall({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', usedLang: 'en', userAgent: 'UA' });
        expect(peekAll()).toHaveLength(1);
    });

    it('shouldSendHeartbeat returns true when no prior timestamp', () => {
        expect(shouldSendHeartbeat()).toBe(true);
    });

    it('shouldSendHeartbeat returns false when last heartbeat is recent', () => {
        localStorage.setItem('windysail-last-heartbeat', new Date().toISOString());
        expect(shouldSendHeartbeat()).toBe(false);
    });

    it('shouldSendHeartbeat returns true when last heartbeat is older than interval', () => {
        const old = new Date(Date.now() - HEARTBEAT_MIN_INTERVAL_MS - 1000).toISOString();
        localStorage.setItem('windysail-last-heartbeat', old);
        expect(shouldSendHeartbeat()).toBe(true);
    });

    it('postHeartbeat marks last heartbeat on success', async () => {
        await postHeartbeat({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', usedLang: 'en' });
        expect(localStorage.getItem('windysail-last-heartbeat')).toBeTruthy();
    });

    it('postDisclaimerAck posts with correct path', async () => {
        await postDisclaimerAck({ deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1', email: null, pluginVersion: '0.3.0', disclaimerVersion: '2026-04', acceptedAt: new Date().toISOString() });
        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/disclaimer-ack'), expect.any(Object));
    });
});
