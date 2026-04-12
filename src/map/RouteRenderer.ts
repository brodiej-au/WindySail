import { map } from '@windy/map';
import type { LatLon, RouteResult, ModelRouteResult } from '../routing/types';
import { MODEL_COLORS, MODEL_LABELS } from './modelColors';

export class RouteRenderer {
    private routeLines: Map<string, L.Polyline> = new Map();
    private isochroneLayers: L.Polyline[] = [];
    private previewLine: L.Polyline | null = null;
    private previewLabel: L.Marker | null = null;
    private departurePreviewLines: L.Polyline[] = [];

    /**
     * Draw multiple model routes on the map with different colors.
     */
    renderRoutes(results: ModelRouteResult[]): void {
        this.clear();

        const modelNames = results.map(r => r.model).join(', ');
        console.log(`[RouteRenderer] Rendering ${results.length} route(s): ${modelNames}`);

        // Dash patterns by render order: first solid, second dashed, third dotted
        const dashPatterns: (string | undefined)[] = [undefined, '12 8', '4 4'];

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
            renderIndex++;
        }

        this.fitToRoutes(results);
    }

    /**
     * Draw multiple model routes with one selected (highlighted) and others grayed out.
     * Does NOT call fitBounds — only the initial render should fit.
     */
    renderRoutesWithSelection(results: ModelRouteResult[], selectedModel: string): void {
        this.clear();

        for (const result of results) {
            const latlngs: [number, number][] = result.route.path.map(p => [p.lat, p.lon]);
            if (latlngs.length === 0) continue;

            const isSelected = result.model === selectedModel;

            const polyline = new L.Polyline(latlngs, {
                color: isSelected ? result.color : 'rgba(255,255,255,0.2)',
                weight: isSelected ? 4 : 2,
                opacity: isSelected ? 0.9 : 1,
                interactive: isSelected,
            }).addTo(map);

            if (isSelected) {
                try {
                    polyline.bindTooltip(MODEL_LABELS[result.model], { sticky: true, direction: 'top' });
                } catch {
                    try { polyline.bindPopup(MODEL_LABELS[result.model]); } catch { /* ignore */ }
                }
                polyline.on('mouseover', () => polyline.setStyle({ weight: 6, opacity: 1 }));
                polyline.on('mouseout', () => polyline.setStyle({ weight: 4, opacity: 0.9 }));
            }

            this.routeLines.set(result.model, polyline);
        }
    }

    /**
     * Fit map bounds to show all routes.
     */
    fitToRoutes(results: ModelRouteResult[]): void {
        const allBounds: [number, number][] = [];
        for (const result of results) {
            for (const p of result.route.path) {
                allBounds.push([p.lat, p.lon]);
            }
        }
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
     * Draw a single isochrone ring on the map.
     * Points are sorted by bearing from their centroid to form a closed polygon.
     */
    renderIsochrone(points: [number, number][], color: string): void {
        if (points.length < 3) return;

        // Compute centroid
        let cLat = 0, cLon = 0;
        for (const [lat, lon] of points) {
            cLat += lat;
            cLon += lon;
        }
        cLat /= points.length;
        cLon /= points.length;

        // Sort points by bearing from centroid
        const sorted = [...points].sort((a, b) => {
            const bearA = Math.atan2(a[1] - cLon, a[0] - cLat);
            const bearB = Math.atan2(b[1] - cLon, b[0] - cLat);
            return bearA - bearB;
        });

        // Close the ring
        const ring = new L.Polyline([...sorted, sorted[0]], {
            color,
            weight: 1,
            opacity: 0.25,
            interactive: false,
        }).addTo(map);

        this.isochroneLayers.push(ring);
    }

    /**
     * Remove all isochrone layers from the map.
     */
    clearIsochrones(): void {
        for (const layer of this.isochroneLayers) {
            map.removeLayer(layer);
        }
        this.isochroneLayers = [];
    }

    /**
     * Draw a dashed preview line with a distance label at the midpoint.
     */
    renderPreview(path: LatLon[], distanceNm: number): void {
        this.clearPreview();

        if (path.length < 2) return;

        const latlngs: [number, number][] = path.map(p => [p.lat, p.lon]);

        this.previewLine = new L.Polyline(latlngs, {
            color: 'rgba(255,255,255,0.6)',
            weight: 2,
            dashArray: '8 6',
            interactive: false,
        }).addTo(map);

        // Place label at midpoint of the path
        const midIdx = Math.floor(path.length / 2);
        const midPoint = path[midIdx];
        const labelHtml = `<div style="color:rgba(255,255,255,0.85);font-size:11px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,0.7);white-space:nowrap;">&gt; ${Math.round(distanceNm)} nm</div>`;

        this.previewLabel = new L.Marker([midPoint.lat, midPoint.lon], {
            icon: L.divIcon({
                html: labelHtml,
                className: '',
                iconSize: [80, 16],
                iconAnchor: [40, 20],
            }),
            interactive: false,
        }).addTo(map);
    }

    /**
     * Remove preview line and label from the map.
     */
    clearPreview(): void {
        if (this.previewLine) {
            map.removeLayer(this.previewLine);
            this.previewLine = null;
        }
        if (this.previewLabel) {
            map.removeLayer(this.previewLabel);
            this.previewLabel = null;
        }
    }

    /**
     * Draw a lightweight preview of a hovered departure route plus its siblings.
     * Does NOT call fitBounds — avoids map jumping on hover.
     */
    renderDeparturePreview(main: ModelRouteResult, siblings: ModelRouteResult[]): void {
        this.clearDeparturePreview();

        // Draw siblings first (underneath) in light gray
        for (const sib of siblings) {
            const latlngs: [number, number][] = sib.route.path.map(p => [p.lat, p.lon]);
            if (latlngs.length === 0) continue;
            const line = new L.Polyline(latlngs, {
                color: 'rgba(255,255,255,0.15)',
                weight: 2,
                interactive: false,
            }).addTo(map);
            this.departurePreviewLines.push(line);
        }

        // Draw main route on top in its model color
        const latlngs: [number, number][] = main.route.path.map(p => [p.lat, p.lon]);
        if (latlngs.length > 0) {
            const line = new L.Polyline(latlngs, {
                color: main.color,
                weight: 4,
                opacity: 0.9,
                interactive: false,
            }).addTo(map);
            this.departurePreviewLines.push(line);
        }
    }

    /**
     * Remove departure preview layers from the map.
     */
    clearDeparturePreview(): void {
        for (const line of this.departurePreviewLines) {
            map.removeLayer(line);
        }
        this.departurePreviewLines = [];
    }

    /**
     * Remove all route layers from the map.
     */
    clear(): void {
        for (const polyline of this.routeLines.values()) {
            map.removeLayer(polyline);
        }
        this.routeLines.clear();
        this.clearIsochrones();
        this.clearPreview();
        this.clearDeparturePreview();
    }
}
