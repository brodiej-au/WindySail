import type {
    IsochronePoint,
    RoutingOptions,
    PolarData,
    WindGridData,
    SwellGridData,
    CurrentGridData,
    RoutePoint,
    LatLon,
    RouteResult,
} from '../routing/types';
import type { MainToWorkerMessage, WorkerToMainMessage } from './messages';
import { expandFrontier, pruneToSectors, traceRoute, checkArrival } from '../routing/IsochroneRouter';
import { distance } from '../routing/geo';
import { trilinearInterpolate, interpolateAngle } from '../routing/interpolate';

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
    swellGrid?: SwellGridData;
    currentGrid?: CurrentGridData;
}): Promise<void> {
    const { windGrid, polar, start, end, options, swellGrid, currentGrid } = payload;
    const { timeStep, maxDuration, numSectors, arrivalRadius } = options;
    const maxSteps = Math.floor(maxDuration / timeStep);

    const motorOptions = options.motorEnabled
        ? { enabled: true, threshold: options.motorThreshold ?? 2, speed: options.motorSpeed ?? 4 }
        : undefined;

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

    // --- Wind grid diagnostics ---
    let nonZero = 0;
    let total = 0;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const latArr of windGrid.windU) {
        for (const lonArr of latArr) {
            for (const val of lonArr) {
                total++;
                if (val !== 0) nonZero++;
                if (val < minU) minU = val;
                if (val > maxU) maxU = val;
            }
        }
    }
    for (const latArr of windGrid.windV) {
        for (const lonArr of latArr) {
            for (const val of lonArr) {
                if (val < minV) minV = val;
                if (val > maxV) maxV = val;
            }
        }
    }

    const totalDist = distance(start, end);
    console.log('[Worker] Starting routing', {
        start, end,
        totalDistNm: totalDist.toFixed(1),
        maxSteps,
        timeStep,
        maxDuration,
        arrivalRadius,
        motorEnabled: motorOptions?.enabled ?? false,
        motorSpeed: motorOptions?.speed ?? 'n/a',
        gridLats: windGrid.lats.length,
        gridLons: windGrid.lons.length,
        gridTimestamps: windGrid.timestamps.length,
        windNonZero: `${nonZero}/${total}`,
        windU: `[${minU.toFixed(2)}, ${maxU.toFixed(2)}]`,
        windV: `[${minV.toFixed(2)}, ${maxV.toFixed(2)}]`,
    });

    const isochrones: IsochronePoint[][] = [[startPoint]];
    let frontier: IsochronePoint[] = [startPoint];

    for (let step = 0; step < maxSteps; step++) {
        // Expand frontier (with ocean data for current/swell-aware routing)
        const candidates = expandFrontier(
            frontier, windGrid, polar, timeStep, step, motorOptions,
            currentGrid, swellGrid, options.comfortWeight,
        );

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

        // Check arrival before pruning — pass previous frontier for segment-based
        // overshoot detection (boat jumping past destination in one step).
        const arrivalIdx = checkArrival(validCandidates, end, arrivalRadius, frontier);
        if (arrivalIdx >= 0) {
            // Route found! Trace back.
            const arrivalDist = distance(validCandidates[arrivalIdx], end);
            console.log(`[Worker] Arrival at step ${step + 1}: dist=${arrivalDist.toFixed(2)}nm`);

            const finalIsochrone = validCandidates;
            isochrones.push(finalIsochrone);

            const path = traceRoute(isochrones, arrivalIdx);
            const result = buildRouteResult(path, start);
            enrichRoutePoints(result.path, swellGrid, currentGrid);

            postMsg({ type: 'ROUTE_COMPLETE', payload: result });
            return;
        }

        // Log pre-prune closest when frontier is near destination
        const prePruneClosest = Math.min(...validCandidates.map(p => distance(p, end)));

        // Prune to sectors
        frontier = pruneToSectors(validCandidates, start, end, numSectors);
        isochrones.push(frontier);

        // Log progress every 10 steps, or every step when within 10nm
        const postPruneClosest = Math.min(...frontier.map(p => distance(p, end)));
        if (step % 10 === 0 || step === maxSteps - 1 || prePruneClosest < 10) {
            const avgSpeed = (frontier.reduce((s, p) => s + p.boatSpeed, 0) / frontier.length).toFixed(1);
            const motorCount = frontier.filter(p => p.isMotoring).length;
            const extra = motorCount > 0 ? `, motoring=${motorCount}/${frontier.length}` : '';
            console.log(`[Worker] Step ${step + 1}/${maxSteps}: frontier=${frontier.length}, closest=${postPruneClosest.toFixed(1)}nm, avgSpeed=${avgSpeed}kt${extra}`);
        }

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

function buildRouteResult(path: RoutePoint[], start: LatLon): RouteResult {
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

// --- Ocean data enrichment ---

/**
 * Post-process each RoutePoint, annotating it with interpolated swell and
 * current values at its (lat, lon, time) position.  Grids that are absent
 * are silently skipped so callers need not guard against undefined.
 */
function enrichRoutePoints(
    path: RoutePoint[],
    swellGrid: SwellGridData | undefined,
    currentGrid: CurrentGridData | undefined,
): void {
    for (const point of path) {
        const { lat, lon, time } = point;

        if (swellGrid) {
            const { lats, lons, timestamps, swellHeight, swellDir, swellPeriod } = swellGrid;
            point.swell = {
                height: trilinearInterpolate(swellHeight, lats, lons, timestamps, lat, lon, time),
                direction: interpolateAngle(swellDir, lats, lons, timestamps, lat, lon, time),
                period: trilinearInterpolate(swellPeriod, lats, lons, timestamps, lat, lon, time),
            };
        }

        if (currentGrid) {
            const { lats, lons, timestamps, currentU, currentV } = currentGrid;
            const u = trilinearInterpolate(currentU, lats, lons, timestamps, lat, lon, time);
            const v = trilinearInterpolate(currentV, lats, lons, timestamps, lat, lon, time);
            const speed = Math.sqrt(u * u + v * v) * 1.94384; // m/s -> knots
            const direction = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
            point.current = { speed, direction };
        }
    }
}
