import { mapTilesRecord } from '@windy/baseMap';

const TILE_SIZE = 256;
const SAMPLE_ZOOM = 10; // ~150m/pixel — catches most islands
const SEGMENT_SAMPLE_KM = 1.0; // sample every ~1km along each segment
const tileCache = new Map<string, ImageData | null>();

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

/**
 * Load a landmask tile into an offscreen canvas and return its ImageData.
 */
async function loadTile(tx: number, ty: number): Promise<ImageData | null> {
    const key = `${SAMPLE_ZOOM}/${tx}/${ty}`;
    const cached = tileCache.get(key);
    if (cached !== undefined) return cached;

    try {
        const tiles = mapTilesRecord();
        const url = tiles.landmaskmap
            .replace('{z}', String(SAMPLE_ZOOM))
            .replace('{x}', String(tx))
            .replace('{y}', String(ty));

        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
        tileCache.set(key, data);
        return data;
    } catch {
        tileCache.set(key, null);
        return null;
    }
}

/**
 * Sample the landmask tile at a single point.
 * Returns true if the point is sea (valid for sailing).
 */
function isSeaPointSync(lat: number, lon: number): boolean {
    const { tx, ty, px, py } = latLonToTilePixel(lat, lon, SAMPLE_ZOOM);
    const key = `${SAMPLE_ZOOM}/${tx}/${ty}`;
    const data = tileCache.get(key);
    if (!data) return true; // tile not loaded — assume sea

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
    await Promise.all(tiles.map(({ tx, ty }) => loadTile(tx, ty)));
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
    await Promise.all(tiles.map(({ tx, ty }) => loadTile(tx, ty)));

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
}
