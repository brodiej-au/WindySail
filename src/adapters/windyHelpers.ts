import bcast from '@windy/broadcast';

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
 *                  Use a shorter value (150ms) for timestamp-only scrubs
 *                  where tiles are already loaded.
 */
export function waitForRedraw(safetyMs = 500): Promise<void> {
    // Minimum delay before listening — lets any in-flight redrawFinished
    // events from prior store changes flush through the event queue.
    const minDelay = safetyMs <= 150 ? 0 : 50;

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
