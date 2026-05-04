import * as admin from 'firebase-admin';
import { createHash } from 'crypto';

const IP_HASH_SALT = process.env.IP_HASH_SALT ?? 'windysail-default-salt';

export function hashIp(ip: string): string {
    return createHash('sha256').update(IP_HASH_SALT + ip).digest('hex').slice(0, 32);
}

export function extractIp(req: any): string {
    return (req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip ?? '').trim();
}

export function db() {
    return admin.firestore();
}

export function serverTimestamp() {
    return admin.firestore.FieldValue.serverTimestamp();
}

export async function recordEvent(
    type: 'install' | 'disclaimer-ack' | 'coffee' | 'route',
    payload: Record<string, unknown>,
    ipHash: string,
): Promise<void> {
    // Events no longer carry a per-device identifier. The payload itself
    // carries `emailHash` (or null for anonymous users) — all the user
    // pointer the server ever sees.
    await db().collection('events').add({
        type,
        payload,
        receivedAt: serverTimestamp(),
        ipHash,
    });
}
