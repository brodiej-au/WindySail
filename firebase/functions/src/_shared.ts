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
    type: 'install' | 'heartbeat' | 'disclaimer-ack' | 'coffee',
    deviceId: string,
    payload: Record<string, unknown>,
    ipHash: string,
): Promise<void> {
    await db().collection('events').add({
        deviceId,
        type,
        payload,
        receivedAt: serverTimestamp(),
        ipHash,
    });
}
