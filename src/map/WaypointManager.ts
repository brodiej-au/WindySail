import { map } from '@windy/map';
import { singleclick } from '@windy/singleclick';
import { checkPoints } from '../adapters/LandChecker';

import type { LatLon } from '../routing/types';

export type WaypointState = 'IDLE' | 'WAITING_START' | 'WAITING_END' | 'READY' | 'ADDING_WAYPOINTS';
export type StateChangeCallback = (
    state: WaypointState,
    start: LatLon | null,
    end: LatLon | null,
    waypoints: LatLon[],
) => void;

export class WaypointManager {
    private state: WaypointState = 'IDLE';
    private startMarker: L.Marker | null = null;
    private endMarker: L.Marker | null = null;
    private startPos: LatLon | null = null;
    private endPos: LatLon | null = null;
    private waypoints: LatLon[] = [];
    private waypointMarkers: L.Marker[] = [];
    private pluginName: string;
    private onChange: StateChangeCallback;
    private onWarning?: (msg: string) => void;
    private onDrag?: StateChangeCallback;

    private static startIcon = L.divIcon({
        html: '<div style="background:#2ecc71;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">S</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: '',
    });

    private static endIcon = L.divIcon({
        html: '<div style="background:#e74c3c;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">E</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        className: '',
    });

    static waypointIcon(index: number): L.DivIcon {
        return L.divIcon({
            html: `<div style="background:#3498db;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">${index + 1}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            className: '',
        });
    }

    constructor(pluginName: string, onChange: StateChangeCallback, onWarning?: (msg: string) => void, onDrag?: StateChangeCallback) {
        this.pluginName = pluginName;
        this.onChange = onChange;
        this.onWarning = onWarning;
        this.onDrag = onDrag;
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
        return this.placePoint(latLon);
    };

    /**
     * Programmatically place a point as if the user clicked the map.
     * Validates the point is on water and places it according to the current state.
     * Returns true if accepted, false if rejected (on land or wrong state).
     */
    async placePoint(latLon: LatLon, skipLandCheck = false): Promise<boolean> {
        if (!skipLandCheck) {
            const [isSea] = await checkPoints([[latLon.lat, latLon.lon]]);
            if (!isSea) {
                this.onWarning?.('Position is on land — try a nearby coastal point');
                return false;
            }
        }

        if (this.state === 'WAITING_START') {
            this.setStart(latLon);
            return true;
        } else if (this.state === 'WAITING_END') {
            this.setEnd(latLon);
            return true;
        } else if (this.state === 'ADDING_WAYPOINTS') {
            this.addWaypoint(latLon);
            return true;
        }
        return false;
    }

    private setStart(latLon: LatLon): void {
        this.startPos = latLon;

        if (this.startMarker) {
            this.startMarker.setLatLng([latLon.lat, latLon.lon]);
        } else {
            this.startMarker = new L.Marker([latLon.lat, latLon.lon], {
                icon: WaypointManager.startIcon,
                draggable: true,
            }).addTo(map);

            this.startMarker.on('drag', () => this.notifyDrag());
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

            this.endMarker.on('drag', () => this.notifyDrag());
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

    addWaypoint(latLon: LatLon): void {
        const index = this.waypoints.length;
        this.waypoints.push(latLon);

        const marker = new L.Marker([latLon.lat, latLon.lon], {
            icon: WaypointManager.waypointIcon(index),
            draggable: true,
        }).addTo(map);

        marker.on('drag', () => this.notifyDrag());
        marker.on('dragend', async () => {
            const pos = marker.getLatLng();
            const [isSea] = await checkPoints([[pos.lat, pos.lng]]);
            // Find the current index of this marker (may have changed if others were removed)
            const currentIdx = this.waypointMarkers.indexOf(marker);
            if (currentIdx === -1) return;

            if (!isSea) {
                // Revert to previous position
                marker.setLatLng([this.waypoints[currentIdx].lat, this.waypoints[currentIdx].lon]);
                this.onWarning?.('Please place marker on water');
                return;
            }
            this.waypoints[currentIdx] = { lat: pos.lat, lon: pos.lng };
            this.notifyChange();
        });

        this.waypointMarkers.push(marker);
        this.notifyChange();
    }

    removeWaypoint(index: number): void {
        if (index < 0 || index >= this.waypoints.length) return;

        // Remove from arrays
        this.waypoints.splice(index, 1);
        const [removedMarker] = this.waypointMarkers.splice(index, 1);
        map.removeLayer(removedMarker);

        // Renumber remaining markers
        for (let i = 0; i < this.waypointMarkers.length; i++) {
            this.waypointMarkers[i].setIcon(WaypointManager.waypointIcon(i));
        }

        this.notifyChange();
    }

    startAddingWaypoints(): void {
        this.state = 'ADDING_WAYPOINTS';
        this.notifyChange();
    }

    stopAddingWaypoints(): void {
        this.state = 'READY';
        this.notifyChange();
    }

    getWaypoints(): LatLon[] {
        return [...this.waypoints];
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
     * Update the start position and move its marker. Validates against land.
     * Returns true if accepted, false if rejected (on land).
     */
    async updateStart(latLon: LatLon): Promise<boolean> {
        const [isSea] = await checkPoints([[latLon.lat, latLon.lon]]);
        if (!isSea) {
            this.onWarning?.('Position is on land');
            return false;
        }
        this.startPos = latLon;
        if (this.startMarker) {
            this.startMarker.setLatLng([latLon.lat, latLon.lon]);
        }
        this.notifyChange();
        return true;
    }

    /**
     * Update the end position and move its marker. Validates against land.
     * Returns true if accepted, false if rejected (on land).
     */
    async updateEnd(latLon: LatLon): Promise<boolean> {
        const [isSea] = await checkPoints([[latLon.lat, latLon.lon]]);
        if (!isSea) {
            this.onWarning?.('Position is on land');
            return false;
        }
        this.endPos = latLon;
        if (this.endMarker) {
            this.endMarker.setLatLng([latLon.lat, latLon.lon]);
        }
        this.notifyChange();
        return true;
    }

    /**
     * Update a waypoint position and move its marker. Validates against land.
     * Returns true if accepted, false if rejected (on land).
     */
    async updateWaypoint(index: number, latLon: LatLon): Promise<boolean> {
        if (index < 0 || index >= this.waypoints.length) return false;
        const [isSea] = await checkPoints([[latLon.lat, latLon.lon]]);
        if (!isSea) {
            this.onWarning?.('Position is on land');
            return false;
        }
        this.waypoints[index] = latLon;
        if (this.waypointMarkers[index]) {
            this.waypointMarkers[index].setLatLng([latLon.lat, latLon.lon]);
        }
        this.notifyChange();
        return true;
    }

    /**
     * Load a saved route onto the map: creates markers for start, end, and all
     * intermediate waypoints, then transitions to READY state.
     */
    loadRoute(start: LatLon, end: LatLon, waypoints: LatLon[]): void {
        // Clear any existing markers first
        this.removeMarkers();
        this.waypoints = [];

        // Set start
        this.startPos = start;
        this.startMarker = new L.Marker([start.lat, start.lon], {
            icon: WaypointManager.startIcon,
            draggable: true,
        }).addTo(map);
        this.startMarker.on('drag', () => this.notifyDrag());
        this.startMarker.on('dragend', async () => {
            const pos = this.startMarker!.getLatLng();
            const [isSea] = await checkPoints([[pos.lat, pos.lng]]);
            if (!isSea) {
                this.startMarker!.setLatLng([this.startPos!.lat, this.startPos!.lon]);
                this.onWarning?.('Please place marker on water');
                return;
            }
            this.startPos = { lat: pos.lat, lon: pos.lng };
            this.notifyChange();
        });

        // Set end
        this.endPos = end;
        this.endMarker = new L.Marker([end.lat, end.lon], {
            icon: WaypointManager.endIcon,
            draggable: true,
        }).addTo(map);
        this.endMarker.on('drag', () => this.notifyDrag());
        this.endMarker.on('dragend', async () => {
            const pos = this.endMarker!.getLatLng();
            const [isSea] = await checkPoints([[pos.lat, pos.lng]]);
            if (!isSea) {
                this.endMarker!.setLatLng([this.endPos!.lat, this.endPos!.lon]);
                this.onWarning?.('Please place marker on water');
                return;
            }
            this.endPos = { lat: pos.lat, lon: pos.lng };
            this.notifyChange();
        });

        // Set intermediate waypoints
        for (let i = 0; i < waypoints.length; i++) {
            const wp = waypoints[i];
            this.waypoints.push(wp);
            const marker = new L.Marker([wp.lat, wp.lon], {
                icon: WaypointManager.waypointIcon(i),
                draggable: true,
            }).addTo(map);
            marker.on('drag', () => this.notifyDrag());
            marker.on('dragend', async () => {
                const pos = marker.getLatLng();
                const [isSea] = await checkPoints([[pos.lat, pos.lng]]);
                const currentIdx = this.waypointMarkers.indexOf(marker);
                if (currentIdx === -1) return;
                if (!isSea) {
                    marker.setLatLng([this.waypoints[currentIdx].lat, this.waypoints[currentIdx].lon]);
                    this.onWarning?.('Please place marker on water');
                    return;
                }
                this.waypoints[currentIdx] = { lat: pos.lat, lon: pos.lng };
                this.notifyChange();
            });
            this.waypointMarkers.push(marker);
        }

        this.state = 'READY';
        this.notifyChange();
    }

    /**
     * Reset to WAITING_START, remove markers.
     */
    reset(): void {
        this.removeMarkers();
        this.startPos = null;
        this.endPos = null;
        this.waypoints = [];
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
        for (const marker of this.waypointMarkers) {
            map.removeLayer(marker);
        }
        this.waypointMarkers = [];
    }

    private notifyChange(): void {
        this.onChange(this.state, this.startPos, this.endPos, this.waypoints);
    }

    /**
     * Read live marker positions (mid-drag) and fire the onDrag callback.
     */
    private notifyDrag(): void {
        if (!this.onDrag) return;
        const liveStart = this.startMarker
            ? { lat: this.startMarker.getLatLng().lat, lon: this.startMarker.getLatLng().lng }
            : this.startPos;
        const liveEnd = this.endMarker
            ? { lat: this.endMarker.getLatLng().lat, lon: this.endMarker.getLatLng().lng }
            : this.endPos;
        const liveWaypoints = this.waypointMarkers.map((m, i) => {
            const pos = m.getLatLng();
            return { lat: pos.lat, lon: pos.lng };
        });
        this.onDrag(this.state, liveStart, liveEnd, liveWaypoints);
    }
}
