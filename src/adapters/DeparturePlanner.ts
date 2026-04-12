import type {
    LatLon,
    PolarData,
    RoutingOptions,
    WindModelId,
    ModelRouteResult,
    DepartureWindowConfig,
    DepartureResult,
    WindGridData,
    SwellGridData,
    CurrentGridData,
    PreloadedGrids,
} from '../routing/types';
import { RoutingOrchestrator } from './RoutingOrchestrator';
import { fetchWindGrid, computeBoundsFromPoints } from './WindProvider';
import { fetchSwellGrid, fetchCurrentGrid } from './OceanDataProvider';

export type DepartureStatusCallback = (
    status: string,
    percent: number,
    departureIndex: number,
    totalDepartures: number,
) => void;

export type DepartureCompleteCallback = (result: DepartureResult) => void;

export class DeparturePlanner {
    private orchestrator: RoutingOrchestrator;
    private cancelled = false;
    private abortController: AbortController | null = null;

    constructor() {
        this.orchestrator = new RoutingOrchestrator();
    }

    static generateDepartureTimes(config: DepartureWindowConfig): number[] {
        if (config.intervalHours <= 0 || config.windowEnd < config.windowStart) return [];
        const times: number[] = [];
        const intervalMs = config.intervalHours * 3600_000;
        let t = config.windowStart;
        while (t <= config.windowEnd) {
            times.push(t);
            t += intervalMs;
        }
        return times;
    }

    async scan(
        start: LatLon,
        end: LatLon,
        polar: PolarData,
        models: WindModelId[],
        waypoints: LatLon[] | undefined,
        baseOptions: RoutingOptions,
        windowConfig: DepartureWindowConfig,
        onStatus?: DepartureStatusCallback,
        onDepartureComplete?: DepartureCompleteCallback,
    ): Promise<DepartureResult[]> {
        this.cancelled = false;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        const departureTimes = DeparturePlanner.generateDepartureTimes(windowConfig);
        const totalDepartures = departureTimes.length;
        const results: DepartureResult[] = [];

        if (departureTimes.length === 0) {
            onStatus?.('Scan complete!', 100, 0, 0);
            return results;
        }

        // --- Pre-fetch phase (0–40%) ---
        // Compute the full time range covering all departures + max route duration
        const fullStartTime = departureTimes[0];
        const lastDepartureTime = departureTimes[departureTimes.length - 1];
        const extraHours = (lastDepartureTime - fullStartTime) / 3600_000;
        const fullMaxDuration = baseOptions.maxDuration + extraHours;

        const allPoints = [start, ...(waypoints ?? []), end];
        const bounds = computeBoundsFromPoints(allPoints, 1.0);

        onStatus?.('Fetching forecast data...', 0, 0, totalDepartures);

        // Pre-fetch wind grids (one per model, sequentially — Windy product switching)
        const preloadedWindGrids = new Map<WindModelId, WindGridData>();
        let lastGrid: WindGridData | undefined;
        for (let i = 0; i < models.length; i++) {
            if (this.cancelled) break;
            const model = models[i];
            try {
                const grid = await fetchWindGrid(
                    model,
                    bounds,
                    fullStartTime,
                    fullMaxDuration,
                    (msg, pct) => {
                        const sliceSize = 30 / models.length;
                        const baseProgress = Math.round((i / models.length) * 30);
                        const scaled = Math.round(baseProgress + pct * (sliceSize / 100));
                        onStatus?.(
                            `Fetching forecast data... ${msg}`,
                            scaled,
                            0,
                            totalDepartures,
                        );
                    },
                    lastGrid,
                    signal,
                );
                preloadedWindGrids.set(model, grid);
                lastGrid = grid;
            } catch (err) {
                console.warn(`[DeparturePlanner] Wind pre-fetch failed for "${model}":`, err);
            }
        }

        if (this.cancelled) return results;

        // Pre-fetch ocean data (model-independent)
        let swellGrid: SwellGridData | undefined;
        let currentGrid: CurrentGridData | null | undefined;

        onStatus?.('Fetching swell data...', 30, 0, totalDepartures);
        try {
            swellGrid = await fetchSwellGrid(
                bounds,
                fullStartTime,
                fullMaxDuration,
                (msg, pct) => {
                    const scaled = Math.round(30 + pct * 0.05);
                    onStatus?.(`Fetching swell data... ${msg}`, scaled, 0, totalDepartures);
                },
                signal,
            );
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            console.warn('[DeparturePlanner] Swell pre-fetch failed:', err);
        }

        onStatus?.('Fetching current data...', 35, 0, totalDepartures);
        try {
            currentGrid = await fetchCurrentGrid(
                bounds,
                fullStartTime,
                fullMaxDuration,
                (msg, pct) => {
                    const scaled = Math.round(35 + pct * 0.05);
                    onStatus?.(`Fetching current data... ${msg}`, scaled, 0, totalDepartures);
                },
                signal,
            );
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') throw err;
            console.warn('[DeparturePlanner] Current pre-fetch failed:', err);
        }

        if (this.cancelled) return results;

        const preloaded: PreloadedGrids = {
            windGrids: preloadedWindGrids,
            swellGrid,
            currentGrid,
        };

        // --- Routing phase (40–100%) ---
        for (let i = 0; i < departureTimes.length; i++) {
            if (this.cancelled) break;

            const departureTime = departureTimes[i];
            const options = { ...baseOptions, startTime: departureTime };

            const routingBase = 40;
            const routingRange = 60;
            onStatus?.(
                `Computing departure ${i + 1}/${totalDepartures}`,
                Math.round(routingBase + (i / totalDepartures) * routingRange),
                i,
                totalDepartures,
            );

            try {
                this.orchestrator = new RoutingOrchestrator();

                const modelResults = await this.orchestrator.computeRoutes(
                    start,
                    end,
                    polar,
                    models,
                    waypoints,
                    options,
                    (status, percent) => {
                        const depProgress = (i + percent / 100) / totalDepartures;
                        const overallPercent = Math.round(routingBase + depProgress * routingRange);
                        onStatus?.(
                            `Departure ${i + 1}/${totalDepartures} — ${status}`,
                            overallPercent,
                            i,
                            totalDepartures,
                        );
                    },
                    undefined, // no isochrone callback for departure scans
                    preloaded,
                );

                const succeededModels = modelResults.map(r => r.model);
                const failed = models.filter(m => !succeededModels.includes(m));

                const result: DepartureResult = {
                    departureTime,
                    modelResults,
                    failedModels: failed.length > 0 ? failed : undefined,
                };

                results.push(result);
                onDepartureComplete?.(result);
            } catch (err) {
                const result: DepartureResult = {
                    departureTime,
                    modelResults: [],
                    failedModels: [...models],
                };
                results.push(result);
                onDepartureComplete?.(result);
                console.warn(
                    `[DeparturePlanner] All models failed for departure ${new Date(departureTime).toISOString()}:`,
                    err,
                );
            }
        }

        onStatus?.('Scan complete!', 100, totalDepartures, totalDepartures);
        return results;
    }

    cancel(): void {
        this.cancelled = true;
        this.abortController?.abort();
        this.abortController = null;
        this.orchestrator.cancel();
    }

    destroy(): void {
        this.cancelled = true;
        this.abortController?.abort();
        this.abortController = null;
        this.orchestrator.destroy();
    }
}
