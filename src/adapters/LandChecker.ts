import { getElevation } from '@windy/fetch';

const cache = new Map<string, boolean>();

function cacheKey(lat: number, lon: number): string {
    return `${Math.round(lat * 100)},${Math.round(lon * 100)}`;
}

/**
 * Check if a single point is sea (elevation <= 0).
 */
async function isSeaPoint(lat: number, lon: number): Promise<boolean> {
    const key = cacheKey(lat, lon);
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const result = await getElevation(lat, lon);
        const isSea = result.data <= 0;
        cache.set(key, isSea);
        return isSea;
    } catch {
        // If elevation check fails, assume sea (permissive — avoids blocking routes)
        return true;
    }
}

/**
 * Batch check if points are sea (valid for sailing).
 * Returns a boolean array: true = sea, false = land.
 */
export async function checkPoints(points: [number, number][]): Promise<boolean[]> {
    return Promise.all(points.map(([lat, lon]) => isSeaPoint(lat, lon)));
}

/**
 * Check if a straight-line segment crosses land.
 * Samples every ~0.01° along the great circle.
 * Returns true if the segment is clear (no land crossing).
 */
async function isSegmentClear(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
): Promise<boolean> {
    const dLat = toLat - fromLat;
    const dLon = toLon - fromLon;
    const maxDelta = Math.max(Math.abs(dLat), Math.abs(dLon));
    const steps = Math.max(1, Math.ceil(maxDelta / 0.01));

    for (let i = 1; i < steps; i++) {
        const frac = i / steps;
        const lat = fromLat + dLat * frac;
        const lon = fromLon + dLon * frac;
        const isSea = await isSeaPoint(lat, lon);
        if (!isSea) {
            return false;
        }
    }
    return true;
}

/**
 * Batch check if segments are clear of land.
 * Returns a boolean array: true = clear, false = crosses land.
 */
export async function checkSegments(
    segments: [number, number, number, number][],
): Promise<boolean[]> {
    return Promise.all(
        segments.map(([fromLat, fromLon, toLat, toLon]) =>
            isSegmentClear(fromLat, fromLon, toLat, toLon),
        ),
    );
}

/**
 * Clear the elevation cache.
 */
export function clearCache(): void {
    cache.clear();
}
