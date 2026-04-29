const STORAGE_KEY = 'windysail-device-id';
let memoryFallback: string | null = null;

function uuidv4(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback for environments without crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export function getOrCreateDeviceId(): string {
    try {
        const existing = localStorage.getItem(STORAGE_KEY);
        if (existing) return existing;
        const fresh = uuidv4();
        localStorage.setItem(STORAGE_KEY, fresh);
        return fresh;
    } catch {
        if (memoryFallback) return memoryFallback;
        memoryFallback = uuidv4();
        return memoryFallback;
    }
}

export function hasPersistedDeviceId(): boolean {
    try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
}
