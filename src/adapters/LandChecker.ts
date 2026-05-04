import { mapTilesRecord } from '@windy/baseMap';

const TILE_SIZE = 256;
const SAMPLE_ZOOM = 10; // ~150m/pixel — catches most islands
const SEGMENT_SAMPLE_KM = 1.0; // sample every ~1km along each segment

// Tile load robustness — landmask requests must compete with Windy's own
// data-tile traffic during routing. Without bounds, a stalled image fetch
// hangs `Promise.all` forever and the router never receives LAND_RESULTS.
const TILE_LOAD_TIMEOUT_MS = 8000;
const TILE_LOAD_MAX_ATTEMPTS = 3;
const TILE_LOAD_BACKOFF_MS = 400;

const tileCache = new Map<string, ImageData>(); // successful loads only
const inFlight = new Map<string, Promise<ImageData | null>>(); // dedupe concurrent loads

/**
 * Convert lat/lon to slippy-map tile coords + pixel offset within that tile.
 */
function latLonToTilePixel(lat: number, lon: number, zoom: number) {
    const n = 2 ** zoom;
    const latRad = (lat * Math.PI) / 180;
    const xF = ((lon + 180) / 360) * n;
    const yF = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const tx = Math.floor(xF);
    const ty = Math.floor(yF);
    return {
        tx,
        ty,
        px: Math.min(Math.floor((xF - tx) * TILE_SIZE), TILE_SIZE - 1),
        py: Math.min(Math.floor((yF - ty) * TILE_SIZE), TILE_SIZE - 1),
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * Single attempt to fetch a landmask tile image and return its raster data.
 * Rejects on network error or when the image takes longer than TILE_LOAD_TIMEOUT_MS.
 */
async function fetchTileImage(tx: number, ty: number): Promise<ImageData> {
    const tiles = mapTilesRecord();
    const url = tiles.landmaskmap
        .replace('{z}', String(SAMPLE_ZOOM))
        .replace('{x}', String(tx))
        .replace('{y}', String(ty));

    const img = new Image();
    img.crossOrigin = 'anonymous';

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const loadPromise = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('image load error'));
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
            // Cancel the outstanding fetch so we don't leak the connection slot.
            img.src = '';
            reject(new Error('image load timeout'));
        }, TILE_LOAD_TIMEOUT_MS);
    });

    img.src = url;
    try {
        await Promise.race([loadPromise, timeoutPromise]);
    } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
    }

    const canvas = document.createElement('canvas');
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
}

/**
 * Load a landmask tile with bounded retries.
 *
 * Returns the raster on success, or `null` after `TILE_LOAD_MAX_ATTEMPTS`
 * consecutive failures. Failures are NOT cached, so a subsequent routing
 * run gets a fresh chance to succeed (browser concurrency conditions vary).
 *
 * Concurrent calls for the same tile share a single in-flight promise.
 */
async function loadTile(tx: number, ty: number): Promise<ImageData | null> {
    const key = `${SAMPLE_ZOOM}/${tx}/${ty}`;
    const cached = tileCache.get(key);
    if (cached) return cached;

    const pending = inFlight.get(key);
    if (pending) return pending;

    const attempt = (async (): Promise<ImageData | null> => {
        for (let i = 1; i <= TILE_LOAD_MAX_ATTEMPTS; i++) {
            try {
                const data = await fetchTileImage(tx, ty);
                tileCache.set(key, data);
                return data;
            } catch (err) {
                if (i < TILE_LOAD_MAX_ATTEMPTS) {
                    await sleep(TILE_LOAD_BACKOFF_MS * i);
                    continue;
                }
                console.warn(
                    `[LandChecker] Tile ${key} failed after ${TILE_LOAD_MAX_ATTEMPTS} attempts:`,
                    err,
                );
                return null;
            }
        }
        return null;
    })().finally(() => {
        inFlight.delete(key);
    });

    inFlight.set(key, attempt);
    return attempt;
}

/**
 * Sample the landmask tile at a single point.
 * Returns true if the point is sea (valid for sailing).
 *
 * Fallback policy: if the tile failed to load (not in cache after the batch
 * has awaited it), treat the point as LAND. Treating unknown areas as sea
 * silently routes through actual land when tiles are missing — far worse
 * than a clear "blocked by land" error that the user can retry.
 */
function isSeaPointSync(lat: number, lon: number): boolean {
    const { tx, ty, px, py } = latLonToTilePixel(lat, lon, SAMPLE_ZOOM);
    const key = `${SAMPLE_ZOOM}/${tx}/${ty}`;
    const data = tileCache.get(key);
    if (!data) return false; // tile unavailable — fail-safe (assume land)

    const idx = (py * TILE_SIZE + px) * 4;
    return data.data[idx + 3] < 128; // transparent = sea
}

/**
 * Collect all unique tile coords from a set of lat/lon points.
 */
function collectTiles(points: Iterable<[number, number]>): { tx: number; ty: number }[] {
    const seen = new Set<string>();
    const tiles: { tx: number; ty: number }[] = [];
    for (const [lat, lon] of points) {
        const { tx, ty } = latLonToTilePixel(lat, lon, SAMPLE_ZOOM);
        const key = `${tx},${ty}`;
        if (!seen.has(key)) {
            seen.add(key);
            tiles.push({ tx, ty });
        }
    }
    return tiles;
}

/**
 * Batch check if points are sea (valid for sailing).
 * Uses Windy's landmask tiles — zero API calls, just raster sampling.
 */
export async function checkPoints(points: [number, number][]): Promise<boolean[]> {
    const tiles = collectTiles(points);
    const results = await Promise.all(tiles.map(({ tx, ty }) => loadTile(tx, ty)));
    const failed = results.filter(r => r === null).length;
    if (failed > 0) {
        console.warn(`[LandChecker] ${failed}/${tiles.length} tiles unavailable; affected points will be treated as land.`);
    }
    return points.map(([lat, lon]) => isSeaPointSync(lat, lon));
}

/**
 * Batch check if segments are clear of land.
 * Samples multiple points along each segment to catch islands.
 */
export async function checkSegments(
    segments: [number, number, number, number][],
): Promise<boolean[]> {
    // Generate sample points along each segment
    const allSamples: [number, number][] = [];
    const segmentRanges: [number, number][] = []; // [startIdx, count] per segment

    for (const [lat1, lon1, lat2, lon2] of segments) {
        const dLat = lat2 - lat1;
        const dLon = lon2 - lon1;
        // Approximate distance in km (rough, fine for sampling density)
        const distKm = Math.sqrt((dLat * 111) ** 2 + (dLon * 111 * Math.cos((lat1 * Math.PI) / 180)) ** 2);
        const numSamples = Math.max(1, Math.ceil(distKm / SEGMENT_SAMPLE_KM));
        const startIdx = allSamples.length;

        for (let i = 1; i < numSamples; i++) {
            const t = i / numSamples;
            allSamples.push([lat1 + dLat * t, lon1 + dLon * t]);
        }
        segmentRanges.push([startIdx, allSamples.length - startIdx]);
    }

    // Pre-load tiles for all sample points
    const tiles = collectTiles(allSamples);
    const results = await Promise.all(tiles.map(({ tx, ty }) => loadTile(tx, ty)));
    const failed = results.filter(r => r === null).length;
    if (failed > 0) {
        console.warn(`[LandChecker] ${failed}/${tiles.length} tiles unavailable; affected segments will be treated as blocked.`);
    }

    // Check each segment: clear if ALL sample points are sea
    return segmentRanges.map(([start, count]) => {
        for (let i = start; i < start + count; i++) {
            if (!isSeaPointSync(allSamples[i][0], allSamples[i][1])) {
                return false; // hit land
            }
        }
        return true;
    });
}

/**
 * Clear the tile cache.
 */
export function clearCache(): void {
    tileCache.clear();
    inFlight.clear();
}

/**
 * Pre-fetch all landmask tiles intersecting a lat/lon bounding box. Best
 * called BEFORE the wind/ocean sampling pipeline starts: by the time the
 * routing worker requests `CHECK_LAND`, every tile is in cache and no
 * landmask network requests have to compete with Windy's own data-tile
 * traffic for browser connection slots.
 *
 * Returns the count of tiles requested vs successfully loaded so callers
 * can warn or abort early when the basemap server is failing.
 */
export async function prefetchTilesForBounds(
    south: number,
    north: number,
    west: number,
    east: number,
    onProgress?: (loaded: number, total: number) => void,
): Promise<{ requested: number; loaded: number }> {
    const tiles = enumerateTilesForBounds(south, north, west, east);
    if (tiles.length === 0) return { requested: 0, loaded: 0 };
    let loaded = 0;
    onProgress?.(0, tiles.length);
    const results = await Promise.all(
        tiles.map(async ({ tx, ty }) => {
            const result = await loadTile(tx, ty);
            loaded++;
            onProgress?.(loaded, tiles.length);
            return result;
        }),
    );
    return {
        requested: tiles.length,
        loaded: results.filter(r => r !== null).length,
    };
}

function enumerateTilesForBounds(
    south: number,
    north: number,
    west: number,
    east: number,
): { tx: number; ty: number }[] {
    // Walk lat/lon grid at SAMPLE_ZOOM tile spacing to enumerate every tile
    // intersecting the box. 360 / 2^zoom degrees per tile in longitude;
    // latitude tile heights aren't uniform on the slippy projection but the
    // step is conservative enough at z=10 to hit every covering tile.
    const step = 360 / 2 ** SAMPLE_ZOOM; // ~0.35° at z=10
    const seen = new Set<string>();
    const tiles: { tx: number; ty: number }[] = [];
    const addTile = (lat: number, lon: number) => {
        const { tx, ty } = latLonToTilePixel(lat, lon, SAMPLE_ZOOM);
        const key = `${tx},${ty}`;
        if (!seen.has(key)) {
            seen.add(key);
            tiles.push({ tx, ty });
        }
    };
    for (let lat = south; lat < north; lat += step) {
        for (let lon = west; lon < east; lon += step) {
            addTile(lat, lon);
        }
    }
    // Always include the four corners so a small bbox below the step size
    // still gets its tiles covered.
    addTile(south, west);
    addTile(south, east);
    addTile(north, west);
    addTile(north, east);
    return tiles;
}

/**
 * Diagnostic snapshot of the tile cache state. Exposed via
 * `window.__sailRouterDebug.landCache()` for in-browser inspection.
 */
export function getCacheStats(): {
    cachedTiles: number;
    inFlightTiles: number;
    cachedTileKeys: string[];
    inFlightTileKeys: string[];
} {
    return {
        cachedTiles: tileCache.size,
        inFlightTiles: inFlight.size,
        cachedTileKeys: [...tileCache.keys()].sort(),
        inFlightTileKeys: [...inFlight.keys()].sort(),
    };
}
