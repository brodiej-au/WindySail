import type { IsochronePoint, LatLon, PolarData, RoutePoint, WindGridData, SwellGridData, CurrentGridData } from './types';
import { advancePosition, bearing, computeTWA, distance, normaliseAngle, segmentClosestApproach } from './geo';
import { getWindAt } from './WindGrid';
import { getSpeed } from './Polar';
import { trilinearInterpolate, interpolateAngle } from './interpolate';

export function expandFrontier(
    frontier: IsochronePoint[],
    windGrid: WindGridData,
    polar: PolarData,
    timeStepHours: number,
    parentIsoIndex: number,
    motorOptions?: { enabled: boolean; threshold: number; speed: number },
    currentGrid?: CurrentGridData,
    swellGrid?: SwellGridData,
    comfortWeight?: number,
): IsochronePoint[] {
    const candidates: IsochronePoint[] = [];
    const headingStep = 5;
    const numHeadings = 360 / headingStep;
    const dtMs = timeStepHours * 3600000;
    const cw = comfortWeight ?? 0.3;

    for (let fi = 0; fi < frontier.length; fi++) {
        const point = frontier[fi];
        const nextTime = point.time + dtMs;
        const wind = getWindAt(windGrid, nextTime, point.lat, point.lon);

        // Pre-compute swell at this position (shared across headings)
        let swellHeight = 0;
        let swellDir = 0;
        if (swellGrid) {
            const { lats, lons, timestamps } = swellGrid;
            swellHeight = trilinearInterpolate(swellGrid.swellHeight, lats, lons, timestamps, point.lat, point.lon, nextTime);
            swellDir = interpolateAngle(swellGrid.swellDir, lats, lons, timestamps, point.lat, point.lon, nextTime);
        }

        // Pre-compute current at this position (shared across headings)
        let curU = 0;
        let curV = 0;
        if (currentGrid) {
            const { lats, lons, timestamps } = currentGrid;
            curU = trilinearInterpolate(currentGrid.currentU, lats, lons, timestamps, point.lat, point.lon, nextTime);
            curV = trilinearInterpolate(currentGrid.currentV, lats, lons, timestamps, point.lat, point.lon, nextTime);
        }

        for (let hi = 0; hi < numHeadings; hi++) {
            const hdg = hi * headingStep;
            const twa = computeTWA(hdg, wind.direction);
            let boatSpeed = getSpeed(polar, twa, wind.speed);
            let isMotoring = false;

            // Swell speed reduction (before motor check)
            if (swellGrid && swellHeight > 0 && !isMotoring) {
                const relSwellAngle = computeTWA(hdg, swellDir);
                const beamFactor = Math.sin(relSwellAngle * Math.PI / 180);
                const penaltyPerMeter = 0.025 + cw * 0.05;
                const penalty = Math.min(0.5, swellHeight * beamFactor * penaltyPerMeter);
                boatSpeed *= (1 - penalty);
            }

            // Motor if sail speed is below threshold
            if (motorOptions?.enabled && boatSpeed < motorOptions.threshold) {
                boatSpeed = motorOptions.speed;
                isMotoring = true;
            }

            // Apply current as vector addition
            let sog = boatSpeed;
            let effectiveHdg = hdg;

            if (currentGrid && (curU !== 0 || curV !== 0)) {
                const hdgRad = hdg * Math.PI / 180;
                const boatN = boatSpeed * Math.cos(hdgRad);
                const boatE = boatSpeed * Math.sin(hdgRad);
                // Current U = east component, V = north component, in m/s
                const sogN = boatN + curV * 1.94384;
                const sogE = boatE + curU * 1.94384;
                sog = Math.sqrt(sogN * sogN + sogE * sogE);
                effectiveHdg = (Math.atan2(sogE, sogN) * 180 / Math.PI + 360) % 360;
            }

            const distNm = sog * timeStepHours;

            if (distNm <= 0) {
                candidates.push({
                    lat: point.lat, lon: point.lon, parent: fi,
                    twa, tws: wind.speed, twd: wind.direction,
                    boatSpeed, heading: hdg, time: nextTime, isMotoring, sog,
                });
                continue;
            }

            const newPos = advancePosition(point.lat, point.lon, effectiveHdg, distNm);
            candidates.push({
                lat: newPos.lat, lon: newPos.lon, parent: fi,
                twa, tws: wind.speed, twd: wind.direction,
                boatSpeed, heading: hdg, time: nextTime, isMotoring, sog,
            });
        }
    }
    return candidates;
}

export function pruneToSectors(
    candidates: IsochronePoint[],
    start: LatLon,
    end: LatLon,
    numSectors: number,
): IsochronePoint[] {
    const sectorSize = 360 / numSectors;
    const refBearing = bearing(start, end);
    const sectors: (IsochronePoint | null)[] = new Array(numSectors).fill(null);
    const sectorDistances: number[] = new Array(numSectors).fill(0);

    // Track the single candidate closest to the destination
    let closestToEnd: IsochronePoint | null = null;
    let closestToEndDist = Infinity;

    for (const candidate of candidates) {
        const candidateBearing = bearing(start, candidate);
        const relativeAngle = normaliseAngle(candidateBearing - refBearing);
        const sectorIndex = Math.floor(relativeAngle / sectorSize) % numSectors;
        const dist = distance(start, candidate);

        if (sectors[sectorIndex] === null || dist > sectorDistances[sectorIndex]) {
            sectors[sectorIndex] = candidate;
            sectorDistances[sectorIndex] = dist;
        }

        const distToEnd = distance(candidate, end);
        if (distToEnd < closestToEndDist) {
            closestToEndDist = distToEnd;
            closestToEnd = candidate;
        }
    }

    const result = sectors.filter((s): s is IsochronePoint => s !== null);

    // Ensure the closest-to-destination candidate survives pruning.
    // If it was discarded by sector selection, add it back.
    if (closestToEnd && !result.includes(closestToEnd)) {
        result.push(closestToEnd);
    }

    return result;
}

export function traceRoute(isochrones: IsochronePoint[][], finalPointIndex: number): RoutePoint[] {
    const path: RoutePoint[] = [];
    let isoIdx = isochrones.length - 1;
    let pointIdx = finalPointIndex;

    while (isoIdx >= 0) {
        const point = isochrones[isoIdx][pointIdx];
        path.unshift({
            lat: point.lat, lon: point.lon, time: point.time,
            twa: point.twa, tws: point.tws, twd: point.twd,
            boatSpeed: point.boatSpeed, heading: point.heading,
            isMotoring: point.isMotoring,
        });
        if (point.parent === null) break;
        pointIdx = point.parent;
        isoIdx--;
    }
    return path;
}

/**
 * Check if any candidate has arrived at the destination.
 *
 * Two checks per candidate:
 * 1. Endpoint within arrivalRadius (original).
 * 2. Track segment (parent→candidate) passes within arrivalRadius,
 *    which catches the overshoot case where a fast boat jumps past
 *    the destination in a single time step.
 */
export function checkArrival(
    candidates: IsochronePoint[],
    destination: LatLon,
    arrivalRadius: number,
    previousFrontier?: IsochronePoint[],
): number {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = 0; i < candidates.length; i++) {
        const endDist = distance(candidates[i], destination);

        // Endpoint check
        if (endDist <= arrivalRadius) {
            if (endDist < bestDist) {
                bestDist = endDist;
                bestIdx = i;
            }
            continue;
        }

        // Segment check — did the track from parent to candidate cross
        // through the arrival circle?
        if (previousFrontier && candidates[i].parent !== null) {
            const parent = previousFrontier[candidates[i].parent!];
            const approach = segmentClosestApproach(parent, candidates[i], destination);
            if (approach <= arrivalRadius && approach < bestDist) {
                bestDist = approach;
                bestIdx = i;
            }
        }
    }
    return bestIdx;
}
