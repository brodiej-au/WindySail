import type { LatLon, PolarData, RouteResult, RoutingOptions, WindGridData, SwellGridData, CurrentGridData } from '../routing/types';
import type { WorkerToMainMessage } from '../worker/messages';
import { checkPoints, checkSegments } from './LandChecker';

export type ProgressCallback = (percent: number, step: number, totalSteps: number) => void;

export class WorkerBridge {
    private worker: Worker | null = null;

    /**
     * Compute a route using the Web Worker.
     * The worker handles isochrone expansion; this bridge handles land checks on the main thread.
     */
    async computeRoute(
        windGrid: WindGridData,
        polar: PolarData,
        start: LatLon,
        end: LatLon,
        options: RoutingOptions,
        onProgress?: ProgressCallback,
        swellGrid?: SwellGridData,
        currentGrid?: CurrentGridData,
        onIsochrone?: (step: number, points: [number, number][]) => void,
    ): Promise<RouteResult> {
        // Fetch worker script and create blob URL to bypass cross-origin restriction
        // (plugin JS is served from localhost but runs on windy.com)
        const scriptUrl = new URL('./router.worker.js', import.meta.url).href;
        const response = await fetch(scriptUrl);
        const scriptText = await response.text();
        const blob = new Blob([scriptText], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        this.worker = new Worker(blobUrl);
        URL.revokeObjectURL(blobUrl);

        return new Promise<RouteResult>((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not created'));
                return;
            }

            this.worker.onmessage = async (e: MessageEvent<WorkerToMainMessage>) => {
                const msg = e.data;

                switch (msg.type) {
                    case 'CHECK_LAND': {
                        // Perform land checks on main thread
                        const promises: [Promise<boolean[]>, Promise<boolean[]>, Promise<boolean[] | undefined>] = [
                            checkPoints(msg.payload.points),
                            checkSegments(msg.payload.segments),
                            msg.payload.marginPoints && msg.payload.marginPoints.length > 0
                                ? checkPoints(msg.payload.marginPoints)
                                : Promise.resolve(undefined),
                        ];
                        const [pointResults, segmentResults, rawMarginResults] = await Promise.all(promises);

                        // Collapse ring results: candidate is near land if ANY ring point is on land
                        let marginResults: boolean[] | undefined;
                        if (rawMarginResults && msg.payload.marginGroupSize) {
                            const groupSize = msg.payload.marginGroupSize;
                            const numCandidates = Math.floor(rawMarginResults.length / groupSize);
                            marginResults = [];
                            for (let i = 0; i < numCandidates; i++) {
                                let nearLand = false;
                                for (let j = 0; j < groupSize; j++) {
                                    if (!rawMarginResults[i * groupSize + j]) {
                                        nearLand = true; // ring point hit land
                                        break;
                                    }
                                }
                                marginResults.push(nearLand);
                            }
                        }

                        this.worker?.postMessage({
                            type: 'LAND_RESULTS',
                            payload: { pointResults, segmentResults, marginResults },
                        });
                        break;
                    }

                    case 'PROGRESS':
                        onProgress?.(
                            msg.payload.percent,
                            msg.payload.step,
                            msg.payload.totalSteps,
                        );
                        break;

                    case 'ISOCHRONE_UPDATE':
                        onIsochrone?.(msg.payload.step, msg.payload.points);
                        break;

                    case 'ROUTE_COMPLETE':
                        this.terminate();
                        resolve(msg.payload);
                        break;

                    case 'ROUTE_FAILED':
                        this.terminate();
                        reject(new Error(msg.payload.reason));
                        break;
                }
            };

            this.worker.onerror = (err) => {
                this.terminate();
                reject(new Error(`Worker error: ${err.message}`));
            };

            // Start routing
            this.worker.postMessage({
                type: 'START_ROUTING',
                payload: { windGrid, polar, start, end, options, swellGrid, currentGrid },
            });
        });
    }

    /**
     * Terminate the worker.
     */
    terminate(): void {
        this.worker?.terminate();
        this.worker = null;
    }
}
