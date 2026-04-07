import type { RoutePoint } from './types';
import { normaliseAngle } from './geo';

export interface InterpolatedPoint {
    lat: number;
    lon: number;
    time: number;
    twa: number;
    tws: number;
    twd: number;
    boatSpeed: number;
    heading: number;
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number): number {
    const na = normaliseAngle(a);
    const nb = normaliseAngle(b);
    let delta = nb - na;
    if (delta > 180) {
        delta -= 360;
    } else if (delta < -180) {
        delta += 360;
    }
    return normaliseAngle(na + delta * t);
}

export function interpolateAtTime(path: RoutePoint[], time: number): InterpolatedPoint | null {
    if (path.length === 0) {
        return null;
    }

    const first = path[0];
    if (time <= first.time) {
        return { ...first, time: first.time };
    }

    const last = path[path.length - 1];
    if (time >= last.time) {
        return { ...last, time: last.time };
    }

    let lo = 0;
    let hi = path.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >>> 1;
        if (path[mid].time <= time) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const p1 = path[lo];
    const p2 = path[hi];
    const t = (time - p1.time) / (p2.time - p1.time);

    return {
        lat: lerp(p1.lat, p2.lat, t),
        lon: lerp(p1.lon, p2.lon, t),
        time,
        twa: lerp(p1.twa, p2.twa, t),
        tws: lerp(p1.tws, p2.tws, t),
        twd: lerpAngle(p1.twd, p2.twd, t),
        boatSpeed: lerp(p1.boatSpeed, p2.boatSpeed, t),
        heading: lerpAngle(p1.heading, p2.heading, t),
    };
}
