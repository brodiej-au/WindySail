import type { LatLon, PolarData, RouteResult, RoutePoint, RoutingOptions, WindModelId, ModelRouteResult, WindGridData, SwellGridData, CurrentGridData, PipelineStep, PreloadedGrids } from '../routing/types';
import { fetchWindGrid, computeBoundsFromPoints } from './WindProvider';
import { fetchSwellGrid, fetchCurrentGrid, fetchOceanGrids } from './OceanDataProvider';
import { clearCache as clearLandCache } from './LandChecker';
import { clear as clearWindCache } from './WindCache';
import { clear as clearOceanCache } from './OceanCache';
import { WorkerBridge } from './WorkerBridge';
import { MODEL_COLORS, MODEL_LABELS } from '../map/modelColors';
import { enrichRoutePoints } from '../routing/RouteEnricher';
import { distance } from '../routing/geo';

export type StatusCallback = (status: string, percent: number, steps?: PipelineStep[]) => void;

export class RoutingOrchestrator {
    private bridges: WorkerBridge[] = [];
    private abortController: AbortController | null = null;

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
     * Routing (55-100%): one WorkerBridge per model per leg, all models run
     * in PARALLEL via Promise.allSettled. Legs within a model run sequentially
     * (each leg's arrival time becomes the next leg's departure).
     *
     * Throws only when every model fails.
     */
    async computeRoutes(
        start: LatLon,
        end: LatLon,
        polar: PolarData,
        models: WindModelId[],
        waypoints: LatLon[] | undefined,
        options: RoutingOptions,
        onStatus?: StatusCallback,
        onIsochrone?: (model: WindModelId, step: number, points: [number, number][]) => void,
        preloaded?: PreloadedGrids,
    ): Promise<ModelRouteResult[]> {
        if (!start || !end) {
            throw new Error('Start and end points must be set.');
        }

        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const allPoints = [start, ...(waypoints ?? []), end];
        const bounds = computeBoundsFromPoints(allPoints, 1.0);

        // Build structured pipeline steps
        const steps: PipelineStep[] = [
            ...models.map(m => ({ id: `wind-${m}`, label: `Wind: ${MODEL_LABELS[m]}`, status: 'pending' as const })),
            { id: 'swell', label: 'Swell data', status: 'pending' },
            { id: 'currents', label: 'Current data', status: 'pending' },
            { id: 'routing', label: 'Computing routes', status: 'pending' },
        ];

        const emitStatus = (status: string, percent: number) => {
            onStatus?.(status, percent, [...steps.map(s => ({ ...s }))]);
        };

        console.log('[RoutingOrchestrator] Starting routing pipeline', {
            models,
            bounds,
            waypointCount: waypoints?.length ?? 0,
            startTime: new Date(options.startTime).toISOString(),
            maxDuration: options.maxDuration,
            timeStep: options.timeStep,
            maxSteps: Math.floor(options.maxDuration / options.timeStep),
        });

        // --- Wind sampling phase (0–40%) ---
        const windGrids = new Map<WindModelId, WindGridData>();
        let swellGrid: SwellGridData | undefined;
        let currentGrid: CurrentGridData | null | undefined;

        if (preloaded) {
            // Use pre-fetched grids — mark all sampling steps as done immediately
            for (const model of models) {
                const grid = preloaded.windGrids.get(model);
                if (grid) windGrids.set(model, grid);
                const step = steps.find(s => s.id === `wind-${model}`)!;
                step.status = grid ? 'done' : 'failed';
                if (!grid) step.detail = 'No preloaded data';
            }
            swellGrid = preloaded.swellGrid;
            currentGrid = preloaded.currentGrid;
            const swellStep = steps.find(s => s.id === 'swell')!;
            swellStep.status = 'done';
            swellStep.detail = swellGrid ? undefined : 'No data';
            const currentStep = steps.find(s => s.id === 'currents')!;
            currentStep.status = 'done';
            currentStep.detail = currentGrid ? undefined : 'No data';

            emitStatus('Computing routes...', 55);
        } else {
            // Must run sequentially: switching Windy products one at a time.
            let lastGrid: WindGridData | undefined;

            for (let i = 0; i < models.length; i++) {
                if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
                const model = models[i];
                const stepId = `wind-${model}`;
                const step = steps.find(s => s.id === stepId)!;
                step.status = 'active';
                const baseProgress = Math.round((i / models.length) * 40);

                emitStatus(`Sampling wind data (${MODEL_LABELS[model]})...`, baseProgress);

                try {
                    const grid = await fetchWindGrid(
                        model,
                        bounds,
                        options.startTime,
                        options.maxDuration,
                        (msg, pct) => {
                            const sliceSize = 40 / models.length;
                            const scaled = Math.round(baseProgress + pct * (sliceSize / 100));
                            step.detail = msg;
                            emitStatus(msg, scaled);
                        },
                        lastGrid,
                        signal,
                    );
                    windGrids.set(model, grid);
                    lastGrid = grid;
                    step.status = 'done';

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
                    step.status = 'failed';
                    step.detail = 'Sampling failed';
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

            // --- Ocean data phase (40–55%) ---
            const swellStep = steps.find(s => s.id === 'swell')!;
            const currentStep = steps.find(s => s.id === 'currents')!;
            swellStep.status = 'active';
            emitStatus('Sampling ocean data...', 40);

            try {
                const oceanResult = await fetchOceanGrids(
                    bounds,
                    options.startTime,
                    options.maxDuration,
                    (msg, pct) => {
                        const scaled = Math.round(40 + pct * 0.08);
                        swellStep.detail = msg;
                        emitStatus(msg, scaled);
                    },
                    (msg, pct) => {
                        const scaled = Math.round(48 + pct * 0.07);
                        currentStep.detail = msg;
                        emitStatus(msg, scaled);
                    },
                    signal,
                );
                swellGrid = oceanResult.swellGrid;
                currentGrid = oceanResult.currentGrid;
                swellStep.status = 'done';
                currentStep.status = 'done';
            } catch (err) {
                swellStep.status = 'done';
                swellStep.detail = 'Partial or no data — continuing without swell';
                currentStep.status = 'done';
                currentStep.detail = 'Partial or no data — continuing without currents';
                console.warn('[RoutingOrchestrator] Ocean data sampling failed, continuing without ocean data:', err);
            }
        }

        // --- Routing phase (55–100%) ---
        const routingStep = steps.find(s => s.id === 'routing')!;
        routingStep.status = 'active';
        let maxRoutingProgress = 0;

        // Build leg pairs from all points
        const legs: [LatLon, LatLon][] = [];
        for (let i = 0; i < allPoints.length - 1; i++) {
            legs.push([allPoints[i], allPoints[i + 1]]);
        }

        // Bridges will be created dynamically per model per leg
        this.bridges = [];

        const modelsWithGrids = models.filter(m => windGrids.has(m));

        const routingPromises = modelsWithGrids.map(async (model) => {
            const grid = windGrids.get(model)!;

            const fullPath: RoutePoint[] = [];
            let legStartTime = options.startTime;

            for (let legIdx = 0; legIdx < legs.length; legIdx++) {
                const [legStart, legEnd] = legs[legIdx];
                const legOptions = { ...options, startTime: legStartTime };

                const bridge = new WorkerBridge();
                this.bridges.push(bridge);

                const route = await bridge.computeRoute(
                    grid, polar, legStart, legEnd, legOptions,
                    (percent) => {
                        const legFraction = 1 / legs.length;
                        const overallPercent = Math.round((legIdx + percent / 100) * legFraction * 100);
                        const scaled = Math.round(55 + overallPercent * 0.45);
                        if (scaled > maxRoutingProgress) {
                            maxRoutingProgress = scaled;
                            routingStep.detail = legs.length > 1
                                ? `Leg ${legIdx + 1}/${legs.length}: ${percent}%`
                                : `${percent}%`;
                            emitStatus(
                                legs.length > 1
                                    ? `Computing routes... Leg ${legIdx + 1}/${legs.length}`
                                    : `Computing routes... ${percent}%`,
                                maxRoutingProgress,
                            );
                        }
                    },
                    swellGrid, currentGrid ?? undefined,
                    (step, pts) => onIsochrone?.(model, step, pts),
                );

                // Tag with leg index and concatenate (skip first point of subsequent legs to avoid duplicates)
                const startIdx = legIdx === 0 ? 0 : 1;
                for (let i = startIdx; i < route.path.length; i++) {
                    route.path[i].legIndex = legIdx;
                    fullPath.push(route.path[i]);
                }

                // Next leg starts from where this one ended
                legStartTime = route.path[route.path.length - 1].time;
            }

            // Build composite RouteResult from concatenated path
            let totalDistanceNm = 0;
            let maxTws = 0;
            let totalSpeed = 0;
            for (let i = 1; i < fullPath.length; i++) {
                totalDistanceNm += distance(fullPath[i - 1], fullPath[i]);
                maxTws = Math.max(maxTws, fullPath[i].tws);
                totalSpeed += fullPath[i].boatSpeed;
            }
            const avgSpeedKt = fullPath.length > 1 ? totalSpeed / (fullPath.length - 1) : 0;
            const durationMs = fullPath[fullPath.length - 1].time - fullPath[0].time;
            const durationHours = durationMs / 3600000;

            const compositeRoute: RouteResult = {
                path: fullPath,
                eta: fullPath[fullPath.length - 1].time,
                totalDistanceNm,
                avgSpeedKt,
                maxTws,
                durationHours,
            };

            return {
                model,
                route: compositeRoute,
                color: MODEL_COLORS[model],
                windGrid: grid,
                modelRunTime: grid.modelRunTime,
                dataUpdateTime: grid.dataUpdateTime,
            } as ModelRouteResult;
        });

        // Run all routing workers in parallel; collect both successes and failures.
        const settled = await Promise.allSettled(routingPromises);

        const results: ModelRouteResult[] = [];
        const failureReasons: string[] = [];

        for (let i = 0; i < settled.length; i++) {
            const outcome = settled[i];
            if (outcome.status === 'fulfilled') {
                results.push(outcome.value);
            } else {
                const reason = outcome.reason instanceof Error
                    ? outcome.reason.message
                    : String(outcome.reason ?? 'Unknown error');
                failureReasons.push(reason);
                console.warn(
                    `[RoutingOrchestrator] Routing failed for model "${modelsWithGrids[i]}":`,
                    outcome.reason,
                );
            }
        }

        if (results.length === 0) {
            // Surface the actual worker reason (e.g. "All routes blocked by land")
            // rather than a generic "All models failed" message.
            const uniqueReasons = [...new Set(failureReasons)].filter(Boolean);
            const reasonText = uniqueReasons.length === 1
                ? uniqueReasons[0]
                : uniqueReasons.join(' · ');
            routingStep.status = 'failed';
            routingStep.detail = reasonText || 'All models failed';
            emitStatus(reasonText || 'All models failed', 100);
            throw new Error(reasonText || 'All models failed to produce a route.');
        }

        routingStep.status = 'done';

        // Attach ocean data to results and enrich route points for charting
        const advisories: string[] = [];
        const routeEndTime = Math.max(...results.map(r => r.route.eta));
        if (currentGrid?.coverageEndTime) {
            if (currentGrid.coverageEndTime < routeEndTime) {
                const coverDate = new Date(currentGrid.coverageEndTime).toLocaleString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                });
                advisories.push(`Current data covers until ${coverDate}; beyond this, ocean currents are not factored into the route.`);
            }
        }
        if (swellGrid?.coverageEndTime) {
            if (swellGrid.coverageEndTime < routeEndTime) {
                const coverDate = new Date(swellGrid.coverageEndTime).toLocaleString(undefined, {
                    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                });
                advisories.push(`Swell data covers until ${coverDate}; beyond this, swell conditions are not factored into comfort weighting.`);
            }
        }

        for (const result of results) {
            result.swellGrid = swellGrid;
            result.currentGrid = currentGrid ?? undefined;
            result.dataAdvisories = advisories.length > 0 ? [...advisories] : undefined;
            enrichRoutePoints(result.route.path, swellGrid, currentGrid ?? undefined);
        }

        emitStatus('Route complete!', 100);
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
        const results = await this.computeRoutes(start, end, polar, ['gfs'], undefined, options, onStatus);
        return results[0].route;
    }

    /**
     * Cancel any in-progress routing by terminating all active workers.
     */
    cancel(): void {
        this.abortController?.abort();
        this.abortController = null;
        for (const bridge of this.bridges) {
            bridge.terminate();
        }
        this.bridges = [];
    }

    /**
     * Cleanup all resources.
     */
    destroy(): void {
        this.abortController?.abort();
        this.abortController = null;
        for (const bridge of this.bridges) {
            bridge.terminate();
        }
        this.bridges = [];
        clearLandCache();
        clearWindCache();
        clearOceanCache();
    }
}
