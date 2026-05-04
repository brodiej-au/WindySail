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

    // For signed-in users, persist disclaimer acceptance against their
    // emailHash so a future device sees the same account is already
    // accepted. Anonymous users rely on the client localStorage flag plus
    // the events log for compliance audit.
    if (data.emailHash) {
        await db().collection('users').doc(data.emailHash).set({
            disclaimerVersion: data.disclaimerVersion,
            disclaimerAcceptedAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            lastLang: data.usedLang,
            lastVersion: data.pluginVersion,
        }, { merge: true });
    }

    await recordEvent('disclaimer-ack', data, ipHash);
    res.status(200).json({ ok: true });
}
