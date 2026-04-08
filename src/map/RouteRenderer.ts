import { map } from '@windy/map';
import type { RouteResult, ModelRouteResult } from '../routing/types';
import { MODEL_COLORS, MODEL_LABELS } from './modelColors';

export class RouteRenderer {
    private routeLines: Map<string, L.Polyline> = new Map();

    /**
     * Draw multiple model routes on the map with different colors.
     */
    renderRoutes(results: ModelRouteResult[]): void {
        this.clear();

        const modelNames = results.map(r => r.model).join(', ');
        console.log(`[RouteRenderer] Rendering ${results.length} route(s): ${modelNames}`);

        // Dash patterns by render order: first solid, second dashed, third dotted
        const dashPatterns: (string | undefined)[] = [undefined, '12 8', '4 4'];

        const allBounds: [number, number][] = [];
        let renderIndex = 0;

        for (const result of results) {
            const latlngs: [number, number][] = result.route.path.map(p => [p.lat, p.lon]);

            console.log(`[RouteRenderer] Route "${result.model}": ${latlngs.length} points, color=${result.color}, renderIndex=${renderIndex}`);

            if (latlngs.length === 0) {
                console.warn(`[RouteRenderer] Skipping "${result.model}" — 0 points`);
                continue;
            }

            const dashArray = dashPatterns[renderIndex] ?? '4 4';
            const weight = renderIndex === 0 ? 4 : 5;

            const polyline = new L.Polyline(latlngs, {
                color: result.color,
                weight,
                opacity: 0.9,
                ...(renderIndex > 0 ? { dashArray } : {}),
            }).addTo(map);

            // Windy's Leaflet build may not support tooltips on polylines
            try {
                polyline.bindTooltip(MODEL_LABELS[result.model], { sticky: true, direction: 'top' });
            } catch {
                // Fallback: use popup on click instead
                try {
                    polyline.bindPopup(MODEL_LABELS[result.model]);
                } catch { /* ignore if popups also unsupported */ }
            }
            polyline.on('mouseover', () => polyline.setStyle({ weight: 6, opacity: 1 }));
            polyline.on('mouseout', () => polyline.setStyle({ weight, opacity: 0.9 }));

            this.routeLines.set(result.model, polyline);
            allBounds.push(...latlngs);
            renderIndex++;
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
