import { disclaimerSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleDisclaimer(req: any, res: any): Promise<void> {
    const parsed = disclaimerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    await db().collection('devices').doc(data.deviceId).set({
        email: data.email ?? null,
        disclaimerVersion: data.disclaimerVersion,
        disclaimerAcceptedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        lastLang: data.usedLang,
        lastVersion: data.pluginVersion,
    }, { merge: true });

    await recordEvent('disclaimer-ack', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
