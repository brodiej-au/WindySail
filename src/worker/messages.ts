import type {
    LatLon,
    PolarData,
    RoutingOptions,
    RouteResult,
    WindGridData,
    SwellGridData,
    CurrentGridData,
} from '../routing/types';

// Main thread -> Worker
export interface StartRoutingMessage {
    type: 'START_ROUTING';
    payload: {
        windGrid: WindGridData;
        polar: PolarData;
        start: LatLon;
        end: LatLon;
        options: RoutingOptions;
        swellGrid?: SwellGridData;
        currentGrid?: CurrentGridData;
    };
}

export interface LandResultsMessage {
    type: 'LAND_RESULTS';
    payload: {
        pointResults: boolean[]; // true = sea (valid)
        segmentResults: boolean[]; // true = no land crossing (valid)
    };
}

export type MainToWorkerMessage = StartRoutingMessage | LandResultsMessage;

// Worker -> Main thread
export interface CheckLandMessage {
    type: 'CHECK_LAND';
    payload: {
        points: [number, number][]; // [lat, lon][]
        segments: [number, number, number, number][]; // [fromLat, fromLon, toLat, toLon][]
    };
}

export interface ProgressMessage {
    type: 'PROGRESS';
    payload: {
        step: number;
        totalSteps: number;
        percent: number;
    };
}

export interface RouteCompleteMessage {
    type: 'ROUTE_COMPLETE';
    payload: RouteResult;
}

export interface RouteFailedMessage {
    type: 'ROUTE_FAILED';
    payload: {
        reason: string;
    };
}

export type WorkerToMainMessage =
    | CheckLandMessage
    | ProgressMessage
    | RouteCompleteMessage
    | RouteFailedMessage;
