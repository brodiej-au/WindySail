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

    // For signed-in users (emailHash present), maintain a lightweight user
    // doc so we can correlate disclaimer acceptance / version across the
    // events log. Anonymous users (emailHash === null) generate just an
    // event row with no user pointer at all.
    if (data.emailHash) {
        await db().collection('users').doc(data.emailHash).set({
            firstSeenAt: serverTimestamp(),
            lastSeenAt: serverTimestamp(),
            lastVersion: data.pluginVersion,
            lastLang: data.usedLang,
            installUserAgent: data.userAgent,
        }, { merge: true });
    }

    await recordEvent('install', data, ipHash);
    res.status(200).json({ ok: true });
}
