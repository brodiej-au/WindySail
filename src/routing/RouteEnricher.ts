import type { RoutePoint, SwellGridData, CurrentGridData } from './types';
import { trilinearInterpolate, interpolateAngle } from './interpolate';

/**
 * Post-process each RoutePoint, annotating it with interpolated swell and
 * current values at its (lat, lon, time) position.
 */
export function enrichRoutePoints(
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
