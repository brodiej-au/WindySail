const STORAGE_KEY = 'windysail-pending-events';
export const MAX_QUEUE_SIZE = 50;

export interface QueuedEvent {
    path: '/install' | '/heartbeat' | '/disclaimer-ack' | '/route';
    body: Record<string, unknown>;
    queuedAt: number;
}

function read(): QueuedEvent[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function write(events: QueuedEvent[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch {
        // Quota or private browsing — silently drop.
    }
}

export function enqueue(event: Omit<QueuedEvent, 'queuedAt'>): void {
    const all = read();
    all.push({ ...event, queuedAt: Date.now() });
    while (all.length > MAX_QUEUE_SIZE) all.shift();
    write(all);
}

export function peekAll(): QueuedEvent[] {
    return read();
}

export async function drain(
    send: (e: QueuedEvent) => Promise<void>,
): Promise<void> {
    const all = read();
    const remaining: QueuedEvent[] = [];
    for (const event of all) {
        try {
            await send(event);
        } catch {
            remaining.push(event);
        }
    }
    write(remaining);
}
