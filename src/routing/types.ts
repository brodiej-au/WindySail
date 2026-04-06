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
}
