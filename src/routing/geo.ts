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

/**
 * Closest approach distance from a point to a great-circle segment.
 * Uses planar approximation (valid for segments < ~50nm).
 */
export function segmentClosestApproach(
    segStart: LatLon, segEnd: LatLon, point: LatLon,
): number {
    const segLen = distance(segStart, segEnd);
    if (segLen < 0.01) return distance(segStart, point);

    // Project onto segment in approximate planar coordinates
    const cosLat = Math.cos(toRadians((segStart.lat + segEnd.lat) / 2));
    const dx = (segEnd.lon - segStart.lon) * cosLat;
    const dy = segEnd.lat - segStart.lat;
    const px = (point.lon - segStart.lon) * cosLat;
    const py = point.lat - segStart.lat;

    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));

    const closestLat = segStart.lat + t * dy;
    const closestLon = segStart.lon + t * (dx / cosLat);

    return distance({ lat: closestLat, lon: closestLon }, point);
}
