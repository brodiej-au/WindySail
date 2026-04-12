import bcast from '@windy/broadcast';
import { getLatLonInterpolator } from '@windy/interpolator';

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
    timeoutMs: number = 5000,
): Promise<void> {
    const start = Date.now();
    const checkInterval = 200;

    while (Date.now() - start < timeoutMs) {
        await new Promise(r => setTimeout(r, checkInterval));
        try {
            const interp = await getLatLonInterpolator();
            if (!interp) continue;
            const result = await interp({ lat: refLat, lon: refLon });
            if (result && result.length >= 2) {
                // If we have no baseline to compare against (first switch), accept immediately
                if (!baseline) return;
                // If the values differ from the baseline, the product switch took effect
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
