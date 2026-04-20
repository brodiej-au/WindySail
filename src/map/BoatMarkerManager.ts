import { map } from '@windy/map';
import type { WindModelId } from '../routing/types';

export interface BoatMarkerPoint {
    lat: number;
    lon: number;
    boatSpeed: number;
    tws: number;
    twd: number;
    twa: number;
    heading: number;
}

const ICON_SIZE = 24;
const HALF = ICON_SIZE / 2;

/**
 * Build an SVG triangle pointing up, rotated to the given heading.
 * Filled with `color` inside a 24×24 viewBox.
 */
function boatSvg(color: string, heading: number, border: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4));transform:rotate(${heading}deg)">` +
        `<path d="M12 3 L20 21 L12 17 L4 21 Z" fill="${color}" stroke="${border}" stroke-width="0.8" stroke-linejoin="round"/>` +
        `</svg>`;
}

export class BoatMarkerManager {
    private markers: Map<string, L.Marker> = new Map();
    private lastHeadings: Map<string, number> = new Map();

    /**
     * Update or create a boat marker for a wind model at a given point.
     * Renders an SVG sailboat rotated to the boat's heading.
     * Tooltip shows SOG, TWS, TWD, TWA.
     */
    updateMarker(model: WindModelId, point: BoatMarkerPoint, color: string): void {
        const tooltipContent = this.buildTooltipHtml(point, color);

        const heading = Math.round(point.heading);
        const existingMarker = this.markers.get(model);

        if (existingMarker) {
            existingMarker.setLatLng([point.lat, point.lon]);

            // Only rebuild icon if heading changed (avoid DOM thrashing during playback)
            if (this.lastHeadings.get(model) !== heading) {
                existingMarker.setIcon(this.buildIcon(color, heading, 'white'));
                this.lastHeadings.set(model, heading);
            }

            const tooltip = existingMarker.getTooltip();
            if (tooltip) {
                tooltip.setContent(tooltipContent);
            }
        } else {
            const icon = this.buildIcon(color, heading, 'white');
            this.lastHeadings.set(model, heading);

            const marker = new L.Marker([point.lat, point.lon], { icon }).addTo(map);

            marker.bindTooltip(tooltipContent, {
                permanent: true,
                direction: 'top',
                offset: [0, -14],
                className: 'boat-info-tooltip',
            });

            this.markers.set(model, marker);
        }
    }

    private buildTooltipHtml(point: BoatMarkerPoint, color: string): string {
        return `
            <div class="bi-wrap" style="--bi-accent:${color}">
                <div class="bi-grid">
                    <div class="bi-cell"><span class="bi-k">SOG</span><span class="bi-v">${point.boatSpeed.toFixed(1)}<span class="bi-u">kt</span></span></div>
                    <div class="bi-cell"><span class="bi-k">TWS</span><span class="bi-v">${point.tws.toFixed(1)}<span class="bi-u">kt</span></span></div>
                    <div class="bi-cell"><span class="bi-k">TWA</span><span class="bi-v">${Math.round(point.twa)}<span class="bi-u">&deg;</span></span></div>
                    <div class="bi-cell"><span class="bi-k">TWD</span><span class="bi-v">${Math.round(point.twd)}<span class="bi-u">&deg;</span></span></div>
                </div>
            </div>
        `.trim();
    }

    /**
     * Set one model as active: full color + visible tooltip.
     * All other markers become gray with hidden tooltips.
     */
    setActiveModel(activeModel: WindModelId, modelColors: Record<string, string>): void {
        for (const [model, marker] of this.markers.entries()) {
            const isActive = model === activeModel;
            const color = isActive ? (modelColors[model] ?? '#888') : '#888';
            const border = isActive ? 'white' : 'rgba(255,255,255,0.3)';

            const heading = this.lastHeadings.get(model) ?? 0;
            marker.setIcon(this.buildIcon(color, heading, border));

            // Show/hide tooltip
            const tooltip = marker.getTooltip();
            if (tooltip) {
                const el = tooltip.getElement?.();
                if (el) {
                    el.style.opacity = isActive ? '1' : '0';
                    el.style.pointerEvents = isActive ? '' : 'none';
                }
            }
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
        this.lastHeadings.clear();
    }

    private buildIcon(color: string, heading: number, border: string): L.DivIcon {
        return L.divIcon({
            html: boatSvg(color, heading, border),
            iconSize: [ICON_SIZE, ICON_SIZE],
            iconAnchor: [HALF, HALF],
            className: '',
        });
    }
}
