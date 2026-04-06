# Windy Sail Router — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP Windy plugin that computes and displays optimal sailing routes using GFS wind forecasts, Bavaria 38 polar data, and land avoidance.

**Architecture:** Three-layer design — pure TypeScript routing engine runs in a Web Worker, Windy API adapters on the main thread bridge weather/elevation data, Svelte UI in the right-hand pane. Worker communicates via typed messages; land checks round-trip to main thread per isochrone step.

**Tech Stack:** TypeScript, Svelte, Rollup, Leaflet (via Windy), Vitest (testing), @windycom/plugin-devtools

---

## File Structure

```
src/
  plugin.svelte                    # Plugin shell — mounts RoutingPanel, lifecycle
  pluginConfig.ts                  # Windy plugin config (name, icon, UI layout)
  routing/
    types.ts                       # Shared interfaces: LatLon, RoutePoint, RouteResult, etc.
    geo.ts                         # Geodesic math: distance, bearing, advance, TWA
    Polar.ts                       # Polar interpolation from TWA/TWS matrix
    WindGrid.ts                    # Bilinear spatial + linear temporal wind interpolation
    IsochroneRouter.ts             # Core isochrone expansion + pruning algorithm
  worker/
    messages.ts                    # Worker message type definitions
    router.worker.ts               # Web Worker entry: receives data, runs router, sends results
  adapters/
    WindProvider.ts                 # Fetches wind grid from Windy getPointForecastData
    LandChecker.ts                 # Elevation-based land/sea cache + batch checking
    WorkerBridge.ts                # Typed Worker wrapper with land-check callback loop
    RoutingOrchestrator.ts         # Coordinates: fetch wind → start worker → collect results
  map/
    RouteRenderer.ts               # Draws route polyline + start/end markers on Leaflet map
    WaypointManager.ts             # Click-to-place start/end via singleclick, draggable markers
  ui/
    RoutingPanel.svelte            # Main control panel: inputs, button, progress, results
    ProgressBar.svelte             # Progress bar with status text
  data/
    polars/
      bavaria38.json               # Bavaria 38 polar speed matrix
tests/
  routing/
    geo.test.ts                    # Unit tests for geodesic functions
    Polar.test.ts                  # Unit tests for polar interpolation
    WindGrid.test.ts               # Unit tests for wind grid interpolation
    IsochroneRouter.test.ts        # Unit tests for isochrone algorithm
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `rollup.config.js`
- Create: `svelte.config.js`
- Create: `src/pluginConfig.ts`
- Create: `src/plugin.svelte` (minimal placeholder)
- Create: `vitest.config.ts`

- [ ] **Step 1: Clone the Windy plugin template**

```bash
cd /mnt/c/Users/brodi/dev/WindySail
git clone https://github.com/windycom/windy-plugin-template.git .
```

If the directory isn't empty (e.g. docs already exist), clone to a temp dir and copy:

```bash
git clone https://github.com/windycom/windy-plugin-template.git /tmp/windy-template
cp -r /tmp/windy-template/{src,declarations,package.json,tsconfig.json,rollup.config.js,svelte.config.js,.eslintrc.cjs,.prettierrc,.gitignore} .
cp -r /tmp/windy-template/.github .
rm -rf /tmp/windy-template
```

- [ ] **Step 2: Update package.json**

Replace the contents of `package.json` with:

```json
{
    "name": "windy-plugin-sail-router",
    "version": "0.1.0",
    "description": "Sailing weather routing plugin for Windy.com with multi-model comparison",
    "main": "dist/plugin.min.js",
    "type": "module",
    "scripts": {
        "build": "rm -rf dist && mkdir dist && SERVE=false rollup -c && cp package.json dist/",
        "build:win": "if exist dist rmdir /s /q dist && mkdir dist && set SERVE=false && rollup -c && copy package.json dist\\",
        "start": "rollup -w -c",
        "test": "vitest run",
        "test:watch": "vitest"
    },
    "repository": {
        "type": "git",
        "url": ""
    },
    "keywords": ["windy", "sailing", "weather-routing", "isochrone"],
    "author": "Brodie (appd.com.au)",
    "license": "GPL-3.0",
    "dependencies": {
        "@windycom/plugin-devtools": "^3.0.3"
    },
    "devDependencies": {
        "vitest": "^3.1.1"
    }
}
```

- [ ] **Step 3: Update pluginConfig.ts**

Replace `src/pluginConfig.ts` with:

```typescript
import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-sail-router',
    version: '0.1.0',
    icon: '⛵',
    title: 'Sail Router',
    description:
        'Weather routing for sailing with multi-model comparison. ' +
        'Computes optimal routes using boat polars, wind forecasts, ' +
        'ocean currents, and land avoidance.',
    author: 'Brodie (appd.com.au)',
    repository: '',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/sail-router/:lat?/:lon?',
    listenToSingleclick: true,
    private: true,
};

export default config;
```

- [ ] **Step 4: Write minimal plugin.svelte placeholder**

Replace `src/plugin.svelte` with:

```svelte
<div class="plugin__mobile-header">
    {title}
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={() => bcast.emit('rqstOpen', 'menu')}
    >
        {title}
    </div>
    <p>Sail Router loading...</p>
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';

    const { title } = config;

    export const onopen = (_params: unknown) => {};

    onMount(() => {});

    onDestroy(() => {});
</script>

<style lang="less">
</style>
```

- [ ] **Step 5: Add vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@windy/interfaces': './tests/__mocks__/windy.ts',
        },
    },
});
```

Create `tests/__mocks__/windy.ts` (empty mock for Windy types):

```typescript
// Mock for @windy/* imports used in tests
export interface LatLon {
    lat: number;
    lon: number;
}
```

- [ ] **Step 6: Create source directories**

```bash
mkdir -p src/routing src/worker src/adapters src/map src/ui src/data/polars tests/routing tests/__mocks__
```

- [ ] **Step 7: Install dependencies and verify build**

```bash
npm install
npm run build
```

Expected: Build succeeds, `dist/plugin.js` and `dist/plugin.min.js` are created.

- [ ] **Step 8: Verify tests run**

Create a trivial test file `tests/routing/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
    it('runs', () => {
        expect(1 + 1).toBe(2);
    });
});
```

```bash
npm test
```

Expected: 1 test passes.

- [ ] **Step 9: Initialize git repo and commit**

```bash
git init
git add -A
git commit -m "feat: scaffold Windy Sail Router plugin from template"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/routing/types.ts`
- Create: `src/worker/messages.ts`

- [ ] **Step 1: Create routing types**

Create `src/routing/types.ts`:

```typescript
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
```

- [ ] **Step 2: Create worker message types**

Create `src/worker/messages.ts`:

```typescript
import type {
    LatLon,
    PolarData,
    RoutingOptions,
    RouteResult,
    WindGridData,
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
```

- [ ] **Step 3: Commit**

```bash
git add src/routing/types.ts src/worker/messages.ts
git commit -m "feat: add shared routing types and worker message definitions"
```

---

### Task 3: Geodesic Math (TDD)

**Files:**
- Create: `src/routing/geo.ts`
- Create: `tests/routing/geo.test.ts`

- [ ] **Step 1: Write failing tests for geo functions**

Create `tests/routing/geo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    normaliseAngle,
    toRadians,
    toDegrees,
    distance,
    bearing,
    advancePosition,
    computeTWA,
} from '../../src/routing/geo';

describe('normaliseAngle', () => {
    it('returns angle unchanged when 0-360', () => {
        expect(normaliseAngle(180)).toBe(180);
        expect(normaliseAngle(0)).toBe(0);
        expect(normaliseAngle(359.9)).toBeCloseTo(359.9);
    });

    it('wraps negative angles', () => {
        expect(normaliseAngle(-10)).toBeCloseTo(350);
        expect(normaliseAngle(-180)).toBeCloseTo(180);
        expect(normaliseAngle(-360)).toBeCloseTo(0);
    });

    it('wraps angles above 360', () => {
        expect(normaliseAngle(370)).toBeCloseTo(10);
        expect(normaliseAngle(720)).toBeCloseTo(0);
    });
});

describe('toRadians / toDegrees', () => {
    it('converts degrees to radians', () => {
        expect(toRadians(180)).toBeCloseTo(Math.PI);
        expect(toRadians(90)).toBeCloseTo(Math.PI / 2);
        expect(toRadians(0)).toBe(0);
    });

    it('converts radians to degrees', () => {
        expect(toDegrees(Math.PI)).toBeCloseTo(180);
        expect(toDegrees(Math.PI / 2)).toBeCloseTo(90);
    });

    it('round-trips', () => {
        expect(toDegrees(toRadians(123.456))).toBeCloseTo(123.456);
    });
});

describe('distance', () => {
    it('computes distance between Sydney and Mooloolaba (~430nm)', () => {
        const sydney = { lat: -33.626, lon: 151.31 };
        const mooloolaba = { lat: -26.68, lon: 153.13 };
        const d = distance(sydney, mooloolaba);
        // ~430 nm, allow 5% tolerance
        expect(d).toBeGreaterThan(408);
        expect(d).toBeLessThan(452);
    });

    it('returns 0 for same point', () => {
        const p = { lat: -33.626, lon: 151.31 };
        expect(distance(p, p)).toBeCloseTo(0, 1);
    });

    it('computes short coastal distance (~10nm)', () => {
        // Roughly 10nm apart along NSW coast
        const a = { lat: -33.85, lon: 151.27 };
        const b = { lat: -33.7, lon: 151.3 };
        const d = distance(a, b);
        expect(d).toBeGreaterThan(8);
        expect(d).toBeLessThan(12);
    });
});

describe('bearing', () => {
    it('computes bearing due north', () => {
        const from = { lat: -34.0, lon: 151.0 };
        const to = { lat: -33.0, lon: 151.0 };
        const b = bearing(from, to);
        expect(b).toBeCloseTo(0, 0);
    });

    it('computes bearing due east', () => {
        const from = { lat: 0, lon: 0 };
        const to = { lat: 0, lon: 1 };
        const b = bearing(from, to);
        expect(b).toBeCloseTo(90, 0);
    });

    it('computes bearing due south', () => {
        const from = { lat: -33.0, lon: 151.0 };
        const to = { lat: -34.0, lon: 151.0 };
        const b = bearing(from, to);
        expect(b).toBeCloseTo(180, 0);
    });

    it('computes bearing due west', () => {
        const from = { lat: 0, lon: 1 };
        const to = { lat: 0, lon: 0 };
        const b = bearing(from, to);
        expect(b).toBeCloseTo(270, 0);
    });
});

describe('advancePosition', () => {
    it('advances north by 60nm equals ~1 degree lat', () => {
        const start = { lat: -34.0, lon: 151.0 };
        const result = advancePosition(start.lat, start.lon, 0, 60);
        expect(result.lat).toBeCloseTo(-33.0, 0);
        expect(result.lon).toBeCloseTo(151.0, 0);
    });

    it('advances east along equator by 60nm equals ~1 degree lon', () => {
        const result = advancePosition(0, 100, 90, 60);
        expect(result.lat).toBeCloseTo(0, 0);
        expect(result.lon).toBeCloseTo(101, 0);
    });

    it('returns same point for 0 distance', () => {
        const result = advancePosition(-33.5, 151.2, 45, 0);
        expect(result.lat).toBeCloseTo(-33.5);
        expect(result.lon).toBeCloseTo(151.2);
    });
});

describe('computeTWA', () => {
    it('head-to-wind is 0', () => {
        // Wind from 180, heading 180 (sailing into the wind)
        expect(computeTWA(180, 180)).toBeCloseTo(0);
    });

    it('running downwind is 180', () => {
        // Wind from 0 (north), heading 180 (south) = running
        expect(computeTWA(180, 0)).toBeCloseTo(180);
    });

    it('beam reach is 90', () => {
        // Wind from 270 (west), heading 0 (north) = 90 degree angle
        expect(computeTWA(0, 270)).toBeCloseTo(90);
    });

    it('is always 0-180 regardless of tack', () => {
        // Same angle from both sides should give same TWA
        const twa1 = computeTWA(90, 0); // Wind from N, heading E
        const twa2 = computeTWA(270, 0); // Wind from N, heading W
        expect(twa1).toBeCloseTo(twa2);
    });

    it('close hauled ~45 degrees', () => {
        // Wind from 0, heading 45
        expect(computeTWA(45, 0)).toBeCloseTo(45);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: All tests fail — module `../../src/routing/geo` not found.

- [ ] **Step 3: Implement geo.ts**

Create `src/routing/geo.ts`:

```typescript
import type { LatLon } from './types';

const EARTH_RADIUS_NM = 3440.065; // Earth radius in nautical miles

export function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
}

export function toDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
}

export function normaliseAngle(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/**
 * Great circle distance between two points in nautical miles.
 * Uses the Haversine formula.
 */
export function distance(from: LatLon, to: LatLon): number {
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const dLat = toRadians(to.lat - from.lat);
    const dLon = toRadians(to.lon - from.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return EARTH_RADIUS_NM * c;
}

/**
 * Initial bearing from `from` to `to` in degrees (0-360).
 */
export function bearing(from: LatLon, to: LatLon): number {
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const dLon = toRadians(to.lon - from.lon);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    return normaliseAngle(toDegrees(Math.atan2(y, x)));
}

/**
 * Advance a position by a given heading and distance.
 * Returns the new lat/lon.
 */
export function advancePosition(
    lat: number,
    lon: number,
    headingDeg: number,
    distanceNm: number,
): LatLon {
    const lat1 = toRadians(lat);
    const lon1 = toRadians(lon);
    const brng = toRadians(headingDeg);
    const d = distanceNm / EARTH_RADIUS_NM;

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
    );

    const lon2 =
        lon1 +
        Math.atan2(
            Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
            Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
        );

    return {
        lat: toDegrees(lat2),
        lon: toDegrees(lon2),
    };
}

/**
 * Compute True Wind Angle (0-180) given boat heading and wind direction.
 * Both in degrees. Wind direction is where the wind comes FROM.
 */
export function computeTWA(boatHeading: number, windDirection: number): number {
    const diff = Math.abs(normaliseAngle(boatHeading) - normaliseAngle(windDirection));
    return diff > 180 ? 360 - diff : diff;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All geo tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routing/geo.ts tests/routing/geo.test.ts
git commit -m "feat: add geodesic math utilities with tests"
```

---

### Task 4: Polar Interpolation (TDD)

**Files:**
- Create: `src/routing/Polar.ts`
- Create: `src/data/polars/bavaria38.json`
- Create: `tests/routing/Polar.test.ts`

- [ ] **Step 1: Create Bavaria 38 polar data**

Create `src/data/polars/bavaria38.json`:

```json
{
    "name": "Bavaria 38",
    "twaAngles": [0, 30, 40, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180],
    "twsSpeeds": [4, 6, 8, 10, 12, 14, 16, 20, 25],
    "speeds": [
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [1.5, 2.8, 3.5, 4.0, 4.3, 4.5, 4.6, 4.6, 4.5],
        [2.5, 3.8, 4.8, 5.3, 5.6, 5.8, 5.9, 5.9, 5.8],
        [3.2, 4.5, 5.5, 6.2, 6.6, 6.8, 7.0, 7.0, 6.9],
        [3.5, 4.8, 5.8, 6.5, 7.0, 7.2, 7.4, 7.4, 7.3],
        [3.8, 5.2, 6.2, 6.8, 7.3, 7.5, 7.7, 7.8, 7.7],
        [3.9, 5.3, 6.3, 7.0, 7.5, 7.8, 8.0, 8.2, 8.1],
        [3.8, 5.2, 6.2, 6.9, 7.4, 7.7, 8.0, 8.5, 8.6],
        [3.6, 5.0, 6.0, 6.7, 7.2, 7.5, 7.8, 8.3, 8.5],
        [3.2, 4.5, 5.5, 6.2, 6.7, 7.0, 7.3, 7.8, 8.0],
        [2.6, 3.8, 4.8, 5.5, 6.0, 6.3, 6.5, 7.0, 7.2],
        [2.0, 3.2, 4.2, 4.8, 5.3, 5.6, 5.8, 6.3, 6.5],
        [1.5, 2.5, 3.5, 4.2, 4.6, 4.9, 5.1, 5.5, 5.7]
    ]
}
```

- [ ] **Step 2: Write failing tests for Polar**

Create `tests/routing/Polar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getSpeed } from '../../src/routing/Polar';
import type { PolarData } from '../../src/routing/types';

const polar: PolarData = {
    name: 'Test Polar',
    twaAngles: [0, 30, 40, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180],
    twsSpeeds: [4, 6, 8, 10, 12, 14, 16, 20, 25],
    speeds: [
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [1.5, 2.8, 3.5, 4.0, 4.3, 4.5, 4.6, 4.6, 4.5],
        [2.5, 3.8, 4.8, 5.3, 5.6, 5.8, 5.9, 5.9, 5.8],
        [3.2, 4.5, 5.5, 6.2, 6.6, 6.8, 7.0, 7.0, 6.9],
        [3.5, 4.8, 5.8, 6.5, 7.0, 7.2, 7.4, 7.4, 7.3],
        [3.8, 5.2, 6.2, 6.8, 7.3, 7.5, 7.7, 7.8, 7.7],
        [3.9, 5.3, 6.3, 7.0, 7.5, 7.8, 8.0, 8.2, 8.1],
        [3.8, 5.2, 6.2, 6.9, 7.4, 7.7, 8.0, 8.5, 8.6],
        [3.6, 5.0, 6.0, 6.7, 7.2, 7.5, 7.8, 8.3, 8.5],
        [3.2, 4.5, 5.5, 6.2, 6.7, 7.0, 7.3, 7.8, 8.0],
        [2.6, 3.8, 4.8, 5.5, 6.0, 6.3, 6.5, 7.0, 7.2],
        [2.0, 3.2, 4.2, 4.8, 5.3, 5.6, 5.8, 6.3, 6.5],
        [1.5, 2.5, 3.5, 4.2, 4.6, 4.9, 5.1, 5.5, 5.7],
    ],
};

describe('getSpeed', () => {
    it('returns exact value at grid point', () => {
        // TWA=90, TWS=10 -> speeds[6][3] = 7.0
        expect(getSpeed(polar, 90, 10)).toBeCloseTo(7.0);
    });

    it('returns 0 at TWA=0 (head to wind)', () => {
        expect(getSpeed(polar, 0, 10)).toBe(0);
    });

    it('interpolates between TWS grid points', () => {
        // TWA=90, TWS=9 -> between TWS=8 (6.3) and TWS=10 (7.0)
        // Linear interp: 6.3 + 0.5 * (7.0 - 6.3) = 6.65
        expect(getSpeed(polar, 90, 9)).toBeCloseTo(6.65);
    });

    it('interpolates between TWA grid points', () => {
        // TWA=85, TWS=10 -> between TWA=75 (6.8) and TWA=90 (7.0)
        // 85 is 10/15 = 0.667 between 75 and 90
        // 6.8 + 0.667 * (7.0 - 6.8) = 6.933
        expect(getSpeed(polar, 85, 10)).toBeCloseTo(6.933, 1);
    });

    it('bilinear interpolation between both dimensions', () => {
        // TWA=85, TWS=9 -> four corners:
        // (75,8)=6.2, (75,10)=6.8, (90,8)=6.3, (90,10)=7.0
        const result = getSpeed(polar, 85, 9);
        // Should be between 6.2 and 7.0
        expect(result).toBeGreaterThan(6.2);
        expect(result).toBeLessThan(7.0);
    });

    it('handles symmetric TWA (e.g. 270 = 90)', () => {
        expect(getSpeed(polar, 270, 10)).toBeCloseTo(getSpeed(polar, 90, 10));
    });

    it('handles TWA > 180 via symmetry', () => {
        expect(getSpeed(polar, 200, 10)).toBeCloseTo(getSpeed(polar, 160, 10));
    });

    it('returns 0 for TWS=0', () => {
        expect(getSpeed(polar, 90, 0)).toBe(0);
    });

    it('clamps TWS below minimum to lowest grid speed', () => {
        // TWS=2 is below min grid TWS=4, should extrapolate or return low value
        const result = getSpeed(polar, 90, 2);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(getSpeed(polar, 90, 4));
    });

    it('clamps TWS above maximum to highest grid speed', () => {
        // TWS=30 is above max grid TWS=25
        expect(getSpeed(polar, 90, 30)).toBeCloseTo(getSpeed(polar, 90, 25));
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: All Polar tests fail — module not found.

- [ ] **Step 4: Implement Polar.ts**

Create `src/routing/Polar.ts`:

```typescript
import type { PolarData } from './types';

/**
 * Get boat speed in knots for a given TWA and TWS using bilinear interpolation.
 * TWA is normalised to 0-180 (symmetric). TWS clamped to polar grid range.
 */
export function getSpeed(polar: PolarData, twa: number, tws: number): number {
    if (tws <= 0) {
        return 0;
    }

    // Normalise TWA to 0-180 (polar is symmetric)
    twa = Math.abs(((twa % 360) + 360) % 360);
    if (twa > 180) {
        twa = 360 - twa;
    }

    const { twaAngles, twsSpeeds, speeds } = polar;

    // Find bracketing TWA indices
    const { lo: twaLo, hi: twaHi, frac: twaFrac } = findBracket(twaAngles, twa);

    // Find bracketing TWS indices
    const { lo: twsLo, hi: twsHi, frac: twsFrac } = findBracket(twsSpeeds, tws);

    // Bilinear interpolation
    const s00 = speeds[twaLo][twsLo];
    const s01 = speeds[twaLo][twsHi];
    const s10 = speeds[twaHi][twsLo];
    const s11 = speeds[twaHi][twsHi];

    const s0 = s00 + twsFrac * (s01 - s00);
    const s1 = s10 + twsFrac * (s11 - s10);

    return s0 + twaFrac * (s1 - s0);
}

/**
 * Find the bracketing indices and interpolation fraction for a value in a sorted array.
 * Clamps to array bounds.
 */
function findBracket(
    arr: number[],
    value: number,
): { lo: number; hi: number; frac: number } {
    if (value <= arr[0]) {
        return { lo: 0, hi: 0, frac: 0 };
    }
    if (value >= arr[arr.length - 1]) {
        return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
    }

    for (let i = 0; i < arr.length - 1; i++) {
        if (value >= arr[i] && value <= arr[i + 1]) {
            const frac = (value - arr[i]) / (arr[i + 1] - arr[i]);
            return { lo: i, hi: i + 1, frac };
        }
    }

    // Fallback (shouldn't reach here)
    return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test
```

Expected: All Polar tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/routing/Polar.ts src/data/polars/bavaria38.json tests/routing/Polar.test.ts
git commit -m "feat: add polar interpolation and Bavaria 38 polar data"
```

---

### Task 5: Wind Grid Interpolation (TDD)

**Files:**
- Create: `src/routing/WindGrid.ts`
- Create: `tests/routing/WindGrid.test.ts`

- [ ] **Step 1: Write failing tests for WindGrid**

Create `tests/routing/WindGrid.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getWindAt, msToKnots, windComponentsToSpeedDir } from '../../src/routing/WindGrid';
import type { WindGridData } from '../../src/routing/types';

// Simple 2x2 grid, 2 timestamps
const grid: WindGridData = {
    lats: [-34, -33],
    lons: [151, 152],
    timestamps: [1000, 2000], // ms
    // windU[latIdx][lonIdx][timeIdx] — m/s
    // Positive u = eastward, positive v = northward
    windU: [
        [
            [5, 10],  // lat=-34, lon=151
            [5, 10],  // lat=-34, lon=152
        ],
        [
            [5, 10],  // lat=-33, lon=151
            [5, 10],  // lat=-33, lon=152
        ],
    ],
    windV: [
        [
            [0, 0],
            [0, 0],
        ],
        [
            [0, 0],
            [0, 0],
        ],
    ],
};

describe('msToKnots', () => {
    it('converts m/s to knots', () => {
        expect(msToKnots(1)).toBeCloseTo(1.94384);
        expect(msToKnots(10)).toBeCloseTo(19.4384);
        expect(msToKnots(0)).toBe(0);
    });
});

describe('windComponentsToSpeedDir', () => {
    it('pure east wind (u=10, v=0) comes from 270', () => {
        const result = windComponentsToSpeedDir(10, 0);
        expect(result.speed).toBeCloseTo(msToKnots(10));
        expect(result.direction).toBeCloseTo(270);
    });

    it('pure north wind (u=0, v=10) comes from 180', () => {
        const result = windComponentsToSpeedDir(0, 10);
        expect(result.speed).toBeCloseTo(msToKnots(10));
        expect(result.direction).toBeCloseTo(180);
    });

    it('pure south wind (u=0, v=-10) comes from 0 (north)', () => {
        const result = windComponentsToSpeedDir(0, -10);
        expect(result.speed).toBeCloseTo(msToKnots(10));
        expect(result.direction).toBeCloseTo(0);
    });

    it('calm wind', () => {
        const result = windComponentsToSpeedDir(0, 0);
        expect(result.speed).toBe(0);
    });
});

describe('getWindAt', () => {
    it('returns exact value at grid point and time', () => {
        const result = getWindAt(grid, 1000, -34, 151);
        expect(result.speed).toBeCloseTo(msToKnots(5));
        // u=5, v=0 means wind blowing east → wind FROM west = 270
        expect(result.direction).toBeCloseTo(270);
    });

    it('interpolates between timestamps', () => {
        const result = getWindAt(grid, 1500, -34, 151);
        // Midpoint between u=5 and u=10 → u=7.5, v=0
        expect(result.speed).toBeCloseTo(msToKnots(7.5));
    });

    it('interpolates spatially between grid points', () => {
        // All grid points have same wind, so interpolation should give same result
        const result = getWindAt(grid, 1000, -33.5, 151.5);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });

    it('clamps to nearest grid point when outside bounds', () => {
        // lat=-35 is below grid min of -34
        const result = getWindAt(grid, 1000, -35, 151);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });

    it('clamps time to bounds', () => {
        // time=500 is before first timestamp
        const result = getWindAt(grid, 500, -34, 151);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });
});

describe('getWindAt with varying spatial data', () => {
    const spatialGrid: WindGridData = {
        lats: [0, 1],
        lons: [0, 1],
        timestamps: [0],
        windU: [
            [[0], [10]],  // lat=0: lon=0→u=0, lon=1→u=10
            [[0], [10]],  // lat=1: lon=0→u=0, lon=1→u=10
        ],
        windV: [
            [[0], [0]],
            [[0], [0]],
        ],
    };

    it('interpolates u component spatially', () => {
        // At lon=0.5, u should be 5 (midpoint)
        const result = getWindAt(spatialGrid, 0, 0, 0.5);
        expect(result.speed).toBeCloseTo(msToKnots(5));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: All WindGrid tests fail — module not found.

- [ ] **Step 3: Implement WindGrid.ts**

Create `src/routing/WindGrid.ts`:

```typescript
import type { WindGridData, WindVector } from './types';

const MS_TO_KNOTS = 1.94384;

export function msToKnots(ms: number): number {
    return ms * MS_TO_KNOTS;
}

/**
 * Convert u,v wind components (m/s) to speed (knots) and meteorological direction
 * (degrees, where wind comes FROM).
 */
export function windComponentsToSpeedDir(u: number, v: number): WindVector {
    const speedMs = Math.sqrt(u * u + v * v);
    if (speedMs === 0) {
        return { speed: 0, direction: 0 };
    }
    // Meteorological direction: where wind comes FROM
    // u = east component, v = north component of where wind GOES
    // "FROM" direction = atan2(-u, -v) converted to degrees
    const mathAngle = Math.atan2(-u, -v);
    const degrees = ((mathAngle * 180) / Math.PI + 360) % 360;
    return { speed: msToKnots(speedMs), direction: degrees };
}

/**
 * Get interpolated wind at a given time, lat, lon from the pre-fetched grid.
 * Uses bilinear spatial interpolation and linear temporal interpolation.
 */
export function getWindAt(
    grid: WindGridData,
    time: number,
    lat: number,
    lon: number,
): WindVector {
    const { lats, lons, timestamps, windU, windV } = grid;

    // Find bracketing indices
    const latB = findBracket(lats, lat);
    const lonB = findBracket(lons, lon);
    const timeB = findBracket(timestamps, time);

    // Interpolate u and v separately
    const u = trilinearInterp(windU, latB, lonB, timeB);
    const v = trilinearInterp(windV, latB, lonB, timeB);

    return windComponentsToSpeedDir(u, v);
}

interface Bracket {
    lo: number;
    hi: number;
    frac: number;
}

function findBracket(arr: number[], value: number): Bracket {
    if (arr.length === 1 || value <= arr[0]) {
        return { lo: 0, hi: 0, frac: 0 };
    }
    if (value >= arr[arr.length - 1]) {
        return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
    }
    for (let i = 0; i < arr.length - 1; i++) {
        if (value >= arr[i] && value <= arr[i + 1]) {
            const frac = (value - arr[i]) / (arr[i + 1] - arr[i]);
            return { lo: i, hi: i + 1, frac };
        }
    }
    return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
}

/**
 * Trilinear interpolation: spatial (lat, lon) + temporal.
 * data[latIdx][lonIdx][timeIdx]
 */
function trilinearInterp(
    data: number[][][],
    latB: Bracket,
    lonB: Bracket,
    timeB: Bracket,
): number {
    // Interpolate along time axis for all 4 spatial corners
    const v00 = lerp(data[latB.lo][lonB.lo][timeB.lo], data[latB.lo][lonB.lo][timeB.hi], timeB.frac);
    const v01 = lerp(data[latB.lo][lonB.hi][timeB.lo], data[latB.lo][lonB.hi][timeB.hi], timeB.frac);
    const v10 = lerp(data[latB.hi][lonB.lo][timeB.lo], data[latB.hi][lonB.lo][timeB.hi], timeB.frac);
    const v11 = lerp(data[latB.hi][lonB.hi][timeB.lo], data[latB.hi][lonB.hi][timeB.hi], timeB.frac);

    // Bilinear spatial interpolation
    const v0 = lerp(v00, v01, lonB.frac);
    const v1 = lerp(v10, v11, lonB.frac);
    return lerp(v0, v1, latB.frac);
}

function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All WindGrid tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routing/WindGrid.ts tests/routing/WindGrid.test.ts
git commit -m "feat: add wind grid spatial/temporal interpolation"
```

---

### Task 6: Isochrone Router (TDD)

**Files:**
- Create: `src/routing/IsochroneRouter.ts`
- Create: `tests/routing/IsochroneRouter.test.ts`

- [ ] **Step 1: Write failing tests for the isochrone router**

Create `tests/routing/IsochroneRouter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
    expandFrontier,
    pruneToSectors,
    traceRoute,
} from '../../src/routing/IsochroneRouter';
import type {
    IsochronePoint,
    LatLon,
    PolarData,
    RoutingOptions,
    WindGridData,
    DEFAULT_OPTIONS,
} from '../../src/routing/types';

// Minimal polar: 7kt at all angles except head-to-wind
const simplePolar: PolarData = {
    name: 'Test',
    twaAngles: [0, 45, 90, 135, 180],
    twsSpeeds: [10],
    speeds: [[0], [5], [7], [6], [4]],
};

// Uniform 10m/s southerly wind (from 180°) across a 4x4 grid, single timestamp
function makeUniformWindGrid(): WindGridData {
    const lats = [-36, -35, -34, -33];
    const lons = [150, 151, 152, 153];
    const timestamps = [0];
    // Wind FROM south (180°): blows northward, so u=0, v=+10
    // windComponentsToSpeedDir(0, 10) uses atan2(-0, -10) = PI → 180°. Correct.
    const windU: number[][][] = lats.map(() => lons.map(() => [0]));
    const windV: number[][][] = lats.map(() => lons.map(() => [10]));

    return { lats, lons, timestamps, windU, windV };
}

describe('expandFrontier', () => {
    it('generates candidate points in all headings', () => {
        const start: IsochronePoint = {
            lat: -34,
            lon: 151,
            parent: null,
            twa: 0,
            tws: 0,
            twd: 0,
            boatSpeed: 0,
            heading: 0,
            time: 0,
        };

        const windGrid = makeUniformWindGrid();
        const options: RoutingOptions = {
            startTime: 0,
            timeStep: 1,
            maxDuration: 168,
            headingStep: 5,
            numSectors: 72,
            arrivalRadius: 1.0,
        };

        const candidates = expandFrontier(
            [start],
            windGrid,
            simplePolar,
            options.timeStep,
            0, // parentIsoIndex
        );

        // 72 headings * 1 point = 72 candidates (minus head-to-wind which gives 0 speed)
        // Some may have 0 speed (TWA near 0), but all 72 should be generated
        expect(candidates.length).toBe(72);
    });

    it('candidates with head-to-wind TWA have 0 boat speed', () => {
        const start: IsochronePoint = {
            lat: -34,
            lon: 151,
            parent: null,
            twa: 0,
            tws: 0,
            twd: 0,
            boatSpeed: 0,
            heading: 0,
            time: 0,
        };

        const windGrid = makeUniformWindGrid();
        const candidates = expandFrontier(
            [start],
            windGrid,
            simplePolar,
            1,
            0,
        );

        // Wind from 180°. Heading 180° = sailing into wind = TWA 0 = speed 0
        const headToWind = candidates.find(c => c.heading === 180);
        expect(headToWind).toBeDefined();
        expect(headToWind!.boatSpeed).toBe(0);
    });
});

describe('pruneToSectors', () => {
    it('keeps one point per sector', () => {
        const start: LatLon = { lat: -34, lon: 151 };
        const end: LatLon = { lat: -33, lon: 152 };

        // Create 10 points, all in roughly the same sector
        const points: IsochronePoint[] = Array.from({ length: 10 }, (_, i) => ({
            lat: -33.9 + i * 0.001,
            lon: 151.1,
            parent: 0,
            twa: 90,
            tws: 10,
            twd: 180,
            boatSpeed: 7,
            heading: 45,
            time: 3600000,
        }));

        const pruned = pruneToSectors(points, start, end, 72);
        // All points are in the same sector, so only 1 should remain
        expect(pruned.length).toBe(1);
        // The one kept should be the furthest from start
        expect(pruned[0].lat).toBeCloseTo(-33.891);
    });

    it('keeps points from different sectors', () => {
        const start: LatLon = { lat: 0, lon: 0 };
        const end: LatLon = { lat: 1, lon: 0 };

        // Two points in clearly different sectors (opposite sides)
        const points: IsochronePoint[] = [
            {
                lat: 0.1,
                lon: 0.5,
                parent: 0,
                twa: 90,
                tws: 10,
                twd: 180,
                boatSpeed: 7,
                heading: 90,
                time: 3600000,
            },
            {
                lat: 0.1,
                lon: -0.5,
                parent: 0,
                twa: 90,
                tws: 10,
                twd: 180,
                boatSpeed: 7,
                heading: 270,
                time: 3600000,
            },
        ];

        const pruned = pruneToSectors(points, start, end, 72);
        expect(pruned.length).toBe(2);
    });
});

describe('traceRoute', () => {
    it('traces back from final point through isochrones', () => {
        // 3 isochrones, each with one point
        const isochrones: IsochronePoint[][] = [
            [
                {
                    lat: -34,
                    lon: 151,
                    parent: null,
                    twa: 0,
                    tws: 0,
                    twd: 0,
                    boatSpeed: 0,
                    heading: 0,
                    time: 0,
                },
            ],
            [
                {
                    lat: -33.5,
                    lon: 151.5,
                    parent: 0,
                    twa: 45,
                    tws: 15,
                    twd: 180,
                    boatSpeed: 6,
                    heading: 135,
                    time: 3600000,
                },
            ],
            [
                {
                    lat: -33.0,
                    lon: 152.0,
                    parent: 0,
                    twa: 90,
                    tws: 12,
                    twd: 180,
                    boatSpeed: 7,
                    heading: 90,
                    time: 7200000,
                },
            ],
        ];

        const route = traceRoute(isochrones, 0); // final point index 0
        expect(route.length).toBe(3);
        expect(route[0].lat).toBeCloseTo(-34);
        expect(route[1].lat).toBeCloseTo(-33.5);
        expect(route[2].lat).toBeCloseTo(-33);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: All IsochroneRouter tests fail.

- [ ] **Step 3: Implement IsochroneRouter.ts**

Create `src/routing/IsochroneRouter.ts`:

```typescript
import type {
    IsochronePoint,
    LatLon,
    PolarData,
    RoutePoint,
    WindGridData,
} from './types';
import { advancePosition, bearing, computeTWA, distance, normaliseAngle } from './geo';
import { getWindAt } from './WindGrid';
import { getSpeed } from './Polar';

/**
 * Expand every frontier point across all headings, returning candidate next-points.
 * Does NOT filter for land — caller handles that.
 */
export function expandFrontier(
    frontier: IsochronePoint[],
    windGrid: WindGridData,
    polar: PolarData,
    timeStepHours: number,
    parentIsoIndex: number,
): IsochronePoint[] {
    const candidates: IsochronePoint[] = [];
    const headingStep = 5;
    const numHeadings = 360 / headingStep;
    const dtMs = timeStepHours * 3600000;

    for (let fi = 0; fi < frontier.length; fi++) {
        const point = frontier[fi];
        const nextTime = point.time + dtMs;

        // Get wind at this point's position and the NEXT time step
        const wind = getWindAt(windGrid, nextTime, point.lat, point.lon);

        for (let hi = 0; hi < numHeadings; hi++) {
            const hdg = hi * headingStep;
            const twa = computeTWA(hdg, wind.direction);
            const boatSpeed = getSpeed(polar, twa, wind.speed);

            // Distance covered in this time step (nm)
            const distNm = boatSpeed * timeStepHours;

            if (distNm <= 0) {
                // Still add the candidate but at same position (drifting/becalmed)
                candidates.push({
                    lat: point.lat,
                    lon: point.lon,
                    parent: fi,
                    twa,
                    tws: wind.speed,
                    twd: wind.direction,
                    boatSpeed,
                    heading: hdg,
                    time: nextTime,
                });
                continue;
            }

            const newPos = advancePosition(point.lat, point.lon, hdg, distNm);

            candidates.push({
                lat: newPos.lat,
                lon: newPos.lon,
                parent: fi,
                twa,
                tws: wind.speed,
                twd: wind.direction,
                boatSpeed,
                heading: hdg,
                time: nextTime,
            });
        }
    }

    return candidates;
}

/**
 * Prune candidates to keep only the furthest point per angular sector.
 * Sectors are measured from `start` relative to the bearing toward `end`.
 */
export function pruneToSectors(
    candidates: IsochronePoint[],
    start: LatLon,
    end: LatLon,
    numSectors: number,
): IsochronePoint[] {
    const sectorSize = 360 / numSectors;
    const refBearing = bearing(start, end);

    // For each sector, keep the point furthest from start
    const sectors: (IsochronePoint | null)[] = new Array(numSectors).fill(null);
    const sectorDistances: number[] = new Array(numSectors).fill(0);

    for (const candidate of candidates) {
        const candidateBearing = bearing(start, candidate);
        const relativeAngle = normaliseAngle(candidateBearing - refBearing);
        const sectorIndex = Math.floor(relativeAngle / sectorSize) % numSectors;

        const dist = distance(start, candidate);

        if (sectors[sectorIndex] === null || dist > sectorDistances[sectorIndex]) {
            sectors[sectorIndex] = candidate;
            sectorDistances[sectorIndex] = dist;
        }
    }

    return sectors.filter((s): s is IsochronePoint => s !== null);
}

/**
 * Trace the optimal route backwards through the isochrone history.
 * Returns an array of RoutePoints from start to the final point.
 */
export function traceRoute(
    isochrones: IsochronePoint[][],
    finalPointIndex: number,
): RoutePoint[] {
    const path: RoutePoint[] = [];
    let isoIdx = isochrones.length - 1;
    let pointIdx = finalPointIndex;

    while (isoIdx >= 0) {
        const point = isochrones[isoIdx][pointIdx];
        path.unshift({
            lat: point.lat,
            lon: point.lon,
            time: point.time,
            twa: point.twa,
            tws: point.tws,
            twd: point.twd,
            boatSpeed: point.boatSpeed,
            heading: point.heading,
        });

        if (point.parent === null) {
            break;
        }
        pointIdx = point.parent;
        isoIdx--;
    }

    return path;
}

/**
 * Check if any candidate point has reached the destination.
 * Returns the index of the first arriving point, or -1.
 */
export function checkArrival(
    candidates: IsochronePoint[],
    destination: LatLon,
    arrivalRadius: number,
): number {
    for (let i = 0; i < candidates.length; i++) {
        if (distance(candidates[i], destination) <= arrivalRadius) {
            return i;
        }
    }
    return -1;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All IsochroneRouter tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/routing/IsochroneRouter.ts tests/routing/IsochroneRouter.test.ts
git commit -m "feat: add isochrone router with expand, prune, trace, and arrival"
```

---

### Task 7: Web Worker Entry Point

**Files:**
- Create: `src/worker/router.worker.ts`

- [ ] **Step 1: Implement router.worker.ts**

Create `src/worker/router.worker.ts`:

```typescript
import type {
    IsochronePoint,
    RoutingOptions,
    PolarData,
    WindGridData,
    LatLon,
    RouteResult,
} from '../routing/types';
import type { MainToWorkerMessage, WorkerToMainMessage } from './messages';
import { expandFrontier, pruneToSectors, traceRoute, checkArrival } from '../routing/IsochroneRouter';
import { distance } from '../routing/geo';

let landCheckResolve: ((results: { pointResults: boolean[]; segmentResults: boolean[] }) => void) | null = null;

self.onmessage = (e: MessageEvent<MainToWorkerMessage>) => {
    const msg = e.data;

    if (msg.type === 'START_ROUTING') {
        runRouting(msg.payload).catch(err => {
            postMsg({ type: 'ROUTE_FAILED', payload: { reason: String(err) } });
        });
    } else if (msg.type === 'LAND_RESULTS') {
        if (landCheckResolve) {
            landCheckResolve(msg.payload);
            landCheckResolve = null;
        }
    }
};

function postMsg(msg: WorkerToMainMessage): void {
    (self as unknown as Worker).postMessage(msg);
}

async function requestLandCheck(
    points: [number, number][],
    segments: [number, number, number, number][],
): Promise<{ pointResults: boolean[]; segmentResults: boolean[] }> {
    return new Promise(resolve => {
        landCheckResolve = resolve;
        postMsg({ type: 'CHECK_LAND', payload: { points, segments } });
    });
}

async function runRouting(payload: {
    windGrid: WindGridData;
    polar: PolarData;
    start: LatLon;
    end: LatLon;
    options: RoutingOptions;
}): Promise<void> {
    const { windGrid, polar, start, end, options } = payload;
    const { timeStep, maxDuration, numSectors, arrivalRadius } = options;
    const maxSteps = Math.floor(maxDuration / timeStep);

    const startPoint: IsochronePoint = {
        lat: start.lat,
        lon: start.lon,
        parent: null,
        twa: 0,
        tws: 0,
        twd: 0,
        boatSpeed: 0,
        heading: 0,
        time: options.startTime,
    };

    const isochrones: IsochronePoint[][] = [[startPoint]];
    let frontier: IsochronePoint[] = [startPoint];

    for (let step = 0; step < maxSteps; step++) {
        // Expand frontier
        const candidates = expandFrontier(frontier, windGrid, polar, timeStep, step);

        // Filter out zero-speed candidates (becalmed at same position)
        const movingCandidates = candidates.filter(c => c.boatSpeed > 0);

        if (movingCandidates.length === 0) {
            postMsg({
                type: 'ROUTE_FAILED',
                payload: { reason: 'All candidates becalmed. No route possible.' },
            });
            return;
        }

        // Prepare land check requests
        const points: [number, number][] = movingCandidates.map(c => [c.lat, c.lon]);
        const segments: [number, number, number, number][] = movingCandidates.map(c => {
            const parent = frontier[c.parent!];
            return [parent.lat, parent.lon, c.lat, c.lon];
        });

        // Request land validation from main thread
        const landResults = await requestLandCheck(points, segments);

        // Filter to valid (sea) candidates
        const validCandidates = movingCandidates.filter(
            (_, i) => landResults.pointResults[i] && landResults.segmentResults[i],
        );

        if (validCandidates.length === 0) {
            postMsg({
                type: 'ROUTE_FAILED',
                payload: { reason: 'All routes blocked by land. Try different waypoints.' },
            });
            return;
        }

        // Check arrival before pruning
        const arrivalIdx = checkArrival(validCandidates, end, arrivalRadius);
        if (arrivalIdx >= 0) {
            // Route found! Trace back.
            const finalIsochrone = validCandidates;
            isochrones.push(finalIsochrone);

            const path = traceRoute(isochrones, arrivalIdx);
            const result = buildRouteResult(path, start);

            postMsg({ type: 'ROUTE_COMPLETE', payload: result });
            return;
        }

        // Prune to sectors
        frontier = pruneToSectors(validCandidates, start, end, numSectors);
        isochrones.push(frontier);

        // Report progress
        postMsg({
            type: 'PROGRESS',
            payload: {
                step: step + 1,
                totalSteps: maxSteps,
                percent: Math.round(((step + 1) / maxSteps) * 100),
            },
        });
    }

    // Max duration reached without arrival
    postMsg({
        type: 'ROUTE_FAILED',
        payload: {
            reason: `No route found within ${maxDuration} hours. Try a shorter passage or different departure time.`,
        },
    });
}

function buildRouteResult(path: import('../routing/types').RoutePoint[], start: LatLon): RouteResult {
    let totalDistanceNm = 0;
    let maxTws = 0;
    let totalSpeed = 0;

    for (let i = 1; i < path.length; i++) {
        totalDistanceNm += distance(path[i - 1], path[i]);
        maxTws = Math.max(maxTws, path[i].tws);
        totalSpeed += path[i].boatSpeed;
    }

    const avgSpeedKt = path.length > 1 ? totalSpeed / (path.length - 1) : 0;
    const durationMs = path[path.length - 1].time - path[0].time;
    const durationHours = durationMs / 3600000;

    return {
        path,
        eta: path[path.length - 1].time,
        totalDistanceNm,
        avgSpeedKt,
        maxTws,
        durationHours,
    };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/worker/router.worker.ts
git commit -m "feat: add Web Worker entry point for routing engine"
```

---

### Task 8: Rollup Configuration for Web Worker

**Files:**
- Modify: `rollup.config.js`

- [ ] **Step 1: Update rollup.config.js to build worker as separate IIFE bundle**

Replace the entire contents of `rollup.config.js` with:

```javascript
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

import serve from 'rollup-plugin-serve';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';
import rollupCleanup from 'rollup-plugin-cleanup';

import { less } from 'svelte-preprocess-less';
import sveltePreprocess from 'svelte-preprocess';

import { transformCodeToESMPlugin, keyPEM, certificatePEM } from '@windycom/plugin-devtools';

const useSourceMaps = true;

const isServe = process.env.SERVE !== 'false';

// Main plugin bundle
const pluginConfig = {
    input: 'src/plugin.svelte',
    output: [
        {
            file: 'dist/plugin.js',
            format: 'module',
            sourcemap: true,
        },
        {
            file: 'dist/plugin.min.js',
            format: 'module',
            plugins: [rollupCleanup({ comments: 'none', extensions: ['ts'] }), terser()],
        },
    ],
    onwarn: () => {},
    external: id => id.startsWith('@windy/'),
    watch: {
        include: ['src/**'],
        exclude: ['node_modules/**', 'src/worker/**'],
        clearScreen: false,
    },
    plugins: [
        rollupSvelte({
            emitCss: false,
            preprocess: {
                style: less({
                    sourceMap: false,
                    math: 'always',
                }),
                script: data => {
                    const preprocessed = sveltePreprocess({ sourceMap: useSourceMaps });
                    return preprocessed.script(data);
                },
            },
        }),
        rollupSwc({
            include: ['**/*.ts', '**/*.svelte'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            mainFields: ['module', 'jsnext:main', 'main'],
            preferBuiltins: false,
            dedupe: ['svelte'],
        }),
        commonjs(),
        transformCodeToESMPlugin(),
        isServe &&
            serve({
                contentBase: 'dist',
                host: '0.0.0.0',
                port: 9999,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                https: {
                    key: keyPEM,
                    cert: certificatePEM,
                },
            }),
    ],
};

// Worker bundle (IIFE, self-contained, no external deps)
const workerConfig = {
    input: 'src/worker/router.worker.ts',
    output: [
        {
            file: 'dist/router.worker.js',
            format: 'iife',
            sourcemap: true,
        },
    ],
    onwarn: () => {},
    watch: {
        include: ['src/worker/**', 'src/routing/**'],
        clearScreen: false,
    },
    plugins: [
        rollupSwc({
            include: ['**/*.ts'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            preferBuiltins: false,
        }),
        commonjs(),
    ],
};

export default [pluginConfig, workerConfig];
```

- [ ] **Step 2: Verify the build produces both files**

```bash
npm run build
ls -la dist/plugin.js dist/router.worker.js
```

Expected: Both `dist/plugin.js` and `dist/router.worker.js` exist.

- [ ] **Step 3: Commit**

```bash
git add rollup.config.js
git commit -m "feat: configure Rollup dual build for plugin and Web Worker"
```

---

### Task 9: Land Checker Adapter

**Files:**
- Create: `src/adapters/LandChecker.ts`

- [ ] **Step 1: Implement LandChecker.ts**

Create `src/adapters/LandChecker.ts`:

```typescript
import { getElevation } from '@windy/fetch';

const cache = new Map<string, boolean>();

function cacheKey(lat: number, lon: number): string {
    return `${Math.round(lat * 100)},${Math.round(lon * 100)}`;
}

/**
 * Check if a single point is sea (elevation <= 0).
 */
async function isSeaPoint(lat: number, lon: number): Promise<boolean> {
    const key = cacheKey(lat, lon);
    const cached = cache.get(key);
    if (cached !== undefined) {
        return cached;
    }

    try {
        const result = await getElevation(lat, lon);
        const isSea = result.data <= 0;
        cache.set(key, isSea);
        return isSea;
    } catch {
        // If elevation check fails, assume sea (permissive — avoids blocking routes)
        return true;
    }
}

/**
 * Batch check if points are sea (valid for sailing).
 * Returns a boolean array: true = sea, false = land.
 */
export async function checkPoints(points: [number, number][]): Promise<boolean[]> {
    return Promise.all(points.map(([lat, lon]) => isSeaPoint(lat, lon)));
}

/**
 * Check if a straight-line segment crosses land.
 * Samples every ~0.01° along the great circle.
 * Returns true if the segment is clear (no land crossing).
 */
async function isSegmentClear(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
): Promise<boolean> {
    const dLat = toLat - fromLat;
    const dLon = toLon - fromLon;
    const maxDelta = Math.max(Math.abs(dLat), Math.abs(dLon));
    const steps = Math.max(1, Math.ceil(maxDelta / 0.01));

    for (let i = 1; i < steps; i++) {
        const frac = i / steps;
        const lat = fromLat + dLat * frac;
        const lon = fromLon + dLon * frac;
        const isSea = await isSeaPoint(lat, lon);
        if (!isSea) {
            return false;
        }
    }
    return true;
}

/**
 * Batch check if segments are clear of land.
 * Returns a boolean array: true = clear, false = crosses land.
 */
export async function checkSegments(
    segments: [number, number, number, number][],
): Promise<boolean[]> {
    return Promise.all(
        segments.map(([fromLat, fromLon, toLat, toLon]) =>
            isSegmentClear(fromLat, fromLon, toLat, toLon),
        ),
    );
}

/**
 * Clear the elevation cache.
 */
export function clearCache(): void {
    cache.clear();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/LandChecker.ts
git commit -m "feat: add land checker adapter with elevation cache"
```

---

### Task 10: Wind Provider Adapter

**Files:**
- Create: `src/adapters/WindProvider.ts`

- [ ] **Step 1: Implement WindProvider.ts**

Create `src/adapters/WindProvider.ts`:

```typescript
import { getPointForecastData } from '@windy/fetch';
import type { LatLonBounds, WindGridData } from '../routing/types';

const GRID_STEP = 0.5; // degrees
const CONCURRENCY = 5;

/**
 * Fetch a wind grid from Windy for a specific weather model.
 * Pre-fetches point forecasts on a 0.5° grid covering the bounding box.
 * Returns a plain serialisable object for transfer to the Web Worker.
 */
export async function fetchWindGrid(
    model: string,
    bounds: LatLonBounds,
    pluginName: string,
): Promise<WindGridData> {
    // Build grid coordinates
    const lats: number[] = [];
    const lons: number[] = [];

    for (let lat = bounds.south; lat <= bounds.north; lat += GRID_STEP) {
        lats.push(Math.round(lat * 1000) / 1000);
    }
    for (let lon = bounds.west; lon <= bounds.east; lon += GRID_STEP) {
        lons.push(Math.round(lon * 1000) / 1000);
    }

    // Ensure at least 2 points per axis for interpolation
    if (lats.length < 2) {
        lats.push(lats[0] + GRID_STEP);
    }
    if (lons.length < 2) {
        lons.push(lons[0] + GRID_STEP);
    }

    // Fetch all point forecasts with concurrency limiting
    type ForecastResult = {
        latIdx: number;
        lonIdx: number;
        timestamps: number[];
        windU: number[];
        windV: number[];
    };

    const tasks: (() => Promise<ForecastResult>)[] = [];

    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            const lat = lats[li];
            const lon = lons[lo];
            const latIdx = li;
            const lonIdx = lo;

            tasks.push(async () => {
                const response = await getPointForecastData(
                    model,
                    { lat, lon },
                    pluginName,
                );
                const data = response.data.data;
                return {
                    latIdx,
                    lonIdx,
                    timestamps: data.ts,
                    windU: data['wind_u-surface'] ?? data['wind_u-850h'] ?? [],
                    windV: data['wind_v-surface'] ?? data['wind_v-850h'] ?? [],
                };
            });
        }
    }

    const results = await runWithConcurrency(tasks, CONCURRENCY);

    // Get timestamps from first result
    const timestamps = results[0].timestamps;

    // Build 3D arrays: [latIdx][lonIdx][timeIdx]
    const windU: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );
    const windV: number[][][] = lats.map(() =>
        lons.map(() => new Array(timestamps.length).fill(0)),
    );

    for (const r of results) {
        for (let t = 0; t < timestamps.length; t++) {
            windU[r.latIdx][r.lonIdx][t] = r.windU[t] ?? 0;
            windV[r.latIdx][r.lonIdx][t] = r.windV[t] ?? 0;
        }
    }

    return { lats, lons, timestamps, windU, windV };
}

/**
 * Compute a bounding box around start and end with a margin.
 */
export function computeBounds(
    start: { lat: number; lon: number },
    end: { lat: number; lon: number },
    marginDeg: number = 1.0,
): LatLonBounds {
    return {
        south: Math.min(start.lat, end.lat) - marginDeg,
        north: Math.max(start.lat, end.lat) + marginDeg,
        west: Math.min(start.lon, end.lon) - marginDeg,
        east: Math.max(start.lon, end.lon) + marginDeg,
    };
}

/**
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
    tasks: (() => Promise<T>)[],
    limit: number,
): Promise<T[]> {
    const results: T[] = new Array(tasks.length);
    let nextIndex = 0;

    async function runNext(): Promise<void> {
        while (nextIndex < tasks.length) {
            const index = nextIndex++;
            results[index] = await tasks[index]();
        }
    }

    const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
    await Promise.all(workers);
    return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/WindProvider.ts
git commit -m "feat: add wind provider adapter with grid pre-fetching"
```

---

### Task 11: Worker Bridge

**Files:**
- Create: `src/adapters/WorkerBridge.ts`

- [ ] **Step 1: Implement WorkerBridge.ts**

Create `src/adapters/WorkerBridge.ts`:

```typescript
import type { LatLon, PolarData, RouteResult, RoutingOptions, WindGridData } from '../routing/types';
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
    ): Promise<RouteResult> {
        // Create worker from the bundled worker file
        const workerUrl = new URL('./router.worker.js', import.meta.url).href;
        this.worker = new Worker(workerUrl);

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
                        const [pointResults, segmentResults] = await Promise.all([
                            checkPoints(msg.payload.points),
                            checkSegments(msg.payload.segments),
                        ]);

                        this.worker?.postMessage({
                            type: 'LAND_RESULTS',
                            payload: { pointResults, segmentResults },
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
                payload: { windGrid, polar, start, end, options },
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
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/WorkerBridge.ts
git commit -m "feat: add Worker bridge with land-check callback handling"
```

---

### Task 12: Routing Orchestrator

**Files:**
- Create: `src/adapters/RoutingOrchestrator.ts`

- [ ] **Step 1: Implement RoutingOrchestrator.ts**

Create `src/adapters/RoutingOrchestrator.ts`:

```typescript
import type { LatLon, PolarData, RouteResult, RoutingOptions } from '../routing/types';
import { fetchWindGrid, computeBounds } from './WindProvider';
import { clearCache as clearLandCache } from './LandChecker';
import { WorkerBridge } from './WorkerBridge';

export type StatusCallback = (status: string, percent: number) => void;

export class RoutingOrchestrator {
    private bridge: WorkerBridge = new WorkerBridge();
    private pluginName: string;

    constructor(pluginName: string) {
        this.pluginName = pluginName;
    }

    /**
     * Run the full routing pipeline: validate → fetch wind → compute route.
     */
    async computeRoute(
        start: LatLon,
        end: LatLon,
        polar: PolarData,
        options: RoutingOptions,
        onStatus?: StatusCallback,
    ): Promise<RouteResult> {
        // Validate start/end
        if (!start || !end) {
            throw new Error('Start and end points must be set.');
        }

        // Fetch wind grid
        onStatus?.('Fetching weather data...', 0);
        const bounds = computeBounds(start, end, 1.0);
        const windGrid = await fetchWindGrid('gfs', bounds, this.pluginName);

        // Compute route via worker
        onStatus?.('Computing route...', 5);
        const result = await this.bridge.computeRoute(
            windGrid,
            polar,
            start,
            end,
            options,
            (percent) => {
                // Scale worker progress from 5-100%
                const scaledPercent = 5 + Math.round(percent * 0.95);
                onStatus?.(`Computing route... ${scaledPercent}%`, scaledPercent);
            },
        );

        onStatus?.('Route complete!', 100);
        return result;
    }

    /**
     * Cancel any in-progress routing.
     */
    cancel(): void {
        this.bridge.terminate();
    }

    /**
     * Cleanup resources.
     */
    destroy(): void {
        this.bridge.terminate();
        clearLandCache();
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/adapters/RoutingOrchestrator.ts
git commit -m "feat: add routing orchestrator coordinating wind fetch and Worker"
```

---

### Task 13: Waypoint Manager

**Files:**
- Create: `src/map/WaypointManager.ts`

- [ ] **Step 1: Implement WaypointManager.ts**

Create `src/map/WaypointManager.ts`:

```typescript
import { map, markers as windyMarkers } from '@windy/map';
import { singleclick } from '@windy/singleclick';

import type { LatLon } from '../routing/types';

export type WaypointState = 'IDLE' | 'WAITING_START' | 'WAITING_END' | 'READY';
export type StateChangeCallback = (
    state: WaypointState,
    start: LatLon | null,
    end: LatLon | null,
) => void;

export class WaypointManager {
    private state: WaypointState = 'IDLE';
    private startMarker: L.Marker | null = null;
    private endMarker: L.Marker | null = null;
    private startPos: LatLon | null = null;
    private endPos: LatLon | null = null;
    private pluginName: string;
    private onChange: StateChangeCallback;

    private static startIcon = L.divIcon({
        html: '<div style="background:#2ecc71;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">S</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
    });

    private static endIcon = L.divIcon({
        html: '<div style="background:#e74c3c;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:16px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);">E</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        className: '',
    });

    constructor(pluginName: string, onChange: StateChangeCallback) {
        this.pluginName = pluginName;
        this.onChange = onChange;
    }

    /**
     * Start listening for map clicks. Sets state to WAITING_START.
     */
    activate(): void {
        this.state = 'WAITING_START';
        singleclick.on(this.pluginName, this.handleClick);
        this.notifyChange();
    }

    private handleClick = (latLon: LatLon) => {
        if (this.state === 'WAITING_START') {
            this.setStart(latLon);
        } else if (this.state === 'WAITING_END') {
            this.setEnd(latLon);
        }
    };

    private setStart(latLon: LatLon): void {
        this.startPos = latLon;

        if (this.startMarker) {
            this.startMarker.setLatLng([latLon.lat, latLon.lon]);
        } else {
            this.startMarker = new L.Marker([latLon.lat, latLon.lon], {
                icon: WaypointManager.startIcon,
                draggable: true,
            }).addTo(map);

            this.startMarker.on('dragend', () => {
                const pos = this.startMarker!.getLatLng();
                this.startPos = { lat: pos.lat, lon: pos.lng };
                this.notifyChange();
            });
        }

        this.state = 'WAITING_END';
        this.notifyChange();
    }

    private setEnd(latLon: LatLon): void {
        this.endPos = latLon;

        if (this.endMarker) {
            this.endMarker.setLatLng([latLon.lat, latLon.lon]);
        } else {
            this.endMarker = new L.Marker([latLon.lat, latLon.lon], {
                icon: WaypointManager.endIcon,
                draggable: true,
            }).addTo(map);

            this.endMarker.on('dragend', () => {
                const pos = this.endMarker!.getLatLng();
                this.endPos = { lat: pos.lat, lon: pos.lng };
                this.notifyChange();
            });
        }

        this.state = 'READY';
        this.notifyChange();
    }

    getStart(): LatLon | null {
        return this.startPos;
    }

    getEnd(): LatLon | null {
        return this.endPos;
    }

    getState(): WaypointState {
        return this.state;
    }

    /**
     * Reset to WAITING_START, remove markers.
     */
    reset(): void {
        this.removeMarkers();
        this.startPos = null;
        this.endPos = null;
        this.state = 'WAITING_START';
        this.notifyChange();
    }

    /**
     * Fully destroy: remove markers and stop listening.
     */
    destroy(): void {
        this.removeMarkers();
        singleclick.off(this.pluginName, this.handleClick);
        this.state = 'IDLE';
    }

    private removeMarkers(): void {
        if (this.startMarker) {
            map.removeLayer(this.startMarker);
            this.startMarker = null;
        }
        if (this.endMarker) {
            map.removeLayer(this.endMarker);
            this.endMarker = null;
        }
    }

    private notifyChange(): void {
        this.onChange(this.state, this.startPos, this.endPos);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/map/WaypointManager.ts
git commit -m "feat: add waypoint manager with click-to-place and draggable markers"
```

---

### Task 14: Route Renderer

**Files:**
- Create: `src/map/RouteRenderer.ts`

- [ ] **Step 1: Implement RouteRenderer.ts**

Create `src/map/RouteRenderer.ts`:

```typescript
import { map } from '@windy/map';
import type { RouteResult } from '../routing/types';

const GFS_BLUE = '#457B9D';

export class RouteRenderer {
    private routeLine: L.Polyline | null = null;

    /**
     * Draw the computed route on the map.
     */
    renderRoute(route: RouteResult): void {
        this.clear();

        const latlngs: [number, number][] = route.path.map(p => [p.lat, p.lon]);

        this.routeLine = new L.Polyline(latlngs, {
            color: GFS_BLUE,
            weight: 3,
            opacity: 0.9,
        }).addTo(map);

        // Fit map to show the full route
        if (latlngs.length > 1) {
            const bounds = L.latLngBounds(latlngs);
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }

    /**
     * Remove all route layers from the map.
     */
    clear(): void {
        if (this.routeLine) {
            map.removeLayer(this.routeLine);
            this.routeLine = null;
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/map/RouteRenderer.ts
git commit -m "feat: add route renderer for drawing polyline on map"
```

---

### Task 15: Progress Bar Component

**Files:**
- Create: `src/ui/ProgressBar.svelte`

- [ ] **Step 1: Implement ProgressBar.svelte**

Create `src/ui/ProgressBar.svelte`:

```svelte
<div class="progress-container">
    <div class="progress-bar" style:width="{percent}%"></div>
</div>
<div class="progress-text size-xs">{statusText}</div>

<script lang="ts">
    export let percent: number = 0;
    export let statusText: string = '';
</script>

<style lang="less">
    .progress-container {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
        margin: 10px 0 4px;
    }
    .progress-bar {
        height: 100%;
        background: #457b9d;
        border-radius: 3px;
        transition: width 0.3s ease;
    }
    .progress-text {
        opacity: 0.7;
        margin-bottom: 10px;
    }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/ProgressBar.svelte
git commit -m "feat: add progress bar component"
```

---

### Task 16: Routing Panel UI

**Files:**
- Create: `src/ui/RoutingPanel.svelte`

- [ ] **Step 1: Implement RoutingPanel.svelte**

Create `src/ui/RoutingPanel.svelte`:

```svelte
<div class="routing-panel">
    <!-- Waypoint instructions -->
    <div class="section mb-15">
        {#if waypointState === 'WAITING_START'}
            <p class="size-m instruction">Click the map to set your <strong>start point</strong>.</p>
        {:else if waypointState === 'WAITING_END'}
            <p class="size-m instruction">Click the map to set your <strong>end point</strong>.</p>
        {:else if waypointState === 'READY'}
            <p class="size-xs coords">Start: {formatLatLon(start)}</p>
            <p class="size-xs coords">End: {formatLatLon(end)}</p>
        {/if}
    </div>

    <!-- Boat -->
    <div class="section mb-10">
        <span class="size-xs label">Boat:</span>
        <span class="size-s">Bavaria 38</span>
    </div>

    <!-- Departure time -->
    <div class="section mb-15">
        <label class="size-xs label" for="departure">Departure:</label>
        <input
            id="departure"
            type="datetime-local"
            bind:value={departureStr}
            class="input size-s"
        />
    </div>

    <!-- Calculate button -->
    <div class="section mb-15">
        <button
            class="button button--variant-orange size-m"
            style="width:100%"
            disabled={!canCalculate}
            on:click={handleCalculate}
        >
            {isRouting ? 'Cancel' : 'Calculate Route'}
        </button>
    </div>

    <!-- Progress -->
    {#if isRouting}
        <ProgressBar percent={progressPercent} statusText={progressStatus} />
    {/if}

    <!-- Error -->
    {#if error}
        <div class="section mb-10 error-text size-s">{error}</div>
    {/if}

    <!-- Results -->
    {#if result}
        <div class="section results">
            <h3 class="size-m mb-10">Route Summary</h3>
            <div class="result-grid">
                <div class="result-item">
                    <span class="size-xs label">ETA</span>
                    <span class="size-s">{formatEta(result.eta)}</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Distance</span>
                    <span class="size-s">{result.totalDistanceNm.toFixed(1)} nm</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Avg SOG</span>
                    <span class="size-s">{result.avgSpeedKt.toFixed(1)} kt</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Max TWS</span>
                    <span class="size-s">{result.maxTws.toFixed(0)} kt</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Duration</span>
                    <span class="size-s">{formatDuration(result.durationHours)}</span>
                </div>
            </div>

            <button
                class="button size-s mt-15"
                style="width:100%"
                on:click={handleClear}
            >
                Clear Route
            </button>
        </div>
    {/if}

    <!-- Disclaimer -->
    <div class="disclaimer size-xs mt-15">
        Routes are advisory only. Not a substitute for proper passage planning and seamanship.
    </div>
</div>

<script lang="ts">
    import ProgressBar from './ProgressBar.svelte';

    import type { LatLon, RouteResult } from '../routing/types';
    import type { WaypointState } from '../map/WaypointManager';

    export let waypointState: WaypointState = 'WAITING_START';
    export let start: LatLon | null = null;
    export let end: LatLon | null = null;
    export let isRouting: boolean = false;
    export let progressPercent: number = 0;
    export let progressStatus: string = '';
    export let result: RouteResult | null = null;
    export let error: string | null = null;

    export let onCalculate: () => void = () => {};
    export let onCancel: () => void = () => {};
    export let onClear: () => void = () => {};

    // Default departure to now, formatted for datetime-local input
    let departureStr = formatDateForInput(new Date());

    export function getDepartureTime(): number {
        return new Date(departureStr).getTime();
    }

    $: canCalculate = waypointState === 'READY' && !isRouting;

    function handleCalculate(): void {
        if (isRouting) {
            onCancel();
        } else {
            onCalculate();
        }
    }

    function handleClear(): void {
        onClear();
    }

    function formatLatLon(pos: LatLon | null): string {
        if (!pos) {
            return '—';
        }
        return `${pos.lat.toFixed(3)}°, ${pos.lon.toFixed(3)}°`;
    }

    function formatEta(timestamp: number): string {
        const d = new Date(timestamp);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatDuration(hours: number): string {
        const days = Math.floor(hours / 24);
        const hrs = Math.floor(hours % 24);
        if (days > 0) {
            return `${days}d ${hrs}h`;
        }
        return `${hrs}h`;
    }

    function formatDateForInput(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }
</script>

<style lang="less">
    .routing-panel {
        padding: 5px 0;
    }
    .section {
        padding: 0;
    }
    .instruction {
        line-height: 1.6;
        opacity: 0.9;
    }
    .coords {
        opacity: 0.7;
        line-height: 1.6;
    }
    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 2px;
    }
    .input {
        width: 100%;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 6px 8px;
        font-size: 14px;
    }
    .error-text {
        color: #e74c3c;
        line-height: 1.4;
    }
    .results {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 12px;
    }
    .result-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }
    .result-item {
        .label {
            margin-bottom: 0;
        }
    }
    .disclaimer {
        opacity: 0.4;
        line-height: 1.4;
        font-style: italic;
    }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/RoutingPanel.svelte
git commit -m "feat: add routing panel UI with inputs, progress, and results"
```

---

### Task 17: Main Plugin Shell

**Files:**
- Modify: `src/plugin.svelte`

- [ ] **Step 1: Implement the main plugin.svelte**

Replace `src/plugin.svelte` with:

```svelte
<div class="plugin__mobile-header">
    {title}
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={() => bcast.emit('rqstOpen', 'menu')}
    >
        {title}
    </div>
    <RoutingPanel
        {waypointState}
        {start}
        {end}
        {isRouting}
        {progressPercent}
        {progressStatus}
        {result}
        {error}
        onCalculate={handleCalculate}
        onCancel={handleCancel}
        onClear={handleClear}
        bind:this={routingPanel}
    />
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';
    import RoutingPanel from './ui/RoutingPanel.svelte';
    import { WaypointManager } from './map/WaypointManager';
    import { RouteRenderer } from './map/RouteRenderer';
    import { RoutingOrchestrator } from './adapters/RoutingOrchestrator';
    import bavaria38Polar from './data/polars/bavaria38.json';

    import type { LatLon, RouteResult } from './routing/types';
    import type { WaypointState } from './map/WaypointManager';

    const { title, name } = config;

    let waypointState: WaypointState = 'WAITING_START';
    let start: LatLon | null = null;
    let end: LatLon | null = null;
    let isRouting = false;
    let progressPercent = 0;
    let progressStatus = '';
    let result: RouteResult | null = null;
    let error: string | null = null;

    let routingPanel: RoutingPanel;

    const renderer = new RouteRenderer();
    const orchestrator = new RoutingOrchestrator(name);
    let waypointMgr: WaypointManager;

    function handleWaypointChange(
        state: WaypointState,
        newStart: LatLon | null,
        newEnd: LatLon | null,
    ): void {
        waypointState = state;
        start = newStart;
        end = newEnd;
    }

    async function handleCalculate(): Promise<void> {
        if (!start || !end) {
            return;
        }

        error = null;
        result = null;
        isRouting = true;
        progressPercent = 0;
        progressStatus = 'Starting...';

        try {
            const departureTime = routingPanel.getDepartureTime();

            const options = {
                startTime: departureTime,
                timeStep: 1.0,
                maxDuration: 168,
                headingStep: 5,
                numSectors: 72,
                arrivalRadius: 1.0,
            };

            const routeResult = await orchestrator.computeRoute(
                start,
                end,
                bavaria38Polar,
                options,
                (status, percent) => {
                    progressStatus = status;
                    progressPercent = percent;
                },
            );

            result = routeResult;
            renderer.renderRoute(routeResult);
        } catch (err) {
            error = err instanceof Error ? err.message : 'Routing computation failed.';
        } finally {
            isRouting = false;
        }
    }

    function handleCancel(): void {
        orchestrator.cancel();
        isRouting = false;
        progressStatus = '';
        progressPercent = 0;
    }

    function handleClear(): void {
        result = null;
        error = null;
        renderer.clear();
    }

    export const onopen = (_params: unknown) => {
        waypointMgr = new WaypointManager(name, handleWaypointChange);
        waypointMgr.activate();
    };

    onMount(() => {});

    onDestroy(() => {
        waypointMgr?.destroy();
        renderer.clear();
        orchestrator.destroy();
    });
</script>

<style lang="less">
</style>
```

- [ ] **Step 2: Enable JSON imports in tsconfig.json**

The plugin imports `bavaria38.json` directly. Update `tsconfig.json` to set `"resolveJsonModule": true`:

In `tsconfig.json`, change `"resolveJsonModule": false` to `"resolveJsonModule": true`.

Also add `@rollup/plugin-json` for the rollup build. In `package.json` add it as a dependency:

```bash
npm install --save-dev @rollup/plugin-json
```

In `rollup.config.js`, add the JSON plugin to the plugin config's plugins array. Add this import at the top:

```javascript
import json from '@rollup/plugin-json';
```

Then add `json()` to both the `pluginConfig.plugins` array (before `resolve(...)`) and the `workerConfig.plugins` array (before `resolve(...)`).

- [ ] **Step 3: Verify the full build works**

```bash
npm run build
```

Expected: Build succeeds with `dist/plugin.js`, `dist/plugin.min.js`, and `dist/router.worker.js`.

- [ ] **Step 4: Verify all tests still pass**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/plugin.svelte src/ui/RoutingPanel.svelte src/ui/ProgressBar.svelte src/map/WaypointManager.ts src/map/RouteRenderer.ts src/adapters/RoutingOrchestrator.ts src/adapters/WorkerBridge.ts src/adapters/LandChecker.ts src/adapters/WindProvider.ts src/data/polars/bavaria38.json tsconfig.json rollup.config.js package.json
git commit -m "feat: complete Phase 1 MVP — sailing weather router with GFS routing"
```

---

### Task 18: Delete Smoke Test and Clean Up

**Files:**
- Delete: `tests/routing/smoke.test.ts`
- Remove: `examples/` directory (not needed for our plugin)

- [ ] **Step 1: Remove smoke test and examples**

```bash
rm tests/routing/smoke.test.ts
rm -rf examples/
```

- [ ] **Step 2: Verify tests still pass**

```bash
npm test
```

Expected: 4 test suites pass (geo, Polar, WindGrid, IsochroneRouter).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove smoke test and template examples"
```

---

### Task 19: Manual Integration Test

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

```bash
npm start
```

Expected: Dev server starts on `https://localhost:9999`. Both `plugin.js` and `router.worker.js` are served.

- [ ] **Step 2: Load in Windy**

1. Open `https://www.windy.com/developer-mode` in a browser
2. Enter plugin URL: `https://localhost:9999/plugin.js`
3. Accept the self-signed certificate if prompted
4. The Sail Router should appear in the right-hand pane

- [ ] **Step 3: Test the waypoint workflow**

1. Verify the panel shows "Click the map to set your start point"
2. Click on the map (on water, e.g. Sydney Harbour)
3. Verify a green "S" marker appears and text changes to "Click the map to set your end point"
4. Click on a second location (e.g. north along the coast)
5. Verify a red "E" marker appears and coordinates are shown
6. Verify the "Calculate Route" button becomes enabled
7. Test dragging markers — coordinates should update

- [ ] **Step 4: Test route calculation**

1. Set start and end points about 50-100nm apart along the NSW coast
2. Click "Calculate Route"
3. Verify the progress bar advances
4. After completion, verify:
   - A blue polyline route appears on the map
   - Results section shows ETA, distance, avg SOG, max TWS, duration
   - Values are reasonable (e.g. 50nm at ~5-7kt avg = ~8-10 hours)

- [ ] **Step 5: Test error cases**

1. Click "Clear Route" — verify route disappears and results clear
2. Set start point on land — verify routing produces an error message
3. Close and reopen the plugin — verify cleanup works (no leftover markers/polylines)

- [ ] **Step 6: Note any issues found for follow-up**

Document any bugs or adjustments needed. Common issues:
- Worker URL resolution might need adjustment depending on how Windy loads the plugin
- `getElevation` API format might differ from expectations — check response shape
- `getPointForecastData` response structure for wind_u/wind_v keys might need adjustment
