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
 * Constant client-side salt prefixed to the email before hashing. Forces
 * an attacker who leaked the hashes to do their own rainbow-table work
 * specific to this salt, rather than reusing a precomputed SHA-256
 * dictionary keyed on plain emails. Also binds the hashes to this plugin,
 * so a hash leak from another product using plain SHA-256(email) can't be
 * cross-checked against ours.
 *
 * The salt lives in client code, so it isn't a "secret" cryptographically
 * — but a determined attacker has to recompute their table specifically
 * targeting our hashes, which is meaningfully harder than reusing a
 * generic table.
 *
 * If this value is ever changed, every existing Firestore user doc keyed
 * on the resulting hash becomes inaccessible (the new hash points at a
 * different doc). Treat it as immutable once shipped.
 */
const EMAIL_HASH_SALT = 'windysail:v2:';

/**
 * SHA-256 of (salt + lowercased email), truncated to 32 hex chars.
 *
 * Used as the Firestore user doc ID so we can look up a user across
 * devices without ever transmitting or storing the raw email. Same email
 * across devices ⇒ same hash ⇒ same cloud account. Cryptographically
 * one-way: the server cannot recover the email from the hash.
 */
export async function emailHash(email: string): Promise<string> {
    const data = new TextEncoder().encode(EMAIL_HASH_SALT + email.trim().toLowerCase());
    const buf = await crypto.subtle.digest('SHA-256', data);
    const hex = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    return hex.slice(0, 32);
}
