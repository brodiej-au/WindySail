import store from '@windy/store';
import bcast from '@windy/broadcast';
import { getLatLonInterpolator } from '@windy/interpolator';
import type { LatLonBounds, WindGridData } from '../routing/types';

const GRID_STEP = 0.5; // degrees

/**
 * Build a wind grid by scrubbing Windy's timeline and sampling the interpolator.
 * Zero API calls — reads directly from loaded map tiles.
 *
 * Requires: wind overlay active, map viewport covering the routing area,
 * and tiles loaded for each timestamp.
 */
export async function fetchWindGrid(
    _model: string,
    bounds: LatLonBounds,
    _pluginName: string,
): Promise<WindGridData> {
    // Build grid coordinates
    const lats: number[] = [];
    const lons: number[] = [];

    for (let lat = bounds.south; lat <= bounds.north; lat += GRID_STEP) {
        lats.push(Math.round(lat * 1000) / 1000);
    }
    for (let lon = bounds.west; lon <= bounds.east; lon += GRID_STEP) {
        lons.push(Math.round(lon * 1000) / 1000);
    }

    // Ensure at least 2 points per axis for interpolation
    if (lats.length < 2) {
        lats.push(lats[0] + GRID_STEP);
    }
    if (lons.length < 2) {
        lons.push(lons[0] + GRID_STEP);
    }

    // Get available timestamps from the calendar store
    const calendar = store.get('calendar') as any;
    if (!calendar) {
        throw new Error('No weather data loaded. Ensure the wind overlay is active.');
    }

    // Build list of timestamps to sample (every 3 hours over the forecast range)
    const timestamps: number[] = [];
    const startTs = calendar.start as number;
    const endTs = calendar.end as number;
    const STEP_MS = 3 * 3600_000; // 3 hours
    for (let t = startTs; t <= endTs; t += STEP_MS) {
        timestamps.push(t);
    }

    if (timestamps.length === 0) {
        throw new Error('No forecast timestamps available.');
    }

    // Pre-allocate 3D arrays: [latIdx][lonIdx][timeIdx]
    const windU: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const windV: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    // Save current timestamp to restore later
    const originalTimestamp = store.get('timestamp');

    // For each timestamp, scrub Windy's timeline and sample the interpolator
    for (let ti = 0; ti < timestamps.length; ti++) {
        const ts = timestamps[ti];

        // Set the timeline to this timestamp and wait for tiles to load
        store.set('timestamp', ts);
        await waitForRedraw();

        // Get the interpolator for the current view
        const interpolate = await getLatLonInterpolator();
        if (!interpolate) {
            continue; // Skip this timestep if no interpolator available
        }

        // Sample wind at each grid point
        for (let li = 0; li < lats.length; li++) {
            for (let lo = 0; lo < lons.length; lo++) {
                try {
                    const result = await interpolate({ lat: lats[li], lon: lons[lo] });
                    // Wind interpolator returns [u, v, ...] in m/s
                    if (result && typeof result === 'object' && result.length >= 2) {
                        windU[li][lo][ti] = result[0];
                        windV[li][lo][ti] = result[1];
                    }
                } catch {
                    // Point outside loaded tiles — leave as 0
                }
            }
        }
    }

    // Restore original timestamp
    store.set('timestamp', originalTimestamp);

    return { lats, lons, timestamps, windU, windV };
}

/**
 * Wait for Windy to finish redrawing after a timestamp change.
 */
function waitForRedraw(): Promise<void> {
    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            resolve(); // Don't hang forever — proceed after 3s even without redraw
        }, 3000);

        bcast.once('redrawFinished', () => {
            clearTimeout(timeout);
            resolve();
        });
    });
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
