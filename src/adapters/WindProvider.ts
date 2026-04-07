import store from '@windy/store';
import { getLatLonInterpolator } from '@windy/interpolator';
import type { LatLonBounds, WindGridData, WindModelId } from '../routing/types';
import * as WindCache from './WindCache';
import { waitForRedraw } from './windyHelpers';

const GRID_STEP = 1.0; // degrees — coarser grid for speed, router interpolates
const TIME_STEP_MS = 6 * 3600_000; // 6 hours between samples

/**
 * Build a wind grid by scrubbing Windy's timeline and sampling the interpolator.
 * Zero API calls — reads directly from loaded map tiles.
 *
 * Only samples timestamps from departureTime to departureTime + maxDurationHours.
 */
export async function fetchWindGrid(
    model: WindModelId,
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onProgress?: (msg: string, pct: number) => void,
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
    const originalProduct = store.get('product');

    try {
        // Switch to the requested weather model
        store.set('product', model);
        await waitForRedraw();

        for (let ti = 0; ti < timestamps.length; ti++) {
            onProgress?.(
                `Sampling wind ${ti + 1}/${timestamps.length}...`,
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
                            windU[li][lo][ti] = result[0];
                            windV[li][lo][ti] = result[1];
                        }
                    } catch {
                        // Outside loaded tiles — leave as 0
                    }
                }
            }
        }
    } finally {
        store.set('timestamp', originalTimestamp);
        store.set('product', originalProduct);
    }

    const grid: WindGridData = { lats, lons, timestamps, windU, windV };
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
