import type { LatLon, PolarData, RouteResult, RoutingOptions, WindModelId, ModelRouteResult, WindGridData, SwellGridData, CurrentGridData } from '../routing/types';
import { fetchWindGrid, computeBounds } from './WindProvider';
import { fetchSwellGrid, fetchCurrentGrid } from './OceanDataProvider';
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

                // Warn if all wind U/V values are zero — this typically indicates
                // a silent data failure where the model returned empty wind data.
                const allZero =
                    grid.windU.every(lat => lat.every(lon => lon.every(val => val === 0))) &&
                    grid.windV.every(lat => lat.every(lon => lon.every(val => val === 0)));
                if (allZero) {
                    console.warn(
                        `[RoutingOrchestrator] Wind grid for model "${model}" has all-zero values — data may have failed silently.`,
                    );
                }
            } catch (err) {
                console.warn(`[RoutingOrchestrator] Wind sampling failed for model "${model}":`, err);
            }
        }

        // --- Ocean data phase (40–55%) ---
        // Swell and currents are model-independent — sample once after wind.
        // Both are optional: failures warn and continue without ocean data.
        let swellGrid: SwellGridData | undefined;
        let currentGrid: CurrentGridData | null | undefined;

        onStatus?.('Sampling swell data...', 40);
        try {
            swellGrid = await fetchSwellGrid(
                bounds,
                options.startTime,
                options.maxDuration,
                (msg, pct) => {
                    // Scale swell provider progress (0-100) into the 40-48% window
                    const scaled = Math.round(40 + pct * 0.08);
                    onStatus?.(msg, scaled);
                },
            );
        } catch (err) {
            console.warn('[RoutingOrchestrator] Swell sampling failed, continuing without swell data:', err);
        }

        onStatus?.('Sampling current data...', 48);
        try {
            currentGrid = await fetchCurrentGrid(
                bounds,
                options.startTime,
                options.maxDuration,
                (msg, pct) => {
                    // Scale currents provider progress (0-100) into the 48-55% window
                    const scaled = Math.round(48 + pct * 0.07);
                    onStatus?.(msg, scaled);
                },
            );
        } catch (err) {
            console.warn('[RoutingOrchestrator] Current sampling failed, continuing without current data:', err);
        }

        // --- Routing phase (55–100%) ---
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
                    // Scale worker progress (0-100) into the 55-100% window
                    const scaled = Math.round(55 + percent * 0.45);
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
                    swellGrid,
                    currentGrid: currentGrid ?? undefined,
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
