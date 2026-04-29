import store from '@windy/store';

/** Returns the user's email if they're signed into Windy, else null. */
export function getEmail(): string | null {
    try {
        const user = store.get('user') as { email?: unknown } | null | undefined;
        const raw = user?.email;
        if (typeof raw !== 'string') return null;
        const trimmed = raw.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
        return trimmed;
    } catch {
        return null;
    }
}

/**
 * SHA-256 of the lowercased email, truncated to 32 hex chars. Used as the
 * Firestore user doc ID so we can look up by email without storing it as a
 * key. Same email across devices ⇒ same hash ⇒ same cloud account.
 */
export async function emailHash(email: string): Promise<string> {
    const data = new TextEncoder().encode(email.trim().toLowerCase());
    const buf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return hex.slice(0, 32);
}
