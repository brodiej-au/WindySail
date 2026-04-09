import type {
    LatLon,
    PolarData,
    RoutingOptions,
    WindModelId,
    ModelRouteResult,
    DepartureWindowConfig,
    DepartureResult,
} from '../routing/types';
import { RoutingOrchestrator } from './RoutingOrchestrator';

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
        const departureTimes = DeparturePlanner.generateDepartureTimes(windowConfig);
        const totalDepartures = departureTimes.length;
        const results: DepartureResult[] = [];

        for (let i = 0; i < departureTimes.length; i++) {
            if (this.cancelled) break;

            const departureTime = departureTimes[i];
            const options = { ...baseOptions, startTime: departureTime };

            onStatus?.(
                `Departure ${i + 1}/${totalDepartures}`,
                Math.round((i / totalDepartures) * 100),
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
                        const overallPercent = Math.round(
                            ((i + percent / 100) / totalDepartures) * 100,
                        );
                        onStatus?.(
                            `Departure ${i + 1}/${totalDepartures} — ${status}`,
                            overallPercent,
                            i,
                            totalDepartures,
                        );
                    },
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
        this.orchestrator.cancel();
    }

    destroy(): void {
        this.cancelled = true;
        this.orchestrator.destroy();
    }
}
