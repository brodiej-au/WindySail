export interface LatLon {
    lat: number;
    lon: number;
}

export interface LatLonBounds {
    north: number;
    south: number;
    east: number;
    west: number;
}

export interface WindVector {
    speed: number; // knots
    direction: number; // degrees, where wind comes FROM
}

export interface RoutePoint {
    lat: number;
    lon: number;
    time: number; // Unix timestamp ms
    twa: number; // degrees 0-180
    tws: number; // knots
    twd: number; // degrees
    boatSpeed: number; // knots
    heading: number; // degrees 0-360
    isMotoring?: boolean; // true if motoring instead of sailing
    swell?: SwellPoint;
    current?: CurrentPoint;
}

export interface RouteResult {
    path: RoutePoint[];
    eta: number; // Unix timestamp ms
    totalDistanceNm: number;
    avgSpeedKt: number;
    maxTws: number; // knots
    durationHours: number;
}

export interface RoutingOptions {
    startTime: number; // Unix timestamp ms
    timeStep: number; // hours, default 1.0
    maxDuration: number; // hours, default 168
    headingStep: number; // degrees, default 5
    numSectors: number; // pruning sectors, default 72
    arrivalRadius: number; // nautical miles, default 1.0
    motorEnabled?: boolean; // allow motoring below threshold
    motorThreshold?: number; // knots — motor if sail speed below this
    motorSpeed?: number; // knots — speed when motoring
}

export const DEFAULT_OPTIONS: RoutingOptions = {
    startTime: Date.now(),
    timeStep: 1.0,
    maxDuration: 168,
    headingStep: 5,
    numSectors: 72,
    arrivalRadius: 1.0,
};

export interface PolarData {
    name: string;
    twaAngles: number[]; // e.g. [0, 30, 40, ..., 180]
    twsSpeeds: number[]; // e.g. [4, 6, 8, ..., 25]
    speeds: number[][]; // speeds[twaIndex][twsIndex] in knots
}

export interface WindGridData {
    lats: number[];
    lons: number[];
    timestamps: number[]; // Unix timestamp ms
    windU: number[][][]; // windU[latIdx][lonIdx][timeIdx] in m/s
    windV: number[][][]; // windV[latIdx][lonIdx][timeIdx] in m/s
}

export interface SwellGridData {
    lats: number[];
    lons: number[];
    timestamps: number[];
    swellHeight: number[][][]; // [latIdx][lonIdx][timeIdx] in meters
    swellDir: number[][][];    // [latIdx][lonIdx][timeIdx] in degrees
    swellPeriod: number[][][]; // [latIdx][lonIdx][timeIdx] in seconds
}

export interface CurrentGridData {
    lats: number[];
    lons: number[];
    timestamps: number[];
    currentU: number[][][]; // [latIdx][lonIdx][timeIdx] in m/s
    currentV: number[][][]; // [latIdx][lonIdx][timeIdx] in m/s
}

export interface SwellPoint {
    height: number;  // meters
    direction: number; // degrees
    period: number;  // seconds
}

export interface CurrentPoint {
    speed: number;     // knots
    direction: number; // degrees
}

export interface IsochronePoint {
    lat: number;
    lon: number;
    parent: number | null; // index into previous isochrone's points, or null for start
    twa: number;
    tws: number;
    twd: number;
    boatSpeed: number;
    heading: number;
    time: number;
    isMotoring?: boolean;
}

export type StepStatus = 'pending' | 'active' | 'done' | 'failed' | 'skipped';
export interface PipelineStep {
    id: string;
    label: string;
    status: StepStatus;
    detail?: string;
}

export type WindModelId = 'gfs' | 'ecmwf' | 'icon' | 'bomAccess';

export interface ModelRouteResult {
    model: WindModelId;
    route: RouteResult;
    color: string;
    windGrid: WindGridData;
    swellGrid?: SwellGridData;
    currentGrid?: CurrentGridData;
}

export interface UserSettings {
    timeStep: number; // hours
    maxDuration: number; // hours
    headingStep: number; // degrees
    numSectors: number; // pruning sectors
    arrivalRadius: number; // nautical miles
    landMarginNm: number; // nautical miles
    estimatedVmgKt: number; // knots, used to auto-estimate forecast duration
    motorEnabled: boolean; // allow motoring when boat speed is below threshold
    motorThreshold: number; // knots — motor if sail speed is below this
    motorSpeed: number; // knots — speed when motoring
    selectedModels: WindModelId[];
    selectedPolarName: string;
}

export const DEFAULT_SETTINGS: UserSettings = {
    timeStep: 1.0,
    maxDuration: 168,
    headingStep: 5,
    numSectors: 72,
    arrivalRadius: 1.0,
    landMarginNm: 1,
    estimatedVmgKt: 3,
    motorEnabled: false,
    motorThreshold: 2,
    motorSpeed: 4,
    selectedModels: ['gfs'],
    selectedPolarName: 'Bavaria 38',
}
