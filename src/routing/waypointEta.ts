import type { LatLon, RoutePoint } from './types';

/**
 * For each waypoint, find the time on the route polyline at which the route
 * is closest to that waypoint. Returns an array of Unix-ms timestamps.
 */
export function waypointEtas(route: RoutePoint[], waypoints: LatLon[]): number[] {
    return waypoints.map(wp => {
        let bestTime = route[0]?.time ?? 0;
        let bestDist = Infinity;
        for (const p of route) {
            const dy = p.lat - wp.lat;
            const dx = (p.lon - wp.lon) * Math.cos(wp.lat * Math.PI / 180);
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; bestTime = p.time; }
        }
        return bestTime;
    });
}
