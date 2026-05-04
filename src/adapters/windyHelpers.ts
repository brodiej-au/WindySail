import bcast from '@windy/broadcast';
import { getLatLonInterpolator } from '@windy/interpolator';
import store from '@windy/store';

/**
 * Snapshot Windy's (timestamp, overlay, product) tuple, run `fn`, then
 * restore on exit. Lifts save/restore out of individual fetchers so the
 * pipeline performs ONE outer save/restore instead of N rapid ones.
 *
 * Why this matters: each `store.set('product', X)` queues a new
 * SwitchableTileCache as the "next one to switch in". If a second product
 * change happens before that cache finishes loading, the first becomes
 * orphaned and Windy throws when it eventually fires `alltilesloaded`. The
 * old per-fetch finally blocks did three rapid sets between operations,
 * almost guaranteeing an orphan whenever multiple fetches ran in sequence.
 */
export async function withWindyState<T>(fn: () => Promise<T>): Promise<T> {
    const originalTimestamp = store.get('timestamp');
    const originalOverlay = store.get('overlay');
    const originalProduct = store.get('product');
    try {
        return await fn();
    } finally {
        store.set('timestamp', originalTimestamp);
        store.set('overlay', originalOverlay);
        store.set('product', originalProduct);
    }
}

/**
 * Pause briefly so any in-flight SwitchableTileCache from a previous fetch
 * has time to install before we queue a new product switch. Without this,
 * back-to-back fetches inside a `withWindyState` block can still orphan
 * the prior fetch's tail-end tiles.
 *
 * A hard delay is used because `redrawFinished` reflects vector overlay
 * redraws, not raster tile completion, and `waitForProductReady` requires
 * a known interpolator baseline change to detect.
 */
export function settleTileCache(ms = 1200): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Wait for Windy to finish redrawing.
 * Resolves on `redrawFinished`; safety timeout prevents
 * hanging if the event never fires (e.g. tiles already current).
 *
 * A minimum delay is enforced before listening for the event to avoid
 * catching stale `redrawFinished` events from prior operations (e.g. a
 * product restore in a `finally` block firing before the next product
 * switch's tiles are loaded).
 *
 * @param safetyMs  Fallback timeout in ms.  Use the default (500ms) for
 *                  product/overlay switches that require tile downloads.
 *                  Use a shorter value (50ms) for timestamp-only scrubs
 *                  where tiles are already loaded — `redrawFinished`
 *                  typically fires within a few ms in that case.
 */
export function waitForRedraw(safetyMs = 500): Promise<void> {
    // Minimum delay before listening — lets any in-flight redrawFinished
    // events from prior store changes flush through the event queue.
    // Skip for short waits (timestamp scrubs) where speed matters.
    const minDelay = safetyMs <= 200 ? 0 : 50;

    return new Promise(resolve => {
        setTimeout(() => {
            const safety = setTimeout(resolve, safetyMs);
            bcast.once('redrawFinished', () => {
                clearTimeout(safety);
                resolve();
            });
        }, minDelay);
    });
}

/**
 * Wait for Windy to finish a product switch.
 *
 * After setting the product via `store.set('product', ...)`, Windy needs
 * to load tiles for the new model.  We poll `getLatLonInterpolator()` at a
 * reference point until it returns a value different from the baseline, or
 * until the timeout expires.  This is far more reliable than waiting for
 * `redrawFinished` which can fire before tiles are actually loaded.
 *
 * @param refLat     Latitude of a reference point to sample
 * @param refLon     Longitude of a reference point to sample
 * @param baseline   Previous interpolator values; if null, accepts first valid result
 * @param timeoutMs  Max wait time before giving up
 */
export async function waitForProductReady(
    refLat: number,
    refLon: number,
    baseline: number[] | null,
    timeoutMs: number = 8000,
): Promise<void> {
    const start = Date.now();
    const checkInterval = 200;
    // The original implementation only checked `Date.now() - start < timeoutMs`
    // BETWEEN poll iterations, so a Windy interpolator promise that never
    // resolved (which can happen during a product switch with tiles mid-load)
    // would hang the function forever. Race every awaited operation against
    // a single shared deadline promise so the outer cap is actually enforced.
    let deadlineHit = false;
    const deadline = new Promise<void>(resolve => {
        setTimeout(() => { deadlineHit = true; resolve(); }, timeoutMs);
    });

    while (!deadlineHit && Date.now() - start < timeoutMs) {
        await Promise.race([
            new Promise(r => setTimeout(r, checkInterval)),
            deadline,
        ]);
        if (deadlineHit) break;
        try {
            const interp = await Promise.race([
                getLatLonInterpolator(),
                deadline.then(() => null),
            ]);
            if (!interp) continue;
            // Race the interp call against the outer deadline, NOT a tighter
            // per-poll cap. This gives genuinely slow (but eventually-OK)
            // interpolator responses the time they need while still preventing
            // an indefinite hang.
            const result = await Promise.race([
                Promise.resolve(interp({ lat: refLat, lon: refLon })).catch(() => null),
                deadline.then(() => null),
            ]);
            if (result && Array.isArray(result) && result.length >= 2) {
                if (!baseline) return;
                if (result[0] !== baseline[0] || result[1] !== baseline[1]) {
                    return;
                }
            }
        } catch {
            // Interpolator not ready yet — keep waiting
        }
    }
    console.warn('[waitForProductReady] Product switch timed out — interpolator may still have stale data');
}
