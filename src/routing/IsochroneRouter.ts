import type { IsochronePoint, LatLon, PolarData, RoutePoint, WindGridData } from './types';
import { advancePosition, bearing, computeTWA, distance, normaliseAngle } from './geo';
import { getWindAt } from './WindGrid';
import { getSpeed } from './Polar';

export function expandFrontier(
    frontier: IsochronePoint[],
    windGrid: WindGridData,
    polar: PolarData,
    timeStepHours: number,
    parentIsoIndex: number,
): IsochronePoint[] {
    const candidates: IsochronePoint[] = [];
    const headingStep = 5;
    const numHeadings = 360 / headingStep;
    const dtMs = timeStepHours * 3600000;

    for (let fi = 0; fi < frontier.length; fi++) {
        const point = frontier[fi];
        const nextTime = point.time + dtMs;
        const wind = getWindAt(windGrid, nextTime, point.lat, point.lon);

        for (let hi = 0; hi < numHeadings; hi++) {
            const hdg = hi * headingStep;
            const twa = computeTWA(hdg, wind.direction);
            const boatSpeed = getSpeed(polar, twa, wind.speed);
            const distNm = boatSpeed * timeStepHours;

            if (distNm <= 0) {
                candidates.push({
                    lat: point.lat, lon: point.lon, parent: fi,
                    twa, tws: wind.speed, twd: wind.direction,
                    boatSpeed, heading: hdg, time: nextTime,
                });
                continue;
            }

            const newPos = advancePosition(point.lat, point.lon, hdg, distNm);
            candidates.push({
                lat: newPos.lat, lon: newPos.lon, parent: fi,
                twa, tws: wind.speed, twd: wind.direction,
                boatSpeed, heading: hdg, time: nextTime,
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

    for (const candidate of candidates) {
        const candidateBearing = bearing(start, candidate);
        const relativeAngle = normaliseAngle(candidateBearing - refBearing);
        const sectorIndex = Math.floor(relativeAngle / sectorSize) % numSectors;
        const dist = distance(start, candidate);

        if (sectors[sectorIndex] === null || dist > sectorDistances[sectorIndex]) {
            sectors[sectorIndex] = candidate;
            sectorDistances[sectorIndex] = dist;
        }
    }
    return sectors.filter((s): s is IsochronePoint => s !== null);
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
        });
        if (point.parent === null) break;
        pointIdx = point.parent;
        isoIdx--;
    }
    return path;
}

export function checkArrival(
    candidates: IsochronePoint[],
    destination: LatLon,
    arrivalRadius: number,
): number {
    for (let i = 0; i < candidates.length; i++) {
        if (distance(candidates[i], destination) <= arrivalRadius) {
            return i;
        }
    }
    return -1;
}
