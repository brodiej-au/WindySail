import type { PolarData } from '../routing/types';
import bavaria38 from './polars/bavaria38.json';
import jeanneauSO440 from './polars/jeanneau-so440.json';
import beneteuFirst40 from './polars/beneteau-first40.json';

/**
 * Bundled polars (immutable).
 * More polars will be added in Task 16.
 */
const BUNDLED_POLARS: PolarData[] = [
    bavaria38 as PolarData,
    jeanneauSO440 as PolarData,
    beneteuFirst40 as PolarData,
];

const CUSTOM_POLARS_STORAGE_KEY = 'windysail-custom-polars';

/**
 * Get all polars: bundled + custom.
 */
export function getAllPolars(): PolarData[] {
    return [...BUNDLED_POLARS, ...getCustomPolars()];
}

/**
 * Lookup a polar by name.
 * Falls back to Bavaria 38 (first bundled) if not found.
 */
export function getPolarByName(name: string): PolarData {
    const allPolars = getAllPolars();
    const found = allPolars.find(p => p.name === name);
    return found || BUNDLED_POLARS[0];
}

/**
 * Get custom polars from localStorage.
 * Returns empty array on parse error.
 */
export function getCustomPolars(): PolarData[] {
    try {
        const stored = localStorage.getItem(CUSTOM_POLARS_STORAGE_KEY);
        if (!stored) {
            return [];
        }
        const parsed = JSON.parse(stored) as PolarData[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // On parse error, return empty array
        return [];
    }
}

/**
 * Save a custom polar to localStorage.
 * Upserts by name (replaces existing polar with same name).
 */
export function saveCustomPolar(polar: PolarData): void {
    try {
        const customs = getCustomPolars();
        // Remove existing polar with same name
        const filtered = customs.filter(p => p.name !== polar.name);
        // Add the new polar
        filtered.push(polar);
        localStorage.setItem(CUSTOM_POLARS_STORAGE_KEY, JSON.stringify(filtered));
    } catch {
        // Silently fail if localStorage is unavailable
    }
}

/**
 * Delete a custom polar from localStorage by name.
 */
export function deleteCustomPolar(name: string): void {
    try {
        const customs = getCustomPolars();
        const filtered = customs.filter(p => p.name !== name);
        localStorage.setItem(CUSTOM_POLARS_STORAGE_KEY, JSON.stringify(filtered));
    } catch {
        // Silently fail if localStorage is unavailable
    }
}
