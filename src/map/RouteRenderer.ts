import { map } from '@windy/map';
import type { RouteResult } from '../routing/types';

const GFS_BLUE = '#457B9D';

export class RouteRenderer {
    private routeLine: L.Polyline | null = null;

    /**
     * Draw the computed route on the map.
     */
    renderRoute(route: RouteResult): void {
        this.clear();

        const latlngs: [number, number][] = route.path.map(p => [p.lat, p.lon]);

        this.routeLine = new L.Polyline(latlngs, {
            color: GFS_BLUE,
            weight: 3,
            opacity: 0.9,
        }).addTo(map);

        // Fit map to show the full route
        if (latlngs.length > 1) {
            const bounds = L.latLngBounds(latlngs);
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }

    /**
     * Remove all route layers from the map.
     */
    clear(): void {
        if (this.routeLine) {
            map.removeLayer(this.routeLine);
            this.routeLine = null;
        }
    }
}
