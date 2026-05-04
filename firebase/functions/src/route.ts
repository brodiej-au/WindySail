import { routeSchema } from './schemas';
import { db, extractIp, hashIp, recordEvent, serverTimestamp } from './_shared';

export async function handleRoute(req: any, res: any): Promise<void> {
    const parsed = routeSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const data = parsed.data;
    const ipHash = hashIp(extractIp(req));

    // Append a dedicated document to `routes/` for easy querying / reporting.
    // Identifies the user only by emailHash (one-way, irreversible) — null
    // for anonymous routes.
    await db().collection('routes').add({
        emailHash: data.emailHash,
        pluginVersion: data.pluginVersion,
        usedLang: data.usedLang,
        mode: data.mode,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        receivedAt: serverTimestamp(),
        departureTime: data.departureTime,
        polarName: data.polarName,
        motorboatMode: data.motorboatMode,
        selectedModels: data.selectedModels,
        start: data.start,
        end: data.end,
        waypointCount: data.waypointCount,
        waypoints: data.waypoints,
        results: data.results,
        failedReason: data.failedReason,
        ipHash,
    });

    // Touch the user doc for signed-in users so the lastSeenAt / version
    // fields stay fresh. Anonymous users don't get a user doc at all.
    if (data.emailHash) {
        await db().collection('users').doc(data.emailHash).set({
            lastSeenAt: serverTimestamp(),
            lastVersion: data.pluginVersion,
            lastLang: data.usedLang,
        }, { merge: true });
    }

    await recordEvent('route', data, ipHash);
    res.status(200).json({ ok: true });
}
