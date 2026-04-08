import type { LatLon, PolarData, RouteResult, RoutingOptions, WindModelId, ModelRouteResult, WindGridData, SwellGridData, CurrentGridData } from '../routing/types';
import { fetchWindGrid, computeBounds } from './WindProvider';
import { fetchSwellGrid, fetchCurrentGrid } from './OceanDataProvider';
import { clearCache as clearLandCache } from './LandChecker';
import { clear as clearWindCache } from './WindCache';
import { WorkerBridge } from './WorkerBridge';
import { MODEL_COLORS } from '../map/modelColors';
import { enrichRoutePoints } from '../routing/RouteEnricher';

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
     * Ocean data (40-55%): swell (40-48%) and currents (48-55%) are sampled
     * ONCE — they are model-independent. Failures are warned but non-fatal.
     *
     * Routing (55-100%): one WorkerBridge per model, all run in PARALLEL via
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

        // Clear stale wind cache to avoid reusing bad data from earlier failed runs.
        clearWindCache();

        const bounds = computeBounds(start, end, 1.0);

        console.log('[RoutingOrchestrator] Starting routing pipeline', {
            models,
            bounds,
            startTime: new Date(options.startTime).toISOString(),
            maxDuration: options.maxDuration,
            timeStep: options.timeStep,
            maxSteps: Math.floor(options.maxDuration / options.timeStep),
        });

        // --- Wind sampling phase (0–40%) ---
        // Must run sequentially: switching Windy products one at a time.
        const windGrids = new Map<WindModelId, WindGridData>();

        let lastGrid: WindGridData | undefined;

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
                    lastGrid,
                );
                windGrids.set(model, grid);
                lastGrid = grid;

                // Count non-zero values for diagnostics
                let nonZeroCount = 0;
                let totalCount = 0;
                for (const lat of grid.windU) {
                    for (const lon of lat) {
                        for (const val of lon) {
                            totalCount++;
                            if (val !== 0) nonZeroCount++;
                        }
                    }
                }

                console.log(`[RoutingOrchestrator] Wind grid for "${model}":`, {
                    lats: grid.lats.length,
                    lons: grid.lons.length,
                    timestamps: grid.timestamps.length,
                    nonZeroValues: `${nonZeroCount}/${totalCount}`,
                    timeRange: `${new Date(grid.timestamps[0]).toISOString()} → ${new Date(grid.timestamps[grid.timestamps.length - 1]).toISOString()}`,
                });

                if (nonZeroCount === 0) {
                    console.warn(
                        `[RoutingOrchestrator] Wind grid for model "${model}" has all-zero values — data may have failed silently.`,
                    );
                }
            } catch (err) {
                console.warn(`[RoutingOrchestrator] Wind sampling failed for model "${model}":`, err);
            }
        }

        // Verify wind grids are actually different between models
        if (windGrids.size >= 2) {
            const grids = [...windGrids.entries()];
            for (let i = 1; i < grids.length; i++) {
                const [modelA, gridA] = grids[0];
                const [modelB, gridB] = grids[i];
                let diffCount = 0;
                let totalCount = 0;
                for (let li = 0; li < Math.min(gridA.windU.length, gridB.windU.length); li++) {
                    for (let lo = 0; lo < Math.min(gridA.windU[li].length, gridB.windU[li].length); lo++) {
                        for (let ti = 0; ti < Math.min(gridA.windU[li][lo].length, gridB.windU[li][lo].length); ti++) {
                            totalCount++;
                            if (gridA.windU[li][lo][ti] !== gridB.windU[li][lo][ti] ||
                                gridA.windV[li][lo][ti] !== gridB.windV[li][lo][ti]) {
                                diffCount++;
                            }
                        }
                    }
                }
                if (diffCount === 0) {
                    console.error(`[RoutingOrchestrator] WARNING: Wind grids for "${modelA}" and "${modelB}" are IDENTICAL (${totalCount} values). Product switch likely failed.`);
                } else {
                    console.log(`[RoutingOrchestrator] Wind grids "${modelA}" vs "${modelB}": ${diffCount}/${totalCount} values differ ✓`);
                }
            }
        }

        // --- Routing phase (40–85%) ---
        // Run routing BEFORE ocean data sampling to avoid overlay/product
        // switching (waves, currents) corrupting Windy's tile cache.
        let maxRoutingProgress = 0;

        // Create one bridge per model that successfully returned a wind grid.
        const modelsWithGrids = models.filter(m => windGrids.has(m));
        this.bridges = modelsWithGrids.map(() => new WorkerBridge());

        const routingPromises = modelsWithGrids.map((model, idx) => {
            const bridge = this.bridges[idx];
            const grid = windGrids.get(model)!;

            return bridge
                .computeRoute(grid, polar, start, end, options, (percent) => {
                    // Scale worker progress (0-100) into the 40-85% window
                    const scaled = Math.round(40 + percent * 0.45);
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

        // --- Ocean data phase (85–98%) ---
        // Swell and currents are sampled AFTER routing completes to avoid
        // overlay/product switching (waves/ecmwfWaves, currents/cmems) corrupting
        // Windy's SwitchableTileCache and causing all-zero wind grids.
        let swellGrid: SwellGridData | undefined;
        let currentGrid: CurrentGridData | null | undefined;

        onStatus?.('Sampling swell data...', 85);
        try {
            swellGrid = await fetchSwellGrid(
                bounds,
                options.startTime,
                options.maxDuration,
                (msg, pct) => {
                    const scaled = Math.round(85 + pct * 0.06);
                    onStatus?.(msg, scaled);
                },
            );
        } catch (err) {
            console.warn('[RoutingOrchestrator] Swell sampling failed, continuing without swell data:', err);
        }

        onStatus?.('Sampling current data...', 91);
        try {
            currentGrid = await fetchCurrentGrid(
                bounds,
                options.startTime,
                options.maxDuration,
                (msg, pct) => {
                    const scaled = Math.round(91 + pct * 0.07);
                    onStatus?.(msg, scaled);
                },
            );
        } catch (err) {
            console.warn('[RoutingOrchestrator] Current sampling failed, continuing without current data:', err);
        }

        // Attach ocean data to results and enrich route points for charting
        for (const result of results) {
            result.swellGrid = swellGrid;
            result.currentGrid = currentGrid ?? undefined;
            enrichRoutePoints(result.route.path, swellGrid, currentGrid ?? undefined);
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
