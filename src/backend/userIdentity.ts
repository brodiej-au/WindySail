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
 * SHA-256 of the lowercased email, truncated to 32 hex chars.
 *
 * Used as the Firestore user doc ID so we can look up a user across
 * devices without ever transmitting or storing the raw email. Same email
 * across devices ⇒ same hash ⇒ same cloud account. Cryptographically
 * one-way: the server cannot recover the email from the hash.
 *
 * NOTE: this is currently unsalted, which means a leak of the hashes
 * could in principle be reversed via a precomputed SHA-256 rainbow table
 * for common email addresses. Adding a constant client salt would mitigate
 * this but would orphan every existing Firestore user doc (which is keyed
 * on this hash). A future migration could rekey docs by accepting both
 * old and new hashes for one release window.
 */
export async function emailHash(email: string): Promise<string> {
    const data = new TextEncoder().encode(email.trim().toLowerCase());
    const buf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return hex.slice(0, 32);
}
