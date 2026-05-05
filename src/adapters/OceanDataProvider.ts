import store from '@windy/store';
import { getLatLonInterpolator } from '@windy/interpolator';
import products from '@windy/products';
import type { LatLonBounds, SwellGridData, CurrentGridData, WaveModelId } from '../routing/types';
import { waitForRedraw, waitForProductReady, withWindyState } from './windyHelpers';
import { buildOceanCacheKey, getSwell, setSwell, getCurrent, setCurrent } from './OceanCache';
import { withTimeout, retryWithBackoff } from './asyncGuards';
import { settingsStore } from '../stores/SettingsStore';

/**
 * Resolve the currently-selected wave product from settings, with a
 * defensive fallback to ECMWF Waves if the stored value is unrecognised
 * (e.g. an old build wrote a value we no longer ship).
 */
function selectedWaveProduct(): WaveModelId {
    try {
        const v = settingsStore.get('selectedWaveModel') as WaveModelId | undefined;
        if (v) return v;
    } catch {}
    return 'ecmwfWaves';
}

const GRID_STEP = 1.0; // degrees — same as WindProvider
const TIME_STEP_MS = 6 * 3600_000; // 6 hours between samples
/** Per-timestep wall-clock budget. If Windy hasn't answered by this deadline, retry. */
const STEP_TIMEOUT_MS = 15_000;
/** Number of retry attempts after the initial try for a single timestep. */
const STEP_RETRIES = 2;
/** Delay between retry attempts for the same timestep. */
const STEP_RETRY_BACKOFF_MS = 500;

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
    signal?: AbortSignal,
): Promise<SwellGridData> {
    return withWindyState(() =>
        fetchSwellGridInner(bounds, departureTime, maxDurationHours, onProgress, signal),
    );
}

/**
 * Inner swell grid fetch — does NOT save/restore Windy state. Caller wraps.
 */
export async function fetchSwellGridInner(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onProgress?: (msg: string, pct: number) => void,
    signal?: AbortSignal,
): Promise<SwellGridData> {
    const cacheKey = buildOceanCacheKey('swell', bounds, departureTime, maxDurationHours);
    const cached = getSwell(cacheKey);
    if (cached) {
        console.log('[OceanDataProvider] Swell cache hit');
        return cached;
    }

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

    let modelRunTime: number | undefined;
    let dataUpdateTime: number | undefined;

    // Reference point for verifying product switch (centre of bounds)
    const refLat = (bounds.south + bounds.north) / 2;
    const refLon = (bounds.west + bounds.east) / 2;

    let lastNonEmptyIdx = -1;

    const waveProduct = selectedWaveProduct();
    try {
        // Give the UI a label during the otherwise-silent product-switch wait
        // (waitForProductReady can take up to 5s with no progress callback).
        onProgress?.('Switching to swell forecast…', 0);

        store.set('overlay', 'waves');
        store.set('product', waveProduct);
        store.set('timestamp', timestamps[0]);
        await waitForProductReady(refLat, refLon, null);

        try {
            const product = products[waveProduct];
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

        for (let ti = 0; ti < timestamps.length; ti++) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            onProgress?.(
                `Sampling swell ${ti + 1}/${timestamps.length}...`,
                Math.round((ti / timestamps.length) * 100),
            );

            const sampleOneStep = async (): Promise<any[] | null> => {
                if (ti > 0) {
                    store.set('timestamp', timestamps[ti]);
                    await waitForRedraw(150);
                }
                const interpolate = await getLatLonInterpolator();
                if (!interpolate) return null;
                const jobs: Promise<any>[] = [];
                for (let li = 0; li < lats.length; li++) {
                    for (let lo = 0; lo < lons.length; lo++) {
                        jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
                    }
                }
                return await Promise.all(jobs);
            };

            let batchResults: any[] | null = null;
            try {
                batchResults = await retryWithBackoff(
                    () => withTimeout(sampleOneStep(), STEP_TIMEOUT_MS, `swell ts=${ti}`),
                    STEP_RETRIES,
                    STEP_RETRY_BACKOFF_MS,
                    signal,
                );
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') throw err;
                console.warn(`[OceanDataProvider] Swell step ${ti + 1}/${timestamps.length} failed after ${STEP_RETRIES} retries — skipping.`, err);
                batchResults = null;
            }

            let anyNonZero = false;
            if (batchResults) {
                let idx = 0;
                for (let li = 0; li < lats.length; li++) {
                    for (let lo = 0; lo < lons.length; lo++) {
                        const result = batchResults[idx++];
                        if (result && typeof result === 'object' && result.length >= 2) {
                            const u = result[0];
                            const v = result[1];
                            // Height from 3rd channel if present, otherwise magnitude of u/v
                            const h = result[2] != null
                                ? result[2]
                                : Math.sqrt(u ** 2 + v ** 2);
                            swellHeight[li][lo][ti] = h;
                            // Direction waves come FROM (oceanographic convention)
                            swellDir[li][lo][ti] =
                                (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
                            // Period not reliably available from raw interpolator
                            swellPeriod[li][lo][ti] = 0;
                            if (h !== 0 || u !== 0 || v !== 0) anyNonZero = true;
                        }
                    }
                }
            }

            if (anyNonZero) {
                consecutiveEmpty = 0;
                lastNonEmptyIdx = ti;
            } else {
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) {
                    console.log(`[OceanDataProvider] Swell data ended at timestamp ${ti + 1}/${timestamps.length}`);
                    break;
                }
            }
        }
    } catch (err) {
        // Windy can throw internal tile cache errors during product switches —
        // return whatever data we managed to collect rather than failing entirely
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        console.warn('[OceanDataProvider] Swell sampling interrupted:', err);
    }

    // Settle on timestamps[0] so any in-flight tail-end tiles install on
    // an already-cached value before the caller switches product.
    store.set('timestamp', timestamps[0]);
    await waitForRedraw(150);

    // Trim arrays if early termination occurred
    const coverageEndTime = lastNonEmptyIdx >= 0 ? timestamps[lastNonEmptyIdx] : undefined;
    const trimLen = lastNonEmptyIdx >= 0 && lastNonEmptyIdx < timestamps.length - 1
        ? lastNonEmptyIdx + 1
        : timestamps.length;
    const trimmedTimestamps = timestamps.slice(0, trimLen);
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            swellHeight[li][lo].length = trimLen;
            swellDir[li][lo].length = trimLen;
            swellPeriod[li][lo].length = trimLen;
        }
    }

    const result: SwellGridData = { lats, lons, timestamps: trimmedTimestamps, swellHeight, swellDir, swellPeriod, modelRunTime, dataUpdateTime, coverageEndTime };
    setSwell(cacheKey, result);
    return result;
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
    signal?: AbortSignal,
): Promise<CurrentGridData | null> {
    return withWindyState(() =>
        fetchCurrentGridInner(bounds, departureTime, maxDurationHours, onProgress, signal),
    );
}

/**
 * Inner current grid fetch — does NOT save/restore Windy state. Caller wraps.
 */
export async function fetchCurrentGridInner(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onProgress?: (msg: string, pct: number) => void,
    signal?: AbortSignal,
): Promise<CurrentGridData | null> {
    const cacheKey = buildOceanCacheKey('current', bounds, departureTime, maxDurationHours);
    const cached = getCurrent(cacheKey);
    if (cached) {
        console.log('[OceanDataProvider] Current cache hit');
        return cached;
    }

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

    let hasAnyData = false;
    let modelRunTime: number | undefined;
    let dataUpdateTime: number | undefined;
    let lastNonEmptyIdx = -1;

    // Reference point for verifying product switch (centre of bounds)
    const refLat = (bounds.south + bounds.north) / 2;
    const refLon = (bounds.west + bounds.east) / 2;

    try {
        // Give the UI a label during the otherwise-silent product-switch wait.
        onProgress?.('Switching to currents forecast…', 0);

        store.set('overlay', 'currents');
        store.set('product', 'cmems');
        store.set('timestamp', timestamps[0]);
        await waitForProductReady(refLat, refLon, null);

        try {
            const product = products['cmems'];
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

        for (let ti = 0; ti < timestamps.length; ti++) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            onProgress?.(
                `Sampling currents ${ti + 1}/${timestamps.length}...`,
                Math.round((ti / timestamps.length) * 100),
            );

            const sampleOneStep = async (): Promise<any[] | null> => {
                if (ti > 0) {
                    store.set('timestamp', timestamps[ti]);
                    await waitForRedraw(150);
                }
                const interpolate = await getLatLonInterpolator();
                if (!interpolate) return null;
                const jobs: Promise<any>[] = [];
                for (let li = 0; li < lats.length; li++) {
                    for (let lo = 0; lo < lons.length; lo++) {
                        jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
                    }
                }
                return await Promise.all(jobs);
            };

            let batchResults: any[] | null = null;
            try {
                batchResults = await retryWithBackoff(
                    () => withTimeout(sampleOneStep(), STEP_TIMEOUT_MS, `current ts=${ti}`),
                    STEP_RETRIES,
                    STEP_RETRY_BACKOFF_MS,
                    signal,
                );
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') throw err;
                console.warn(`[OceanDataProvider] Current step ${ti + 1}/${timestamps.length} failed after ${STEP_RETRIES} retries — skipping.`, err);
                batchResults = null;
            }

            let anyNonZero = false;
            if (batchResults) {
                let idx = 0;
                for (let li = 0; li < lats.length; li++) {
                    for (let lo = 0; lo < lons.length; lo++) {
                        const result = batchResults[idx++];
                        if (result && typeof result === 'object' && result.length >= 2) {
                            currentU[li][lo][ti] = result[0];
                            currentV[li][lo][ti] = result[1];
                            if (result[0] !== 0 || result[1] !== 0) {
                                hasAnyData = true;
                                anyNonZero = true;
                            }
                        }
                    }
                }
            }

            if (anyNonZero) {
                consecutiveEmpty = 0;
                lastNonEmptyIdx = ti;
            } else if (hasAnyData) {
                // Only count consecutive empties after we've seen real data
                consecutiveEmpty++;
                if (consecutiveEmpty >= 2) {
                    console.log(`[OceanDataProvider] Current data ended at timestamp ${ti + 1}/${timestamps.length}`);
                    break;
                }
            }
        }
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        console.warn('[OceanDataProvider] Currents data unavailable:', err);
        return null;
    }

    // Settle on timestamps[0] so the next product switch (or outer restore)
    // doesn't orphan tiles still loading for the LAST scrubbed timestamp.
    store.set('timestamp', timestamps[0]);
    await waitForRedraw(150);

    if (!hasAnyData) {
        console.warn('[OceanDataProvider] No currents data found for this region (CMEMS may not cover it).');
        return null;
    }

    // Trim arrays if early termination occurred
    const coverageEndTime = lastNonEmptyIdx >= 0 ? timestamps[lastNonEmptyIdx] : undefined;
    const trimLen = lastNonEmptyIdx >= 0 && lastNonEmptyIdx < timestamps.length - 1
        ? lastNonEmptyIdx + 1
        : timestamps.length;
    const trimmedTimestamps = timestamps.slice(0, trimLen);
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            currentU[li][lo].length = trimLen;
            currentV[li][lo].length = trimLen;
        }
    }

    const result: CurrentGridData = { lats, lons, timestamps: trimmedTimestamps, currentU, currentV, modelRunTime, dataUpdateTime, coverageEndTime };
    setCurrent(cacheKey, result);
    return result;
}

/**
 * Fetch both swell and current grids in a single save/restore cycle.
 *
 * Instead of each function independently saving → switching → sampling → restoring
 * Windy state, this does one save → swell switch → swell sample → current switch →
 * current sample → restore. Eliminates one full restore + re-switch round-trip.
 *
 * Falls back to individual calls if either is already cached (since the cache hit
 * would skip the product switch anyway).
 */
export async function fetchOceanGrids(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onSwellProgress?: (msg: string, pct: number) => void,
    onCurrentProgress?: (msg: string, pct: number) => void,
    signal?: AbortSignal,
): Promise<{ swellGrid?: SwellGridData; currentGrid: CurrentGridData | null }> {
    return withWindyState(() =>
        fetchOceanGridsInner(bounds, departureTime, maxDurationHours, onSwellProgress, onCurrentProgress, signal),
    );
}

/**
 * Inner combined ocean fetch — does NOT save/restore Windy state. Caller wraps.
 */
export async function fetchOceanGridsInner(
    bounds: LatLonBounds,
    departureTime: number,
    maxDurationHours: number,
    onSwellProgress?: (msg: string, pct: number) => void,
    onCurrentProgress?: (msg: string, pct: number) => void,
    signal?: AbortSignal,
): Promise<{ swellGrid?: SwellGridData; currentGrid: CurrentGridData | null }> {
    // If both are cached, return immediately without touching Windy state
    const swellCacheKey = buildOceanCacheKey('swell', bounds, departureTime, maxDurationHours);
    const currentCacheKey = buildOceanCacheKey('current', bounds, departureTime, maxDurationHours);
    const cachedSwell = getSwell(swellCacheKey);
    const cachedCurrent = getCurrent(currentCacheKey);

    if (cachedSwell && cachedCurrent !== null) {
        console.log('[OceanDataProvider] Both ocean grids cached');
        return { swellGrid: cachedSwell, currentGrid: cachedCurrent };
    }

    // If only one is cached, fall back to individual inner calls
    if (cachedSwell) {
        const currentGrid = await fetchCurrentGridInner(bounds, departureTime, maxDurationHours, onCurrentProgress, signal);
        return { swellGrid: cachedSwell, currentGrid };
    }
    if (cachedCurrent !== null) {
        const swellGrid = await fetchSwellGridInner(bounds, departureTime, maxDurationHours, onSwellProgress, signal);
        return { swellGrid, currentGrid: cachedCurrent };
    }

    const { lats, lons, timestamps } = buildGrid(bounds, departureTime, maxDurationHours);

    if (timestamps.length === 0) {
        return { swellGrid: undefined, currentGrid: null };
    }

    const refLat = (bounds.south + bounds.north) / 2;
    const refLon = (bounds.west + bounds.east) / 2;

    let swellGrid: SwellGridData | undefined;
    let currentGrid: CurrentGridData | null = null;

    // --- Swell phase ---
    try {
        swellGrid = await _sampleSwellInner(lats, lons, timestamps, refLat, refLon, onSwellProgress, signal);
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        console.warn('[OceanDataProvider] Swell sampling interrupted:', err);
    }

    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    // Reset timestamp before switching product to avoid tile cache race.
    // The swell phase leaves the timestamp at the last sampled time; switching
    // product while tiles for that timestamp are still loading can trigger
    // SwitchableTileCache errors.
    store.set('timestamp', timestamps[0]);
    await waitForRedraw(150);

    // --- Current phase ---
    try {
        currentGrid = await _sampleCurrentInner(lats, lons, timestamps, refLat, refLon, onCurrentProgress, signal);
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        console.warn('[OceanDataProvider] Currents sampling interrupted:', err);
    }

    // Cache results
    if (swellGrid) setSwell(swellCacheKey, swellGrid);
    if (currentGrid) setCurrent(currentCacheKey, currentGrid);

    return { swellGrid, currentGrid };
}

/**
 * Inner swell sampling — assumes caller handles save/restore of Windy state.
 */
async function _sampleSwellInner(
    lats: number[],
    lons: number[],
    timestamps: number[],
    refLat: number,
    refLon: number,
    onProgress?: (msg: string, pct: number) => void,
    signal?: AbortSignal,
): Promise<SwellGridData> {
    const swellHeight: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const swellDir: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const swellPeriod: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    let modelRunTime: number | undefined;
    let dataUpdateTime: number | undefined;
    let lastNonEmptyIdx = -1;

    // Give the UI a label during the otherwise-silent product-switch wait
    // (waitForProductReady can take up to 5s with no progress callback).
    onProgress?.('Switching to swell forecast…', 0);

    const waveProduct = selectedWaveProduct();
    store.set('overlay', 'waves');
    store.set('product', waveProduct);
    store.set('timestamp', timestamps[0]);
    await waitForProductReady(refLat, refLon, null);

    try {
        const product = products[waveProduct];
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

    for (let ti = 0; ti < timestamps.length; ti++) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

        onProgress?.(
            `Sampling swell ${ti + 1}/${timestamps.length}...`,
            Math.round((ti / timestamps.length) * 100),
        );

        const sampleOneStep = async (): Promise<any[] | null> => {
            if (ti > 0) {
                store.set('timestamp', timestamps[ti]);
                await waitForRedraw(150);
            }
            const interpolate = await getLatLonInterpolator();
            if (!interpolate) return null;
            const jobs: Promise<any>[] = [];
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
                }
            }
            return await Promise.all(jobs);
        };

        let batchResults: any[] | null = null;
        try {
            batchResults = await retryWithBackoff(
                () => withTimeout(sampleOneStep(), STEP_TIMEOUT_MS, `swell ts=${ti}`),
                STEP_RETRIES,
                STEP_RETRY_BACKOFF_MS,
                signal,
            );
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            console.warn(`[OceanDataProvider] Swell step ${ti + 1}/${timestamps.length} failed after ${STEP_RETRIES} retries — skipping.`, err);
            batchResults = null;
        }

        let anyNonZero = false;
        if (batchResults) {
            let idx = 0;
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    const result = batchResults[idx++];
                    if (result && typeof result === 'object' && result.length >= 2) {
                        const u = result[0];
                        const v = result[1];
                        const h = result[2] != null
                            ? result[2]
                            : Math.sqrt(u ** 2 + v ** 2);
                        swellHeight[li][lo][ti] = h;
                        swellDir[li][lo][ti] =
                            (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
                        swellPeriod[li][lo][ti] = 0;
                        if (h !== 0 || u !== 0 || v !== 0) anyNonZero = true;
                    }
                }
            }
        }

        if (anyNonZero) {
            consecutiveEmpty = 0;
            lastNonEmptyIdx = ti;
        } else {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 2) {
                console.log(`[OceanDataProvider] Swell data ended at timestamp ${ti + 1}/${timestamps.length}`);
                break;
            }
        }
    }

    // Trim arrays
    const coverageEndTime = lastNonEmptyIdx >= 0 ? timestamps[lastNonEmptyIdx] : undefined;
    const trimLen = lastNonEmptyIdx >= 0 && lastNonEmptyIdx < timestamps.length - 1
        ? lastNonEmptyIdx + 1
        : timestamps.length;
    const trimmedTimestamps = timestamps.slice(0, trimLen);
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            swellHeight[li][lo].length = trimLen;
            swellDir[li][lo].length = trimLen;
            swellPeriod[li][lo].length = trimLen;
        }
    }

    return { lats, lons, timestamps: trimmedTimestamps, swellHeight, swellDir, swellPeriod, modelRunTime, dataUpdateTime, coverageEndTime };
}

/**
 * Inner current sampling — assumes caller handles save/restore of Windy state.
 */
async function _sampleCurrentInner(
    lats: number[],
    lons: number[],
    timestamps: number[],
    refLat: number,
    refLon: number,
    onProgress?: (msg: string, pct: number) => void,
    signal?: AbortSignal,
): Promise<CurrentGridData | null> {
    const currentU: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const currentV: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    let hasAnyData = false;
    let modelRunTime: number | undefined;
    let dataUpdateTime: number | undefined;

    // Give the UI a label during the otherwise-silent product-switch wait.
    onProgress?.('Switching to currents forecast…', 0);

    store.set('overlay', 'currents');
    store.set('product', 'cmems');
    store.set('timestamp', timestamps[0]);
    await waitForProductReady(refLat, refLon, null);

    try {
        const product = products['cmems'];
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
            `Sampling currents ${ti + 1}/${timestamps.length}...`,
            Math.round((ti / timestamps.length) * 100),
        );

        const sampleOneStep = async (): Promise<any[] | null> => {
            if (ti > 0) {
                store.set('timestamp', timestamps[ti]);
                await waitForRedraw(150);
            }
            const interpolate = await getLatLonInterpolator();
            if (!interpolate) return null;
            const jobs: Promise<any>[] = [];
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
                }
            }
            return await Promise.all(jobs);
        };

        let batchResults: any[] | null = null;
        try {
            batchResults = await retryWithBackoff(
                () => withTimeout(sampleOneStep(), STEP_TIMEOUT_MS, `current ts=${ti}`),
                STEP_RETRIES,
                STEP_RETRY_BACKOFF_MS,
                signal,
            );
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            console.warn(`[OceanDataProvider] Current step ${ti + 1}/${timestamps.length} failed after ${STEP_RETRIES} retries — skipping.`, err);
            batchResults = null;
        }

        let anyNonZero = false;
        if (batchResults) {
            let idx = 0;
            for (let li = 0; li < lats.length; li++) {
                for (let lo = 0; lo < lons.length; lo++) {
                    const result = batchResults[idx++];
                    if (result && typeof result === 'object' && result.length >= 2) {
                        currentU[li][lo][ti] = result[0];
                        currentV[li][lo][ti] = result[1];
                        if (result[0] !== 0 || result[1] !== 0) {
                            hasAnyData = true;
                            anyNonZero = true;
                        }
                    }
                }
            }
        }

        if (anyNonZero) {
            consecutiveEmpty = 0;
            lastNonEmptyIdx = ti;
        } else if (hasAnyData) {
            consecutiveEmpty++;
            if (consecutiveEmpty >= 2) {
                console.log(`[OceanDataProvider] Current data ended at timestamp ${ti + 1}/${timestamps.length}`);
                break;
            }
        }
    }

    if (!hasAnyData) {
        console.warn('[OceanDataProvider] No currents data found for this region (CMEMS may not cover it).');
        return null;
    }

    // Trim arrays
    const coverageEndTime = lastNonEmptyIdx >= 0 ? timestamps[lastNonEmptyIdx] : undefined;
    const trimLen = lastNonEmptyIdx >= 0 && lastNonEmptyIdx < timestamps.length - 1
        ? lastNonEmptyIdx + 1
        : timestamps.length;
    const trimmedTimestamps = timestamps.slice(0, trimLen);
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            currentU[li][lo].length = trimLen;
            currentV[li][lo].length = trimLen;
        }
    }

    return { lats, lons, timestamps: trimmedTimestamps, currentU, currentV, modelRunTime, dataUpdateTime, coverageEndTime };
}
