import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, retryWithBackoff, TimeoutError } from '../../src/adapters/asyncGuards';

describe('withTimeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resolves with the promise result if it settles before the timeout', async () => {
        const p = Promise.resolve('ok');
        await expect(withTimeout(p, 1000, 'test')).resolves.toBe('ok');
    });

    it('rejects with TimeoutError if the promise does not settle in time', async () => {
        const slow = new Promise(resolve => setTimeout(() => resolve('late'), 5000));
        const guarded = withTimeout(slow, 1000, 'slow-op');
        vi.advanceTimersByTime(1000);
        await expect(guarded).rejects.toBeInstanceOf(TimeoutError);
    });

    it('propagates the promise rejection if it rejects before the timeout', async () => {
        const bad = Promise.reject(new Error('boom'));
        await expect(withTimeout(bad, 1000, 'test')).rejects.toThrow('boom');
    });

    it('attaches the label to the TimeoutError message', async () => {
        const slow = new Promise(resolve => setTimeout(resolve, 5000));
        const guarded = withTimeout(slow, 500, 'fetch-swell');
        vi.advanceTimersByTime(500);
        await expect(guarded).rejects.toThrow(/fetch-swell/);
    });
});

describe('retryWithBackoff', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('returns the result on first success', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        await expect(retryWithBackoff(fn, 3, 100)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure up to the retry count', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail1'))
            .mockRejectedValueOnce(new Error('fail2'))
            .mockResolvedValueOnce('ok');
        const promise = retryWithBackoff(fn, 3, 100);
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws the last error after exhausting retries', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always-fails'));
        const promise = retryWithBackoff(fn, 2, 100);
        await vi.runAllTimersAsync();
        await expect(promise).rejects.toThrow('always-fails');
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('honours an aborted signal by rejecting immediately without retrying', async () => {
        const controller = new AbortController();
        controller.abort();
        const fn = vi.fn().mockRejectedValue(new Error('should not be called'));
        await expect(retryWithBackoff(fn, 3, 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(fn).not.toHaveBeenCalled();
    });

    it('aborts mid-backoff if the signal fires during a wait', async () => {
        const controller = new AbortController();
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        const promise = retryWithBackoff(fn, 5, 1000, controller.signal);
        // Let the first attempt fail
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        await vi.advanceTimersByTimeAsync(1000);
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });
});
