import { BACKEND_BASE_URL, POST_TIMEOUT_MS, HEARTBEAT_MIN_INTERVAL_MS } from './config';
import { enqueue, drain } from './eventQueue';
import type { QueuedEvent } from './eventQueue';

const HEARTBEAT_KEY = 'windysail-last-heartbeat';

export interface InstallBody {
    deviceId: string; email: string | null; pluginVersion: string; usedLang: string; userAgent: string;
}
export interface HeartbeatBody {
    deviceId: string; email: string | null; pluginVersion: string; usedLang: string;
}
export interface DisclaimerBody {
    deviceId: string; email: string | null; pluginVersion: string; disclaimerVersion: string; acceptedAt: string;
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

export async function postHeartbeat(body: HeartbeatBody): Promise<void> {
    try {
        await send('/heartbeat', body);
        try { localStorage.setItem(HEARTBEAT_KEY, new Date().toISOString()); } catch {}
    } catch {
        enqueue({ path: '/heartbeat', body: body as unknown as Record<string, unknown> });
    }
}

export async function postDisclaimerAck(body: DisclaimerBody): Promise<void> {
    return sendOrQueue('/disclaimer-ack', body as unknown as Record<string, unknown>);
}

export function shouldSendHeartbeat(): boolean {
    try {
        const last = localStorage.getItem(HEARTBEAT_KEY);
        if (!last) return true;
        const lastMs = new Date(last).getTime();
        if (Number.isNaN(lastMs)) return true;
        return (Date.now() - lastMs) >= HEARTBEAT_MIN_INTERVAL_MS;
    } catch {
        return true;
    }
}

export async function flushPendingEvents(): Promise<void> {
    await drain(e => send(e.path, e.body));
}
