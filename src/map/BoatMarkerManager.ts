import { map } from '@windy/map';
import type { WindModelId } from '../routing/types';

export interface BoatMarkerPoint {
    lat: number;
    lon: number;
    boatSpeed: number;
    tws: number;
    twd: number;
    twa: number;
}

export class BoatMarkerManager {
    private markers: Map<string, L.Marker> = new Map();

    /**
     * Update or create a boat marker for a wind model at a given point.
     * Marker is a 16px colored circle with 2px white border.
     * Tooltip shows SOG, TWS, TWD, TWA.
     */
    updateMarker(model: WindModelId, point: BoatMarkerPoint, color: string): void {
        const tooltipContent = `SOG: ${point.boatSpeed.toFixed(1)} kt | TWS: ${point.tws.toFixed(
            1,
        )} kt\nTWD: ${Math.round(point.twd)}° | TWA: ${Math.round(point.twa)}°`;

        const existingMarker = this.markers.get(model);

        if (existingMarker) {
            existingMarker.setLatLng([point.lat, point.lon]);
            const tooltip = existingMarker.getTooltip();
            if (tooltip) {
                tooltip.setContent(tooltipContent);
            }
        } else {
            const icon = L.divIcon({
                html: `<div style="background:${color};width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
                className: '',
            });

            const marker = new L.Marker([point.lat, point.lon], { icon }).addTo(map);

            marker.bindTooltip(tooltipContent, {
                permanent: true,
                direction: 'top',
                offset: [0, -10],
            });

            this.markers.set(model, marker);
        }
    }

    /**
     * Remove all boat markers from the map.
     */
    clear(): void {
        for (const marker of this.markers.values()) {
            map.removeLayer(marker);
        }
        this.markers.clear();
    }
}
