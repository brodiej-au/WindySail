import type { PolarData } from '../routing/types';
import { pushPolar, deleteRemotePolar, pullPolars, isSyncEnabled } from '../backend/sync';

// Motorboat sentinel (at top of dropdown, not alphabetised)
import motorboat from './polars/motorboat.json';

// Cruising Monohulls
import bavaria38 from './polars/bavaria38.json';
import jeanneauSO440 from './polars/jeanneau-so440.json';
import beneteuFirst40 from './polars/beneteau-first40.json';
import catalina36 from './polars/catalina-36.json';
import hallbergRassy40 from './polars/hallberg-rassy-40.json';
import amel50 from './polars/amel-50.json';
import islandPacket38 from './polars/island-packet-38.json';
import bavaria46 from './polars/bavaria-46.json';
import hanse388 from './polars/hanse-388.json';
import dufour412 from './polars/dufour-412.json';
import xYacht43 from './polars/x-yacht-43.json';
import oyster565 from './polars/oyster-565.json';

// Catamarans & Trimarans
import lagoon42 from './polars/lagoon-42.json';
import fountainePajot45 from './polars/fountaine-pajot-45.json';
import outremer51 from './polars/outremer-51.json';
import neel47 from './polars/neel-47.json';
import gunboat68 from './polars/gunboat-68.json';

// Performance / Racing
import j111 from './polars/j-111.json';
import beneteuFigaro3 from './polars/beneteau-figaro-3.json';
import first36 from './polars/first-36.json';
import sunFast3300 from './polars/sun-fast-3300.json';
import dehler38sq from './polars/dehler-38sq.json';
import clipper70 from './polars/clipper-70.json';

// Classic / Small
import contessa32 from './polars/contessa-32.json';
import folkboat from './polars/folkboat.json';
import j24 from './polars/j-24.json';
import laser28 from './polars/laser-28.json';

/**
 * Bundled polars (immutable), sorted alphabetically by name.
 */
const BUNDLED_POLARS: PolarData[] = [
    motorboat as PolarData,
    amel50 as PolarData,
    bavaria38 as PolarData,
    bavaria46 as PolarData,
    beneteuFigaro3 as PolarData,
    beneteuFirst40 as PolarData,
    catalina36 as PolarData,
    clipper70 as PolarData,
    contessa32 as PolarData,
    dehler38sq as PolarData,
    dufour412 as PolarData,
    first36 as PolarData,
    folkboat as PolarData,
    fountainePajot45 as PolarData,
    gunboat68 as PolarData,
    hallbergRassy40 as PolarData,
    hanse388 as PolarData,
    islandPacket38 as PolarData,
    j24 as PolarData,
    j111 as PolarData,
    jeanneauSO440 as PolarData,
    lagoon42 as PolarData,
    laser28 as PolarData,
    neel47 as PolarData,
    outremer51 as PolarData,
    oyster565 as PolarData,
    sunFast3300 as PolarData,
    xYacht43 as PolarData,
];

// Integrity check: every polar's speeds[][] dimensions must match twaAngles × twsSpeeds.
for (const p of BUNDLED_POLARS) {
    if (p.speeds.length !== p.twaAngles.length) {
        throw new Error(`Polar "${p.name}" has ${p.speeds.length} rows but ${p.twaAngles.length} TWA angles.`);
    }
    for (let i = 0; i < p.speeds.length; i++) {
        if (p.speeds[i].length !== p.twsSpeeds.length) {
            throw new Error(`Polar "${p.name}" row ${i} has ${p.speeds[i].length} cols but ${p.twsSpeeds.length} TWS speeds.`);
        }
    }
}

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
    pushPolar(polar);
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
    deleteRemotePolar(name);
}

/**
 * Pull remote custom polars and merge into localStorage. Remote is authoritative
 * for names it covers; local-only polars are preserved and pushed up so the
 * server picks them up on first sync. No-op if the user isn't signed in.
 */
export async function syncCustomPolarsFromRemote(): Promise<void> {
    if (!isSyncEnabled()) return;
    const remote = await pullPolars();
    if (!remote) return;
    const local = getCustomPolars();
    const byName = new Map<string, PolarData>();
    for (const p of local) byName.set(p.name, p);
    for (const p of remote) byName.set(p.name, p);
    const merged = Array.from(byName.values());
    try {
        localStorage.setItem(CUSTOM_POLARS_STORAGE_KEY, JSON.stringify(merged));
    } catch {}
    // Push local-only polars up.
    const remoteNames = new Set(remote.map(p => p.name));
    for (const p of local) {
        if (!remoteNames.has(p.name)) pushPolar(p);
    }
}
