import { onRequest } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { handleInstall } from './install';
import { handleDisclaimer } from './disclaimer';
import { handleRoute } from './route';
import {
    handleListRoutes,
    handleUpsertRoute,
    handleDeleteRoute,
    handleListPolars,
    handleUpsertPolar,
    handleDeletePolar,
    handleGetLastRoute,
    handleSetLastRoute,
    handleGetSettings,
    handleSetSettings,
} from './sync';

admin.initializeApp();
setGlobalOptions({ region: 'australia-southeast1' });

const ALLOWED_ORIGINS = new Set([
    'https://www.windy.com',
    'https://embed.windy.com',
]);

function setCors(req: any, res: any): boolean {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.has(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
    }
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return true;
    }
    return false;
}

export const api = onRequest(
    { cors: false, maxInstances: 10 },
    async (req, res) => {
        if (setCors(req, res)) return;
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'method not allowed' });
            return;
        }
        try {
            switch (req.path) {
                case '/install':
                    await handleInstall(req, res);
                    return;
                case '/disclaimer-ack':
                    await handleDisclaimer(req, res);
                    return;
                case '/route':
                    await handleRoute(req, res);
                    return;
                case '/sync/routes/list':
                    await handleListRoutes(req, res);
                    return;
                case '/sync/routes/upsert':
                    await handleUpsertRoute(req, res);
                    return;
                case '/sync/routes/delete':
                    await handleDeleteRoute(req, res);
                    return;
                case '/sync/polars/list':
                    await handleListPolars(req, res);
                    return;
                case '/sync/polars/upsert':
                    await handleUpsertPolar(req, res);
                    return;
                case '/sync/polars/delete':
                    await handleDeletePolar(req, res);
                    return;
                case '/sync/last-route/get':
                    await handleGetLastRoute(req, res);
                    return;
                case '/sync/last-route/set':
                    await handleSetLastRoute(req, res);
                    return;
                case '/sync/settings/get':
                    await handleGetSettings(req, res);
                    return;
                case '/sync/settings/set':
                    await handleSetSettings(req, res);
                    return;
                default:
                    res.status(404).json({ error: 'not found' });
            }
        } catch (err) {
            console.error('handler error', err);
            res.status(500).json({ error: 'internal' });
        }
    },
);
