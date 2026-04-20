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
    await db().collection('routes').add({
        deviceId: data.deviceId,
        email: data.email,
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

    // Keep the device doc's lastLang/lastVersion fresh.
    await db().collection('devices').doc(data.deviceId).set({
        email: data.email ?? null,
        lastSeenAt: serverTimestamp(),
        lastVersion: data.pluginVersion,
        lastLang: data.usedLang,
    }, { merge: true });

    await recordEvent('route', data.deviceId, data, ipHash);
    res.status(200).json({ ok: true });
}
