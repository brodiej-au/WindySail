import bcast from '@windy/broadcast';

/**
 * Wait for Windy to finish redrawing.
 * Resolves immediately on `redrawFinished`; small safety timeout
 * prevents hanging if the event never fires (e.g. tiles already current).
 */
export function waitForRedraw(): Promise<void> {
    return new Promise(resolve => {
        const safety = setTimeout(resolve, 150);
        bcast.once('redrawFinished', () => {
            clearTimeout(safety);
            resolve();
        });
    });
}
