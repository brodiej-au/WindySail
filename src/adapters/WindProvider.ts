import store from '@windy/store';
import { getLatLonInterpolator } from '@windy/interpolator';
import products from '@windy/products';
import type { LatLon, LatLonBounds, WindGridData, WindModelId } from '../routing/types';
import * as WindCache from './WindCache';
import { waitForRedraw, waitForProductReady } from './windyHelpers';

const GRID_STEP = 1.0; // degrees — coarser grid for speed, router interpolates
const TIME_STEP_MS = 6 * 3600_000; // 6 hours between samples

/**
 * Build a wind grid by scrubbing Windy's timeline and sampling the interpolator.
 * Zero API calls — reads directly from loaded map tiles.
 *
 * Only samples timestamps from departureTime to departureTime + maxDurationHours.
 *
 * @param previousGrid  If provided, used to verify the product switch returned
 *                      different data (avoids sampling stale tiles).
 */
export async function fetchWindGrid(
    model: WindModelId,
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onProgress?: (msg: string, pct: number) => void,
    previousGrid?: WindGridData,
    signal?: AbortSignal,
): Promise<WindGridData> {
    // Check cache first — return immediately if fresh
    const cacheKey = WindCache.buildCacheKey(model, bounds, departureTime, maxDurationHours);
    const cached = WindCache.get(cacheKey);
    if (cached) {
        return cached;
    }

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

    // Only sample the time range we need
    const endTime = departureTime + maxDurationHours * 3600_000;
    const timestamps: number[] = [];
    for (let t = departureTime; t <= endTime; t += TIME_STEP_MS) {
        timestamps.push(t);
    }
    // Always include the end time
    if (timestamps[timestamps.length - 1] < endTime) {
        timestamps.push(endTime);
    }

    if (timestamps.length === 0) {
        throw new Error('No forecast timestamps to sample.');
    }

    // Pre-allocate 3D arrays
    const windU: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const windV: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    const originalTimestamp = store.get('timestamp');
    const originalOverlay = store.get('overlay');
    const originalProduct = store.get('product');

    // Reference point for verifying product switch (centre of bounds)
    const refLat = (bounds.south + bounds.north) / 2;
    const refLon = (bounds.west + bounds.east) / 2;

    // Build a baseline from the previous grid so we can detect when
    // the interpolator has actually switched to the new product's data.
    let baseline: number[] | null = null;
    if (previousGrid && previousGrid.windU.length > 0 && previousGrid.windU[0].length > 0) {
        baseline = [previousGrid.windU[0][0][0], previousGrid.windV[0][0][0]];
    }

    let modelRunTime: number | undefined;
    let dataUpdateTime: number | undefined;

    try {
        // Ensure wind overlay is active and switch to the requested model.
        store.set('overlay', 'wind');
        store.set('product', model);

        // Set timestamp to the first sampling time so tiles for that time load
        store.set('timestamp', timestamps[0]);

        // Wait until the interpolator returns data that differs from the
        // previous model's grid, confirming the product switch took effect.
        await waitForProductReady(refLat, refLon, baseline);

        // Capture model run time from the product calendar
        try {
            const product = products[model];
            if (product) {
                const calendar = await product.getCalendar();
                if (calendar) {
                    modelRunTime = calendar.refTimeTs;
                    dataUpdateTime = calendar.updateTs;
                }
            }
        } catch {
            // Calendar not available — not critical
        }

        let consecutiveEmpty = 0;
        let lastNonEmptyIdx = -1;

        for (let ti = 0; ti < timestamps.length; ti++) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            onProgress?.(
                `Sampling wind ${ti + 1}/${timestamps.length}...`,
                Math.round((ti / timestamps.length) * 100),
            );

            // Only switch timestamp if not already set (first iteration handled above)
            if (ti > 0) {
                store.set('timestamp', timestamps[ti]);
                await waitForRedraw(150);
            }

            const interpolate = await getLatLonInterpolator();
            if (!interpolate) continue;

            let nonZero = 0;
            const jobs: Promise<any>[] = [];
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
                }
            }
            const batchResults = await Promise.all(jobs);
            let idx = 0;
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    const result = batchResults[idx++];
                    if (result && typeof result === 'object' && result.length >= 2) {
                        windU[li][lo][ti] = result[0];
                        windV[li][lo][ti] = result[1];
                        if (result[0] !== 0 || result[1] !== 0) nonZero++;
                    }
                }
            }

            if (nonZero > 0) {
                consecutiveEmpty = 0;
                lastNonEmptyIdx = ti;
                continue;
            }

            // All zeros — retry once in case tiles hadn't loaded yet
            console.warn(`[WindProvider] Timestamp ${ti + 1}/${timestamps.length}: all-zero data, retrying...`);
            await waitForRedraw(300);

            const retryInterp = await getLatLonInterpolator();
            if (retryInterp) {
                const retryJobs: Promise<any>[] = [];
                for (let li = 0; li < lats.length; li++) {
                    for (let lo = 0; lo < lons.length; lo++) {
                        retryJobs.push(retryInterp({ lat: lats[li], lon: lons[lo] }).catch(() => null));
                    }
                }
                const retryResults = await Promise.all(retryJobs);
                let ri = 0;
                for (let li = 0; li < lats.length; li++) {
                    for (let lo = 0; lo < lons.length; lo++) {
                        const result = retryResults[ri++];
                        if (result && typeof result === 'object' && result.length >= 2) {
                            windU[li][lo][ti] = result[0];
                            windV[li][lo][ti] = result[1];
                            if (result[0] !== 0 || result[1] !== 0) nonZero++;
                        }
                    }
                }
            }

            if (nonZero > 0) {
                consecutiveEmpty = 0;
                lastNonEmptyIdx = ti;
            } else {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) {
                    console.log(`[WindProvider] Wind data ended at timestamp ${ti + 1}/${timestamps.length} — forecast doesn't extend further`);
                    break;
                }
            }
        }

        // Trim arrays to actual coverage
        const trimLen = lastNonEmptyIdx >= 0 && lastNonEmptyIdx < timestamps.length - 1
            ? lastNonEmptyIdx + 1
            : timestamps.length;
        if (trimLen < timestamps.length) {
            timestamps.length = trimLen;
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    windU[li][lo].length = trimLen;
                    windV[li][lo].length = trimLen;
                }
            }
        }
    } finally {
        store.set('timestamp', originalTimestamp);
        store.set('overlay', originalOverlay);
        store.set('product', originalProduct);
    }

    const grid: WindGridData = { lats, lons, timestamps, windU, windV, modelRunTime, dataUpdateTime };
    WindCache.set(cacheKey, grid);
    return grid;
}

/**
 * Compute a bounding box around start and end with a margin.
 */
export function computeBounds(
    start: { lat: number; lon: number },
    end: { lat: number; lon: number },
    marginDeg: number = 1.0,
): LatLonBounds {
    return {
        south: Math.min(start.lat, end.lat) - marginDeg,
        north: Math.max(start.lat, end.lat) + marginDeg,
        west: Math.min(start.lon, end.lon) - marginDeg,
        east: Math.max(start.lon, end.lon) + marginDeg,
    };
}

/**
 * Compute a bounding box around an arbitrary set of points with a margin.
 * Useful for multi-leg routes with intermediate waypoints.
 */
export function computeBoundsFromPoints(
    points: LatLon[],
    marginDeg: number = 1.0,
): LatLonBounds {
    const lats = points.map(p => p.lat);
    const lons = points.map(p => p.lon);
    return {
        south: Math.min(...lats) - marginDeg,
        north: Math.max(...lats) + marginDeg,
        west: Math.min(...lons) - marginDeg,
        east: Math.max(...lons) + marginDeg,
    };
}
