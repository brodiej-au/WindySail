import store from '@windy/store';
import bcast from '@windy/broadcast';
import { getLatLonInterpolator } from '@windy/interpolator';
import type { LatLonBounds, SwellGridData, CurrentGridData } from '../routing/types';

const GRID_STEP = 1.0; // degrees — same as WindProvider
const TIME_STEP_MS = 6 * 3600_000; // 6 hours between samples

/**
 * Wait for Windy to finish redrawing.
 * Resolves immediately on `redrawFinished`; small safety timeout
 * prevents hanging if the event never fires (e.g. tiles already current).
 */
function waitForRedraw(): Promise<void> {
    return new Promise(resolve => {
        const safety = setTimeout(resolve, 150);
        bcast.once('redrawFinished', () => {
            clearTimeout(safety);
            resolve();
        });
    });
}

/**
 * Build lat/lon arrays and timestamps for the given bounds and time range.
 */
function buildGrid(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
): { lats: number[]; lons: number[]; timestamps: number[] } {
    const lats: number[] = [];
    const lons: number[] = [];

    for (let lat = bounds.south; lat <= bounds.north; lat += GRID_STEP) {
        lats.push(Math.round(lat * 1000) / 1000);
    }
    for (let lon = bounds.west; lon <= bounds.east; lon += GRID_STEP) {
        lons.push(Math.round(lon * 1000) / 1000);
    }

    if (lats.length < 2) lats.push(lats[0] + GRID_STEP);
    if (lons.length < 2) lons.push(lons[0] + GRID_STEP);

    const endTime = departureTime + maxDurationHours * 3600_000;
    const timestamps: number[] = [];
    for (let t = departureTime; t <= endTime; t += TIME_STEP_MS) {
        timestamps.push(t);
    }
    if (timestamps[timestamps.length - 1] < endTime) {
        timestamps.push(endTime);
    }

    return { lats, lons, timestamps };
}

/**
 * Fetch a grid of swell data by scrubbing Windy's wave overlay.
 *
 * Uses the ecmwfWaves product. The interpolator returns [u, v, size?] where:
 *   - result[2] is the significant wave height (or magnitude if not present)
 *   - result[0] and result[1] are the u/v components used to compute direction
 *   - swellPeriod is set to 0 as it is not reliably available from the raw interpolator
 *
 * The original overlay and product are restored in a finally block.
 */
export async function fetchSwellGrid(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onProgress?: (msg: string, pct: number) => void,
): Promise<SwellGridData> {
    const { lats, lons, timestamps } = buildGrid(bounds, departureTime, maxDurationHours);

    if (timestamps.length === 0) {
        throw new Error('No forecast timestamps to sample.');
    }

    // Pre-allocate 3D arrays
    const swellHeight: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const swellDir: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const swellPeriod: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    const originalTimestamp = store.get('timestamp');
    const originalOverlay = store.get('overlay');
    const originalProduct = store.get('product');

    try {
        store.set('overlay', 'waves');
        store.set('product', 'ecmwfWaves');
        await waitForRedraw();

        for (let ti = 0; ti < timestamps.length; ti++) {
            onProgress?.(
                `Sampling swell ${ti + 1}/${timestamps.length}...`,
                Math.round((ti / timestamps.length) * 100),
            );

            store.set('timestamp', timestamps[ti]);
            await waitForRedraw();

            const interpolate = await getLatLonInterpolator();
            if (!interpolate) continue;

            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    try {
                        const result = await interpolate({ lat: lats[li], lon: lons[lo] });
                        if (result && typeof result === 'object' && result.length >= 2) {
                            const u = result[0];
                            const v = result[1];
                            // Height from 3rd channel if present, otherwise magnitude of u/v
                            swellHeight[li][lo][ti] =
                                result[2] != null
                                    ? result[2]
                                    : Math.sqrt(u ** 2 + v ** 2);
                            // Direction waves come FROM (oceanographic convention)
                            swellDir[li][lo][ti] =
                                (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
                            // Period not reliably available from raw interpolator
                            swellPeriod[li][lo][ti] = 0;
                        }
                    } catch {
                        // Outside loaded tiles — leave as 0
                    }
                }
            }
        }
    } finally {
        store.set('timestamp', originalTimestamp);
        store.set('overlay', originalOverlay);
        store.set('product', originalProduct);
    }

    return { lats, lons, timestamps, swellHeight, swellDir, swellPeriod };
}

/**
 * Fetch a grid of ocean current data by scrubbing Windy's currents overlay.
 *
 * Uses the CMEMS product. The interpolator returns [u, v] components in m/s,
 * the same format as wind data.
 *
 * Returns null if currents data is unavailable for the region (CMEMS may not
 * cover all areas). The original overlay and product are restored in a finally block.
 */
export async function fetchCurrentGrid(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onProgress?: (msg: string, pct: number) => void,
): Promise<CurrentGridData | null> {
    const { lats, lons, timestamps } = buildGrid(bounds, departureTime, maxDurationHours);

    if (timestamps.length === 0) {
        return null;
    }

    // Pre-allocate 3D arrays
    const currentU: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const currentV: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    const originalTimestamp = store.get('timestamp');
    const originalOverlay = store.get('overlay');
    const originalProduct = store.get('product');

    let hasAnyData = false;

    try {
        store.set('overlay', 'currents');
        store.set('product', 'cmems');
        await waitForRedraw();

        for (let ti = 0; ti < timestamps.length; ti++) {
            onProgress?.(
                `Sampling currents ${ti + 1}/${timestamps.length}...`,
                Math.round((ti / timestamps.length) * 100),
            );

            store.set('timestamp', timestamps[ti]);
            await waitForRedraw();

            const interpolate = await getLatLonInterpolator();
            if (!interpolate) continue;

            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    try {
                        const result = await interpolate({ lat: lats[li], lon: lons[lo] });
                        if (result && typeof result === 'object' && result.length >= 2) {
                            currentU[li][lo][ti] = result[0];
                            currentV[li][lo][ti] = result[1];
                            if (result[0] !== 0 || result[1] !== 0) {
                                hasAnyData = true;
                            }
                        }
                    } catch {
                        // Outside loaded tiles — leave as 0
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[OceanDataProvider] Currents data unavailable:', err);
        return null;
    } finally {
        store.set('timestamp', originalTimestamp);
        store.set('overlay', originalOverlay);
        store.set('product', originalProduct);
    }

    if (!hasAnyData) {
        console.warn('[OceanDataProvider] No currents data found for this region (CMEMS may not cover it).');
        return null;
    }

    return { lats, lons, timestamps, currentU, currentV };
}
