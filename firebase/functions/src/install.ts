import { installSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleInstall(req: any, res: any): Promise<void> {
    const parsed = installSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    await db().collection('devices').doc(data.deviceId).set({
        email: data.email,
        firstSeenAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        lastVersion: data.pluginVersion,
        lastLang: data.usedLang,
        installUserAgent: data.userAgent,
        disclaimerVersion: null,
        disclaimerAcceptedAt: null,
    }, { merge: true });

    await recordEvent('install', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
