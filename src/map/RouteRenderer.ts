import { map } from '@windy/map';
import type { RouteResult, ModelRouteResult } from '../routing/types';
import { MODEL_COLORS } from './modelColors';

export class RouteRenderer {
    private routeLines: Map<string, L.Polyline> = new Map();

    /**
     * Draw multiple model routes on the map with different colors.
     */
    renderRoutes(results: ModelRouteResult[]): void {
        this.clear();

        const allBounds: [number, number][] = [];

        for (const result of results) {
            const latlngs: [number, number][] = result.route.path.map(p => [p.lat, p.lon]);

            if (latlngs.length === 0) {
                continue;
            }

            const polyline = new L.Polyline(latlngs, {
                color: result.color,
                weight: 3,
                opacity: 0.9,
            }).addTo(map);

            this.routeLines.set(result.model, polyline);
            allBounds.push(...latlngs);
        }

        // Fit map to show all routes
        if (allBounds.length > 1) {
            const bounds = L.latLngBounds(allBounds);
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }

    /**
     * Draw a single route on the map (backward-compatibility wrapper).
     * Wraps the route as a GFS ModelRouteResult and uses renderRoutes.
     */
    renderRoute(route: RouteResult): void {
        const gfsResult: ModelRouteResult = {
            model: 'gfs',
            route,
            color: MODEL_COLORS.gfs,
            windGrid: {
                lats: [],
                lons: [],
                timestamps: [],
                windU: [],
                windV: [],
            },
        };
        this.renderRoutes([gfsResult]);
    }

    /**
     * Remove all route layers from the map.
     */
    clear(): void {
        for (const polyline of this.routeLines.values()) {
            map.removeLayer(polyline);
        }
        this.routeLines.clear();
    }
}
