import { map } from '@windy/map';
import { singleclick } from '@windy/singleclick';
import { checkPoints } from '../adapters/LandChecker';

import type { LatLon } from '../routing/types';

export type WaypointState = 'IDLE' | 'WAITING_START' | 'WAITING_END' | 'READY';
export type StateChangeCallback = (
    state: WaypointState,
    start: LatLon | null,
    end: LatLon | null,
) => void;

export class WaypointManager {
    private state: WaypointState = 'IDLE';
    private startMarker: L.Marker | null = null;
    private endMarker: L.Marker | null = null;
    private startPos: LatLon | null = null;
    private endPos: LatLon | null = null;
    private pluginName: string;
    private onChange: StateChangeCallback;
    private onWarning?: (msg: string) => void;

    private static startIcon = L.divIcon({
        html: '<div style="background:#2ecc71;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">S</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
    });

    private static endIcon = L.divIcon({
        html: '<div style="background:#e74c3c;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">E</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
    });

    constructor(pluginName: string, onChange: StateChangeCallback, onWarning?: (msg: string) => void) {
        this.pluginName = pluginName;
        this.onChange = onChange;
        this.onWarning = onWarning;
    }

    /**
     * Start listening for map clicks. Sets state to WAITING_START.
     */
    activate(): void {
        this.state = 'WAITING_START';
        singleclick.on(this.pluginName, this.handleClick);
        this.notifyChange();
    }

    private handleClick = async (latLon: LatLon) => {
        // Validate point is on water before placing
        const [isSea] = await checkPoints([[latLon.lat, latLon.lon]]);
        if (!isSea) {
            this.onWarning?.('Please click on water');
            return;
        }

        if (this.state === 'WAITING_START') {
            this.setStart(latLon);
        } else if (this.state === 'WAITING_END') {
            this.setEnd(latLon);
        }
    };

    private setStart(latLon: LatLon): void {
        this.startPos = latLon;

        if (this.startMarker) {
            this.startMarker.setLatLng([latLon.lat, latLon.lon]);
        } else {
            this.startMarker = new L.Marker([latLon.lat, latLon.lon], {
                icon: WaypointManager.startIcon,
                draggable: true,
            }).addTo(map);

            this.startMarker.on('dragend', async () => {
                const pos = this.startMarker!.getLatLng();
                const [isSea] = await checkPoints([[pos.lat, pos.lng]]);
                if (!isSea) {
                    // Revert to previous position
                    this.startMarker!.setLatLng([this.startPos!.lat, this.startPos!.lon]);
                    this.onWarning?.('Please place marker on water');
                    return;
                }
                this.startPos = { lat: pos.lat, lon: pos.lng };
                this.notifyChange();
            });
        }

        this.state = 'WAITING_END';
        this.notifyChange();
    }

    private setEnd(latLon: LatLon): void {
        this.endPos = latLon;

        if (this.endMarker) {
            this.endMarker.setLatLng([latLon.lat, latLon.lon]);
        } else {
            this.endMarker = new L.Marker([latLon.lat, latLon.lon], {
                icon: WaypointManager.endIcon,
                draggable: true,
            }).addTo(map);

            this.endMarker.on('dragend', async () => {
                const pos = this.endMarker!.getLatLng();
                const [isSea] = await checkPoints([[pos.lat, pos.lng]]);
                if (!isSea) {
                    // Revert to previous position
                    this.endMarker!.setLatLng([this.endPos!.lat, this.endPos!.lon]);
                    this.onWarning?.('Please place marker on water');
                    return;
                }
                this.endPos = { lat: pos.lat, lon: pos.lng };
                this.notifyChange();
            });
        }

        this.state = 'READY';
        this.notifyChange();
    }

    getStart(): LatLon | null {
        return this.startPos;
    }

    getEnd(): LatLon | null {
        return this.endPos;
    }

    getState(): WaypointState {
        return this.state;
    }

    /**
     * Reset to WAITING_START, remove markers.
     */
    reset(): void {
        this.removeMarkers();
        this.startPos = null;
        this.endPos = null;
        this.state = 'WAITING_START';
        this.notifyChange();
    }

    /**
     * Fully destroy: remove markers and stop listening.
     */
    destroy(): void {
        this.removeMarkers();
        singleclick.off(this.pluginName, this.handleClick);
        this.state = 'IDLE';
    }

    private removeMarkers(): void {
        if (this.startMarker) {
            map.removeLayer(this.startMarker);
            this.startMarker = null;
        }
        if (this.endMarker) {
            map.removeLayer(this.endMarker);
            this.endMarker = null;
        }
    }

    private notifyChange(): void {
        this.onChange(this.state, this.startPos, this.endPos);
    }
}
