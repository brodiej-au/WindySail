import type {
    IsochronePoint,
    RoutingOptions,
    PolarData,
    WindGridData,
    LatLon,
    RouteResult,
} from '../routing/types';
import type { MainToWorkerMessage, WorkerToMainMessage } from './messages';
import { expandFrontier, pruneToSectors, traceRoute, checkArrival } from '../routing/IsochroneRouter';
import { distance } from '../routing/geo';

let landCheckResolve: ((results: { pointResults: boolean[]; segmentResults: boolean[] }) => void) | null = null;

self.onmessage = (e: MessageEvent<MainToWorkerMessage>) => {
    const msg = e.data;

    if (msg.type === 'START_ROUTING') {
        runRouting(msg.payload).catch(err => {
            postMsg({ type: 'ROUTE_FAILED', payload: { reason: String(err) } });
        });
    } else if (msg.type === 'LAND_RESULTS') {
        if (landCheckResolve) {
            landCheckResolve(msg.payload);
            landCheckResolve = null;
        }
    }
};

function postMsg(msg: WorkerToMainMessage): void {
    (self as unknown as Worker).postMessage(msg);
}

async function requestLandCheck(
    points: [number, number][],
    segments: [number, number, number, number][],
): Promise<{ pointResults: boolean[]; segmentResults: boolean[] }> {
    return new Promise(resolve => {
        landCheckResolve = resolve;
        postMsg({ type: 'CHECK_LAND', payload: { points, segments } });
    });
}

async function runRouting(payload: {
    windGrid: WindGridData;
    polar: PolarData;
    start: LatLon;
    end: LatLon;
    options: RoutingOptions;
}): Promise<void> {
    const { windGrid, polar, start, end, options } = payload;
    const { timeStep, maxDuration, numSectors, arrivalRadius } = options;
    const maxSteps = Math.floor(maxDuration / timeStep);

    const startPoint: IsochronePoint = {
        lat: start.lat,
        lon: start.lon,
        parent: null,
        twa: 0,
        tws: 0,
        twd: 0,
        boatSpeed: 0,
        heading: 0,
        time: options.startTime,
    };

    const isochrones: IsochronePoint[][] = [[startPoint]];
    let frontier: IsochronePoint[] = [startPoint];

    for (let step = 0; step < maxSteps; step++) {
        // Expand frontier
        const candidates = expandFrontier(frontier, windGrid, polar, timeStep, step);

        // Filter out zero-speed candidates (becalmed at same position)
        const movingCandidates = candidates.filter(c => c.boatSpeed > 0);

        if (movingCandidates.length === 0) {
            postMsg({
                type: 'ROUTE_FAILED',
                payload: { reason: 'All candidates becalmed. No route possible.' },
            });
            return;
        }

        // Prepare land check requests
        const points: [number, number][] = movingCandidates.map(c => [c.lat, c.lon]);
        const segments: [number, number, number, number][] = movingCandidates.map(c => {
            const parent = frontier[c.parent!];
            return [parent.lat, parent.lon, c.lat, c.lon];
        });

        // Request land validation from main thread
        const landResults = await requestLandCheck(points, segments);

        // Filter to valid (sea) candidates
        const validCandidates = movingCandidates.filter(
            (_, i) => landResults.pointResults[i] && landResults.segmentResults[i],
        );

        if (validCandidates.length === 0) {
            postMsg({
                type: 'ROUTE_FAILED',
                payload: { reason: 'All routes blocked by land. Try different waypoints.' },
            });
            return;
        }

        // Check arrival before pruning
        const arrivalIdx = checkArrival(validCandidates, end, arrivalRadius);
        if (arrivalIdx >= 0) {
            // Route found! Trace back.
            const finalIsochrone = validCandidates;
            isochrones.push(finalIsochrone);

            const path = traceRoute(isochrones, arrivalIdx);
            const result = buildRouteResult(path, start);

            postMsg({ type: 'ROUTE_COMPLETE', payload: result });
            return;
        }

        // Prune to sectors
        frontier = pruneToSectors(validCandidates, start, end, numSectors);
        isochrones.push(frontier);

        // Report progress
        postMsg({
            type: 'PROGRESS',
            payload: {
                step: step + 1,
                totalSteps: maxSteps,
                percent: Math.round(((step + 1) / maxSteps) * 100),
            },
        });
    }

    // Max duration reached without arrival
    postMsg({
        type: 'ROUTE_FAILED',
        payload: {
            reason: `No route found within ${maxDuration} hours. Try a shorter passage or different departure time.`,
        },
    });
}

function buildRouteResult(path: import('../routing/types').RoutePoint[], start: LatLon): RouteResult {
    let totalDistanceNm = 0;
    let maxTws = 0;
    let totalSpeed = 0;

    for (let i = 1; i < path.length; i++) {
        totalDistanceNm += distance(path[i - 1], path[i]);
        maxTws = Math.max(maxTws, path[i].tws);
        totalSpeed += path[i].boatSpeed;
    }

    const avgSpeedKt = path.length > 1 ? totalSpeed / (path.length - 1) : 0;
    const durationMs = path[path.length - 1].time - path[0].time;
    const durationHours = durationMs / 3600000;

    return {
        path,
        eta: path[path.length - 1].time,
        totalDistanceNm,
        avgSpeedKt,
        maxTws,
        durationHours,
    };
}
