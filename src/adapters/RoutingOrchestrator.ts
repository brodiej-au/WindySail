import type { LatLon, PolarData, RouteResult, RoutingOptions } from '../routing/types';
import { fetchWindGrid, computeBounds } from './WindProvider';
import { clearCache as clearLandCache } from './LandChecker';
import { WorkerBridge } from './WorkerBridge';

export type StatusCallback = (status: string, percent: number) => void;

export class RoutingOrchestrator {
    private bridge: WorkerBridge = new WorkerBridge();
    private pluginName: string;

    constructor(pluginName: string) {
        this.pluginName = pluginName;
    }

    /**
     * Run the full routing pipeline: validate -> fetch wind -> compute route.
     */
    async computeRoute(
        start: LatLon,
        end: LatLon,
        polar: PolarData,
        options: RoutingOptions,
        onStatus?: StatusCallback,
    ): Promise<RouteResult> {
        // Validate start/end
        if (!start || !end) {
            throw new Error('Start and end points must be set.');
        }

        // Fetch wind grid
        onStatus?.('Fetching weather data...', 0);
        const bounds = computeBounds(start, end, 1.0);
        const windGrid = await fetchWindGrid('gfs', bounds, this.pluginName);

        // Compute route via worker
        onStatus?.('Computing route...', 5);
        const result = await this.bridge.computeRoute(
            windGrid,
            polar,
            start,
            end,
            options,
            (percent) => {
                // Scale worker progress from 5-100%
                const scaledPercent = 5 + Math.round(percent * 0.95);
                onStatus?.(`Computing route... ${scaledPercent}%`, scaledPercent);
            },
        );

        onStatus?.('Route complete!', 100);
        return result;
    }

    /**
     * Cancel any in-progress routing.
     */
    cancel(): void {
        this.bridge.terminate();
    }

    /**
     * Cleanup resources.
     */
    destroy(): void {
        this.bridge.terminate();
        clearLandCache();
    }
}
