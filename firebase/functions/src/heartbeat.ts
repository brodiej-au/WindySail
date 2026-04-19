import { heartbeatSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleHeartbeat(req: any, res: any): Promise<void> {
    const parsed = heartbeatSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    await db().collection('devices').doc(data.deviceId).set({
        email: data.email ?? null,
        lastSeenAt: serverTimestamp(),
        lastVersion: data.pluginVersion,
        lastLang: data.usedLang,
    }, { merge: true });

    await recordEvent('heartbeat', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
