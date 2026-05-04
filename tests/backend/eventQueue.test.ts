import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, drain, peekAll, MAX_QUEUE_SIZE } from '../../src/backend/eventQueue';

describe('eventQueue', () => {
    beforeEach(() => {
        const store: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
            removeItem: (k: string) => { delete store[k]; },
        });
    });

    it('enqueues and peeks events', () => {
        enqueue({ path: '/install', body: { a: 1 } });
        enqueue({ path: '/route', body: { b: 2 } });
        expect(peekAll()).toHaveLength(2);
    });

    it('drains by calling the sender for each and removes on success', async () => {
        enqueue({ path: '/install', body: { a: 1 } });
        enqueue({ path: '/route', body: { b: 2 } });
        const sender = vi.fn().mockResolvedValue(undefined);
        await drain(sender);
        expect(sender).toHaveBeenCalledTimes(2);
        expect(peekAll()).toHaveLength(0);
    });

    it('keeps failed sends in the queue', async () => {
        enqueue({ path: '/install', body: { a: 1 } });
        enqueue({ path: '/route', body: { b: 2 } });
        const sender = vi.fn()
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('net'));
        await drain(sender);
        expect(peekAll()).toHaveLength(1);
        expect(peekAll()[0].path).toBe('/route');
    });

    it(`trims to MAX_QUEUE_SIZE (${MAX_QUEUE_SIZE}) on overflow`, () => {
        for (let i = 0; i < MAX_QUEUE_SIZE + 10; i++) {
            enqueue({ path: '/route', body: { i } });
        }
        expect(peekAll()).toHaveLength(MAX_QUEUE_SIZE);
        // Oldest entries dropped
        expect(peekAll()[0].body.i).toBe(10);
    });
});
