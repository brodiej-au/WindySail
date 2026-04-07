import type { LatLon, PolarData, RouteResult, RoutingOptions, WindModelId, ModelRouteResult, WindGridData } from '../routing/types';
import { fetchWindGrid, computeBounds } from './WindProvider';
import { clearCache as clearLandCache } from './LandChecker';
import { WorkerBridge } from './WorkerBridge';
import { MODEL_COLORS } from '../map/modelColors';

export type StatusCallback = (status: string, percent: number) => void;

export class RoutingOrchestrator {
    private bridges: WorkerBridge[] = [];

    constructor(_pluginName?: string) {
        // pluginName reserved for future use (e.g., worker naming)
    }

    /**
     * Run the full routing pipeline for multiple wind models.
     *
     * Wind sampling (0-40%): models are queried SEQUENTIALLY because only one
     * Windy product can be active at a time.
     *
     * Routing (40-100%): one WorkerBridge per model, all run in PARALLEL via
     * Promise.allSettled. Per-model failures are warned but do not abort.
     *
     * Throws only when every model fails.
     */
    async computeRoutes(
        start: LatLon,
        end: LatLon,
        polar: PolarData,
        models: WindModelId[],
        options: RoutingOptions,
        onStatus?: StatusCallback,
    ): Promise<ModelRouteResult[]> {
        if (!start || !end) {
            throw new Error('Start and end points must be set.');
        }

        const bounds = computeBounds(start, end, 1.0);

        // --- Wind sampling phase (0–40%) ---
        // Must run sequentially: switching Windy products one at a time.
        const windGrids = new Map<WindModelId, WindGridData>();

        for (let i = 0; i < models.length; i++) {
            const model = models[i];
            const baseProgress = Math.round((i / models.length) * 40);

            onStatus?.(`Sampling wind data (${model})...`, baseProgress);

            try {
                const grid = await fetchWindGrid(
                    model,
                    bounds,
                    options.startTime,
                    options.maxDuration,
                    (msg, pct) => {
                        // Scale each model's internal progress into its slice of 0-40%
                        const sliceSize = 40 / models.length;
                        const scaled = Math.round(baseProgress + pct * (sliceSize / 100));
                        onStatus?.(msg, scaled);
                    },
                );
                windGrids.set(model, grid);
            } catch (err) {
                console.warn(`[RoutingOrchestrator] Wind sampling failed for model "${model}":`, err);
            }
        }

        // --- Routing phase (40–100%) ---
        // Track the maximum progress reported across all parallel workers so the
        // status bar always moves forward, never backward.
        let maxRoutingProgress = 0;

        // Create one bridge per model that successfully returned a wind grid.
        const modelsWithGrids = models.filter(m => windGrids.has(m));
        this.bridges = modelsWithGrids.map(() => new WorkerBridge());

        const routingPromises = modelsWithGrids.map((model, idx) => {
            const bridge = this.bridges[idx];
            const grid = windGrids.get(model)!;

            return bridge
                .computeRoute(grid, polar, start, end, options, (percent) => {
                    // Scale worker progress (0-100) into the 40-100% window
                    const scaled = Math.round(40 + percent * 0.6);
                    if (scaled > maxRoutingProgress) {
                        maxRoutingProgress = scaled;
                        onStatus?.(`Computing routes... ${maxRoutingProgress}%`, maxRoutingProgress);
                    }
                })
                .then((route): ModelRouteResult => ({
                    model,
                    route,
                    color: MODEL_COLORS[model],
                    windGrid: grid,
                }));
        });

        // Run all routing workers in parallel; collect both successes and failures.
        const settled = await Promise.allSettled(routingPromises);

        const results: ModelRouteResult[] = [];

        for (let i = 0; i < settled.length; i++) {
            const outcome = settled[i];
            if (outcome.status === 'fulfilled') {
                results.push(outcome.value);
            } else {
                console.warn(
                    `[RoutingOrchestrator] Routing failed for model "${modelsWithGrids[i]}":`,
                    outcome.reason,
                );
            }
        }

        if (results.length === 0) {
            throw new Error('All models failed to produce a route.');
        }

        onStatus?.('Route complete!', 100);
        return results;
    }

    /**
     * Convenience wrapper for single-model routing.
     * Calls computeRoutes with only 'gfs' and returns the single RouteResult.
     */
    async computeRoute(
        start: LatLon,
        end: LatLon,
        polar: PolarData,
        options: RoutingOptions,
        onStatus?: StatusCallback,
    ): Promise<RouteResult> {
        const results = await this.computeRoutes(start, end, polar, ['gfs'], options, onStatus);
        return results[0].route;
    }

    /**
     * Cancel any in-progress routing by terminating all active workers.
     */
    cancel(): void {
        for (const bridge of this.bridges) {
            bridge.terminate();
        }
        this.bridges = [];
    }

    /**
     * Cleanup all resources.
     */
    destroy(): void {
        for (const bridge of this.bridges) {
            bridge.terminate();
        }
        this.bridges = [];
        clearLandCache();
    }
}
