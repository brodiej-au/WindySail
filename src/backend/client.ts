import { BACKEND_BASE_URL, POST_TIMEOUT_MS } from './config';
import { enqueue, drain } from './eventQueue';
import type { QueuedEvent } from './eventQueue';

// --- Anonymous identity model -------------------------------------------------
// Per Windy's data-handling policy, no concrete user pointers (email,
// persistent device UUID) leave the client. The only optional identifier we
// transmit is `emailHash` — a one-way SHA-256 of the user's Windy email,
// computed in userIdentity.ts. It's null for users not signed into Windy.
//
// We deliberately do NOT send a stable per-device ID. Per-device analytics
// is sacrificed for compliance. Recurring usage analytics (DAU / WAU /
// session counts) is handled by Google Analytics on the client; the
// backend records only one-shot events: /install, /disclaimer-ack,
// /route. Heartbeats were removed in 0.15.0.

export interface InstallBody {
    emailHash: string | null;
    pluginVersion: string;
    usedLang: string;
    userAgent: string;
}
export interface DisclaimerBody {
    emailHash: string | null;
    pluginVersion: string;
    disclaimerVersion: string;
    acceptedAt: string;
}

export interface RoutePoint {
    lat: number;
    lon: number;
    name?: string;
}

export interface RouteResultSummary {
    model: string;
    durationHours: number;
    totalDistanceNm: number;
    avgSpeedKt: number;
    maxTws: number;
    etaMs: number;
}

export interface RouteBody {
    emailHash: string | null;
    pluginVersion: string;
    usedLang: string;
    mode: 'single' | 'departure';
    startedAt: string;
    completedAt: string;
    departureTime: string;
    polarName: string;
    motorboatMode: boolean;
    selectedModels: string[];
    start: RoutePoint;
    end: RoutePoint;
    waypointCount: number;
    waypoints: RoutePoint[];
    results: RouteResultSummary[];
    failedReason: string | null;
}

async function send(path: QueuedEvent['path'], body: unknown): Promise<void> {
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
    } finally {
        clearTimeout(timer);
    }
}

async function sendOrQueue(path: QueuedEvent['path'], body: Record<string, unknown>): Promise<void> {
    try {
        await send(path, body);
    } catch {
        enqueue({ path, body });
    }
}

export async function postInstall(body: InstallBody): Promise<void> {
    return sendOrQueue('/install', body as unknown as Record<string, unknown>);
}

export async function postDisclaimerAck(body: DisclaimerBody): Promise<void> {
    return sendOrQueue('/disclaimer-ack', body as unknown as Record<string, unknown>);
}

export async function postRoute(body: RouteBody): Promise<void> {
    return sendOrQueue('/route', body as unknown as Record<string, unknown>);
}

export async function flushPendingEvents(): Promise<void> {
    await drain(e => send(e.path, e.body));
}
