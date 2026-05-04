import { BACKEND_BASE_URL, POST_TIMEOUT_MS } from './config';
import { getEmail, emailHash } from './userIdentity';
import type { SavedRoute, PolarData } from '../routing/types';

/**
 * Sends a JSON POST to the backend with a timeout. Throws on non-2xx.
 */
async function post(path: string, body: unknown): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
    try {
        const res = await fetch(BACKEND_BASE_URL + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

// Sync identity is now hash-only. We never transmit the raw email or a
// persistent device ID. Same email across devices ⇒ same hash ⇒ same
// cloud account; the server keys docs at users/{emailHash}.
async function buildIdentity(): Promise<{ emailHash: string } | null> {
    const email = getEmail();
    if (!email) return null;
    const hash = await emailHash(email);
    return { emailHash: hash };
}

// Routes -------------------------------------------------------------------

export async function pullRoutes(): Promise<SavedRoute[] | null> {
    const ident = await buildIdentity();
    if (!ident) return null;
    try {
        const res = await post('/sync/routes/list', ident);
        return Array.isArray(res?.routes) ? (res.routes as SavedRoute[]) : [];
    } catch {
        return null;
    }
}

export async function pushRoute(route: SavedRoute): Promise<void> {
    const ident = await buildIdentity();
    if (!ident) return;
    try {
        const payload = { ...ident, route: { ...route, updatedAt: Date.now() } };
        await post('/sync/routes/upsert', payload);
    } catch {
        // Fire-and-forget; swallow failures so UI stays responsive.
    }
}

export async function deleteRemoteRoute(routeId: string): Promise<void> {
    const ident = await buildIdentity();
    if (!ident) return;
    try {
        await post('/sync/routes/delete', { ...ident, routeId });
    } catch {}
}

// Polars -------------------------------------------------------------------

export async function pullPolars(): Promise<PolarData[] | null> {
    const ident = await buildIdentity();
    if (!ident) return null;
    try {
        const res = await post('/sync/polars/list', ident);
        return Array.isArray(res?.polars) ? (res.polars as PolarData[]) : [];
    } catch {
        return null;
    }
}

export async function pushPolar(polar: PolarData): Promise<void> {
    const ident = await buildIdentity();
    if (!ident) return;
    try {
        const payload = { ...ident, polar: { ...polar, updatedAt: Date.now() } };
        await post('/sync/polars/upsert', payload);
    } catch {}
}

export async function deleteRemotePolar(polarName: string): Promise<void> {
    const ident = await buildIdentity();
    if (!ident) return;
    try {
        await post('/sync/polars/delete', { ...ident, polarName });
    } catch {}
}

/** True if the current user is signed in with an email, i.e. sync is active. */
export function isSyncEnabled(): boolean {
    return getEmail() !== null;
}

// Last route (the most recent calculation — restored automatically on open) ----

export interface LastRoutePayload {
    start: { lat: number; lon: number };
    end: { lat: number; lon: number };
    waypoints: { lat: number; lon: number }[];
    departureTime: number;
    polarName: string;
    selectedModels: string[];
    routingOptions: Record<string, unknown>;
}

export async function pullLastRoute(): Promise<LastRoutePayload | null> {
    const ident = await buildIdentity();
    if (!ident) return null;
    try {
        const res = await post('/sync/last-route/get', ident);
        return (res?.lastRoute as LastRoutePayload | null) ?? null;
    } catch {
        return null;
    }
}

export async function pushLastRoute(lastRoute: LastRoutePayload): Promise<void> {
    const ident = await buildIdentity();
    if (!ident) return;
    try {
        await post('/sync/last-route/set', {
            ...ident,
            lastRoute: { ...lastRoute, updatedAt: Date.now() },
        });
    } catch {}
}

// User settings -----------------------------------------------------------

export async function pullSettings<T extends Record<string, unknown>>(): Promise<T | null> {
    const ident = await buildIdentity();
    if (!ident) return null;
    try {
        const res = await post('/sync/settings/get', ident);
        return (res?.settings as T | null) ?? null;
    } catch {
        return null;
    }
}

export async function pushSettings(settings: Record<string, unknown>): Promise<void> {
    const ident = await buildIdentity();
    if (!ident) return;
    try {
        await post('/sync/settings/set', {
            ...ident,
            settings: { ...settings, updatedAt: Date.now() },
        });
    } catch {}
}
