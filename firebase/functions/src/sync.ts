import {
    syncListSchema,
    syncRouteUpsertSchema,
    syncRouteDeleteSchema,
    syncPolarUpsertSchema,
    syncPolarDeleteSchema,
    syncLastRouteSetSchema,
    syncSettingsSetSchema,
} from './schemas';
import { db, serverTimestamp } from './_shared';

function userDoc(emailHash: string) {
    return db().collection('users').doc(emailHash);
}

async function ensureUserDoc(emailHash: string, email: string, deviceId: string): Promise<void> {
    await userDoc(emailHash).set({
        email,
        lastDeviceId: deviceId,
        lastSeenAt: serverTimestamp(),
    }, { merge: true });
}

export async function handleListRoutes(req: any, res: any): Promise<void> {
    const parsed = syncListSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    const snap = await userDoc(emailHash).collection('routes').get();
    const routes = snap.docs.map(d => d.data());
    res.status(200).json({ ok: true, routes });
}

export async function handleUpsertRoute(req: any, res: any): Promise<void> {
    const parsed = syncRouteUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId, route } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    await userDoc(emailHash).collection('routes').doc(route.id).set(route, { merge: false });
    res.status(200).json({ ok: true });
}

export async function handleDeleteRoute(req: any, res: any): Promise<void> {
    const parsed = syncRouteDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId, routeId } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    await userDoc(emailHash).collection('routes').doc(routeId).delete();
    res.status(200).json({ ok: true });
}

export async function handleListPolars(req: any, res: any): Promise<void> {
    const parsed = syncListSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    const snap = await userDoc(emailHash).collection('polars').get();
    const polars = snap.docs.map(d => {
        const raw = d.data() as any;
        // speeds are stored flat (Firestore rejects nested arrays). Reconstruct
        // the 2D table using the per-row length.
        const rows: number[][] = [];
        const flat: number[] = Array.isArray(raw.speedsFlat) ? raw.speedsFlat : [];
        const rowLen: number = typeof raw.speedsCols === 'number' ? raw.speedsCols : 0;
        if (rowLen > 0) {
            for (let i = 0; i < flat.length; i += rowLen) {
                rows.push(flat.slice(i, i + rowLen));
            }
        }
        const { speedsFlat, speedsCols, ...rest } = raw;
        return { ...rest, speeds: rows };
    });
    res.status(200).json({ ok: true, polars });
}

export async function handleUpsertPolar(req: any, res: any): Promise<void> {
    const parsed = syncPolarUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId, polar } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    const docId = polar.name.replace(/[/]/g, '-').slice(0, 60);
    // Firestore doesn't support nested arrays — flatten speeds into a 1D array
    // and store the column count alongside so we can reconstruct on read.
    const rowLen = polar.speeds[0]?.length ?? 0;
    const { speeds, ...rest } = polar;
    const toWrite = {
        ...rest,
        speedsFlat: speeds.flat(),
        speedsCols: rowLen,
    };
    await userDoc(emailHash).collection('polars').doc(docId).set(toWrite, { merge: false });
    res.status(200).json({ ok: true });
}

export async function handleGetLastRoute(req: any, res: any): Promise<void> {
    const parsed = syncListSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    const snap = await userDoc(emailHash).collection('state').doc('lastRoute').get();
    const lastRoute = snap.exists ? snap.data() : null;
    res.status(200).json({ ok: true, lastRoute });
}

export async function handleSetLastRoute(req: any, res: any): Promise<void> {
    const parsed = syncLastRouteSetSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId, lastRoute } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    await userDoc(emailHash).collection('state').doc('lastRoute').set(lastRoute, { merge: false });
    res.status(200).json({ ok: true });
}

export async function handleGetSettings(req: any, res: any): Promise<void> {
    const parsed = syncListSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    const snap = await userDoc(emailHash).collection('state').doc('settings').get();
    const settings = snap.exists ? snap.data() : null;
    res.status(200).json({ ok: true, settings });
}

export async function handleSetSettings(req: any, res: any): Promise<void> {
    const parsed = syncSettingsSetSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId, settings } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    await userDoc(emailHash).collection('state').doc('settings').set(settings, { merge: false });
    res.status(200).json({ ok: true });
}

export async function handleDeletePolar(req: any, res: any): Promise<void> {
    const parsed = syncPolarDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'invalid payload', details: parsed.error.flatten() });
        return;
    }
    const { emailHash, email, deviceId, polarName } = parsed.data;
    await ensureUserDoc(emailHash, email, deviceId);
    const docId = polarName.replace(/[/]/g, '-').slice(0, 60);
    await userDoc(emailHash).collection('polars').doc(docId).delete();
    res.status(200).json({ ok: true });
}
