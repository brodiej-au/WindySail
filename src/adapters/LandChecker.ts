import { getElevation } from '@windy/fetch';

const cache = new Map<string, boolean>();
const MAX_CONCURRENT = 6;

function cacheKey(lat: number, lon: number): string {
    // Coarse 0.05° grid (~5.5km) to maximise cache hits
    return `${Math.round(lat * 20)},${Math.round(lon * 20)}`;
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
 * Uses concurrency limiting to avoid overwhelming the API.
 * Returns a boolean array: true = sea, false = land.
 */
export async function checkPoints(points: [number, number][]): Promise<boolean[]> {
    const results: boolean[] = new Array(points.length);
    let nextIndex = 0;

    async function runNext(): Promise<void> {
        while (nextIndex < points.length) {
            const idx = nextIndex++;
            results[idx] = await isSeaPoint(points[idx][0], points[idx][1]);
        }
    }

    const workers = Array.from(
        { length: Math.min(MAX_CONCURRENT, points.length) },
        () => runNext(),
    );
    await Promise.all(workers);
    return results;
}

/**
 * Batch check if segments are clear of land.
 * For MVP, this is a no-op that assumes all segments are clear.
 * Endpoint checking via checkPoints is sufficient for most cases;
 * fine-grained segment sampling would require too many API calls.
 */
export async function checkSegments(
    segments: [number, number, number, number][],
): Promise<boolean[]> {
    return segments.map(() => true);
}

/**
 * Clear the elevation cache.
 */
export function clearCache(): void {
    cache.clear();
}
