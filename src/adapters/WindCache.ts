import type { LatLonBounds, WindGridData, WindModelId } from '../routing/types';

// Cache entry structure
interface CacheEntry {
    grid: WindGridData;
    timestamp: number; // when the entry was cached (Date.now())
}

// In-memory cache storage
const cache = new Map<string, CacheEntry>();

// 30 minutes in milliseconds
const STALE_MS = 30 * 60 * 1000;

/**
 * Round a number to a given number of decimal places
 */
function roundToDecimals(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Round a time to the nearest hour
 */
function roundToNearestHour(timestamp: number): number {
    const HOUR_MS = 60 * 60 * 1000;
    return Math.round(timestamp / HOUR_MS) * HOUR_MS;
}

/**
 * Build a cache key from model, bounds, and time range.
 * Bounds are rounded to 1 decimal place and startTime is rounded to nearest hour.
 */
export function buildCacheKey(
    model: WindModelId,
    bounds: LatLonBounds,
    startTime: number,
    maxDuration: number,
): string {
    const roundedNorth = roundToDecimals(bounds.north, 1);
    const roundedSouth = roundToDecimals(bounds.south, 1);
    const roundedEast = roundToDecimals(bounds.east, 1);
    const roundedWest = roundToDecimals(bounds.west, 1);
    const roundedStartTime = roundToNearestHour(startTime);

    return `${model}:${roundedNorth},${roundedSouth},${roundedEast},${roundedWest}:${roundedStartTime}:${maxDuration}`;
}

/**
 * Get a cached WindGridData by key.
 * Returns null if the entry doesn't exist or is stale (> 30 minutes old).
 */
export function get(key: string): WindGridData | null {
    const entry = cache.get(key);

    if (!entry) {
        return null;
    }

    const age = Date.now() - entry.timestamp;
    if (age > STALE_MS) {
        // Entry is stale, remove it and return null
        cache.delete(key);
        return null;
    }

    return entry.grid;
}

/**
 * Set a cached WindGridData by key.
 */
export function set(key: string, grid: WindGridData): void {
    cache.set(key, {
        grid,
        timestamp: Date.now(),
    });
}

/**
 * Invalidate cache entries.
 * If model is provided, removes entries whose key starts with that model.
 * If no model is provided, clears all entries.
 */
export function invalidate(model?: WindModelId): void {
    if (model === undefined) {
        // Clear all
        cache.clear();
    } else {
        // Remove entries for this model
        const prefix = `${model}:`;
        const keysToDelete: string[] = [];

        for (const key of cache.keys()) {
            if (key.startsWith(prefix)) {
                keysToDelete.push(key);
            }
        }

        for (const key of keysToDelete) {
            cache.delete(key);
        }
    }
}

/**
 * Clear all cache entries.
 */
export function clear(): void {
    cache.clear();
}
