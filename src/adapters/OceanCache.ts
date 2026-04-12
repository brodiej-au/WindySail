import type { LatLonBounds, SwellGridData, CurrentGridData } from '../routing/types';

type OceanProduct = 'swell' | 'current';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const swellCache = new Map<string, CacheEntry<SwellGridData>>();
const currentCache = new Map<string, CacheEntry<CurrentGridData>>();

const STALE_MS = 30 * 60 * 1000;

function roundToDecimals(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function roundToNearestHour(timestamp: number): number {
    const HOUR_MS = 60 * 60 * 1000;
    return Math.round(timestamp / HOUR_MS) * HOUR_MS;
}

export function buildOceanCacheKey(
    product: OceanProduct,
    bounds: LatLonBounds,
    startTime: number,
    maxDuration: number,
): string {
    const N = roundToDecimals(bounds.north, 1);
    const S = roundToDecimals(bounds.south, 1);
    const E = roundToDecimals(bounds.east, 1);
    const W = roundToDecimals(bounds.west, 1);
    const roundedHour = roundToNearestHour(startTime);
    return `${product}:${N},${S},${E},${W}:${roundedHour}:${maxDuration}`;
}

function getEntry<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > STALE_MS) {
        cache.delete(key);
        return null;
    }
    return entry.data;
}

function setEntry<T>(cache: Map<string, CacheEntry<T>>, key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
}

export function getSwell(key: string): SwellGridData | null {
    return getEntry(swellCache, key);
}

export function setSwell(key: string, data: SwellGridData): void {
    setEntry(swellCache, key, data);
}

export function getCurrent(key: string): CurrentGridData | null {
    return getEntry(currentCache, key);
}

export function setCurrent(key: string, data: CurrentGridData): void {
    setEntry(currentCache, key, data);
}

export function clear(): void {
    swellCache.clear();
    currentCache.clear();
}
