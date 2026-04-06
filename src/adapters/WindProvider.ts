import { getPointForecastData } from '@windy/fetch';
import type { LatLonBounds, WindGridData } from '../routing/types';

const GRID_STEP = 0.5; // degrees
const CONCURRENCY = 5;

/**
 * Fetch a wind grid from Windy for a specific weather model.
 * Pre-fetches point forecasts on a 0.5° grid covering the bounding box.
 * Returns a plain serialisable object for transfer to the Web Worker.
 */
export async function fetchWindGrid(
    model: string,
    bounds: LatLonBounds,
    pluginName: string,
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

    // Fetch all point forecasts with concurrency limiting
    type ForecastResult = {
        latIdx: number;
        lonIdx: number;
        timestamps: number[];
        windU: number[];
        windV: number[];
    };

    const tasks: (() => Promise<ForecastResult>)[] = [];

    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            const lat = lats[li];
            const lon = lons[lo];
            const latIdx = li;
            const lonIdx = lo;

            tasks.push(async () => {
                const response = await getPointForecastData(
                    model,
                    { lat, lon },
                    pluginName,
                );
                const data = response.data.data;
                return {
                    latIdx,
                    lonIdx,
                    timestamps: data.ts,
                    windU: data['wind_u-surface'] ?? data['wind_u-850h'] ?? [],
                    windV: data['wind_v-surface'] ?? data['wind_v-850h'] ?? [],
                };
            });
        }
    }

    const results = await runWithConcurrency(tasks, CONCURRENCY);

    // Get timestamps from first result
    const timestamps = results[0].timestamps;

    // Build 3D arrays: [latIdx][lonIdx][timeIdx]
    const windU: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const windV: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    for (const r of results) {
        for (let t = 0; t < timestamps.length; t++) {
            windU[r.latIdx][r.lonIdx][t] = r.windU[t] ?? 0;
            windV[r.latIdx][r.lonIdx][t] = r.windV[t] ?? 0;
        }
    }

    return { lats, lons, timestamps, windU, windV };
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
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number,
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let nextIndex = 0;

    async function runNext(): Promise<void> {
        while (nextIndex < tasks.length) {
            const index = nextIndex++;
            results[index] = await tasks[index]();
        }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
    await Promise.all(workers);
    return results;
}
