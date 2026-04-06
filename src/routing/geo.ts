import type { LatLon } from './types';

const EARTH_RADIUS_NM = 3440.065;

export function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
}

export function normaliseAngle(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

export function distance(from: LatLon, to: LatLon): number {
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const dLat = toRadians(to.lat - from.lat);
    const dLon = toRadians(to.lon - from.lon);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_NM * c;
}

export function bearing(from: LatLon, to: LatLon): number {
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const dLon = toRadians(to.lon - from.lon);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return normaliseAngle(toDegrees(Math.atan2(y, x)));
}

export function advancePosition(lat: number, lon: number, headingDeg: number, distanceNm: number): LatLon {
    const lat1 = toRadians(lat);
    const lon1 = toRadians(lon);
    const brng = toRadians(headingDeg);
    const d = distanceNm / EARTH_RADIUS_NM;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: toDegrees(lat2), lon: toDegrees(lon2) };
}

export function computeTWA(boatHeading: number, windDirection: number): number {
    const diff = Math.abs(normaliseAngle(boatHeading) - normaliseAngle(windDirection));
    return diff > 180 ? 360 - diff : diff;
}
