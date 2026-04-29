/**
 * Thrown by withTimeout when the wrapped promise does not settle within the deadline.
 */
export class TimeoutError extends Error {
    constructor(label: string, ms: number) {
        super(`Timeout after ${ms}ms: ${label}`);
        this.name = 'TimeoutError';
    }
}

/**
 * Races a promise against a wall-clock timer. If the timer fires first, rejects with
 * TimeoutError. Label is included in the error message for diagnostics.
 *
 * Note: the underlying promise is not cancelled — JavaScript has no generic cancellation.
 * Caller is expected to drop the reference.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}

/**
 * Retries an async function up to `retries` times on rejection, waiting `backoffMs`
 * between attempts. The total number of invocations is `retries + 1` (initial try
 * plus up to `retries` retries).
 *
 * If an AbortSignal is provided and fires at any time (before first attempt or during
 * a backoff wait), rejects with an AbortError and stops.
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number,
    backoffMs: number,
    signal?: AbortSignal,
): Promise<T> {
    if (signal?.aborted) {
        throw makeAbortError();
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal?.aborted) throw makeAbortError();
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt === retries) break;
            await delay(backoffMs, signal);
        }
    }
    throw lastError;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(makeAbortError());
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(makeAbortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

function makeAbortError(): DOMException {
    return new DOMException('Aborted', 'AbortError');
}
