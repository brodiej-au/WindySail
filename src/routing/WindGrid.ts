import type { WindGridData, WindVector } from './types';
import { findBracket, lerp } from './interpolate';
import type { Bracket } from './interpolate';

const MS_TO_KNOTS = 1.94384;

export function msToKnots(ms: number): number {
    return ms * MS_TO_KNOTS;
}

export function windComponentsToSpeedDir(u: number, v: number): WindVector {
    const speedMs = Math.sqrt(u * u + v * v);
    if (speedMs === 0) {
        return { speed: 0, direction: 0 };
    }
    const mathAngle = Math.atan2(-u, -v);
    const degrees = ((mathAngle * 180) / Math.PI + 360) % 360;
    return { speed: msToKnots(speedMs), direction: degrees };
}

export function getWindAt(grid: WindGridData, time: number, lat: number, lon: number): WindVector {
    const { lats, lons, timestamps, windU, windV } = grid;
    const latB = findBracket(lats, lat);
    const lonB = findBracket(lons, lon);
    const timeB = findBracket(timestamps, time);
    const u = trilinearInterp(windU, latB, lonB, timeB);
    const v = trilinearInterp(windV, latB, lonB, timeB);
    return windComponentsToSpeedDir(u, v);
}

function trilinearInterp(data: number[][][], latB: Bracket, lonB: Bracket, timeB: Bracket): number {
    const v00 = lerp(data[latB.lo][lonB.lo][timeB.lo], data[latB.lo][lonB.lo][timeB.hi], timeB.frac);
    const v01 = lerp(data[latB.lo][lonB.hi][timeB.lo], data[latB.lo][lonB.hi][timeB.hi], timeB.frac);
    const v10 = lerp(data[latB.hi][lonB.lo][timeB.lo], data[latB.hi][lonB.lo][timeB.hi], timeB.frac);
    const v11 = lerp(data[latB.hi][lonB.hi][timeB.lo], data[latB.hi][lonB.hi][timeB.hi], timeB.frac);
    const va = lerp(v00, v01, lonB.frac);
    const vb = lerp(v10, v11, lonB.frac);
    return lerp(va, vb, latB.frac);
}

