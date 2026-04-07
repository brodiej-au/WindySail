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
            enrichRoutePoints(result.path, swellGrid, currentGrid);

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

interface Bracket { lo: number; hi: number; frac: number; }

function findBracket(arr: number[], value: number): Bracket {
    if (arr.length === 1 || value <= arr[0]) return { lo: 0, hi: 0, frac: 0 };
    if (value >= arr[arr.length - 1]) return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
    for (let i = 0; i < arr.length - 1; i++) {
        if (value >= arr[i] && value <= arr[i + 1]) {
            return { lo: i, hi: i + 1, frac: (value - arr[i]) / (arr[i + 1] - arr[i]) };
        }
    }
    return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
}

function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

/**
 * Trilinear interpolation of a [latIdx][lonIdx][timeIdx] grid at the given
 * (lat, lon, time) coordinates.
 */
function trilinearInterpolate(
    grid3d: number[][][],
    lats: number[],
    lons: number[],
    timestamps: number[],
    lat: number,
    lon: number,
    time: number,
): number {
    const latB = findBracket(lats, lat);
    const lonB = findBracket(lons, lon);
    const timeB = findBracket(timestamps, time);

    const v00 = lerp(grid3d[latB.lo][lonB.lo][timeB.lo], grid3d[latB.lo][lonB.lo][timeB.hi], timeB.frac);
    const v01 = lerp(grid3d[latB.lo][lonB.hi][timeB.lo], grid3d[latB.lo][lonB.hi][timeB.hi], timeB.frac);
    const v10 = lerp(grid3d[latB.hi][lonB.lo][timeB.lo], grid3d[latB.hi][lonB.lo][timeB.hi], timeB.frac);
    const v11 = lerp(grid3d[latB.hi][lonB.hi][timeB.lo], grid3d[latB.hi][lonB.hi][timeB.hi], timeB.frac);

    const va = lerp(v00, v01, lonB.frac);
    const vb = lerp(v10, v11, lonB.frac);
    return lerp(va, vb, latB.frac);
}

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
                direction: trilinearInterpolate(swellDir, lats, lons, timestamps, lat, lon, time),
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
