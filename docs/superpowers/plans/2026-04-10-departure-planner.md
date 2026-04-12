# Departure Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a departure planning feature that finds the optimal departure time by running routes at multiple start times across a user-defined window, displaying results in a grouped table with smooth gradient condition bars.

**Architecture:** A new `DeparturePlanner` class loops over departure times calling the existing `RoutingOrchestrator.computeRoutes()` for each. Results stream into a new `DeparturePlannerResults` Svelte component with per-row canvas-based condition bars. A mode toggle in `RoutingPanel` switches between single-route and departure-planner views.

**Tech Stack:** TypeScript, Svelte 3, HTML Canvas, Vitest

**Spec:** `docs/superpowers/specs/2026-04-10-departure-planner-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/routing/types.ts` | Modify | Add `DepartureWindowConfig`, `DepartureResult` interfaces |
| `src/adapters/DeparturePlanner.ts` | Create | Orchestration loop: generate departure times, call orchestrator per departure, stream results, handle cancellation |
| `src/ui/conditionBarColors.ts` | Create | Pure functions: metric value → RGB color for each metric (TWS, SOG, TWA, Swell) |
| `src/ui/ConditionBar.svelte` | Create | Canvas-based gradient bar component, renders RoutePoint[] for active metric |
| `src/ui/DepartureWindowInput.svelte` | Create | From/To datetime + interval dropdown + summary text |
| `src/ui/DeparturePlannerResults.svelte` | Create | Grouped results table with metric toggle, hover/click interactions |
| `src/ui/RoutingPanel.svelte` | Modify | Add mode toggle, conditionally show departure planner UI |
| `src/plugin.svelte` | Modify | Wire up DeparturePlanner, handle departure scan, hover-to-preview |
| `tests/adapters/DeparturePlanner.test.ts` | Create | Departure time generation, progress callbacks, cancellation |
| `tests/ui/conditionBarColors.test.ts` | Create | Color scale mapping tests |

---

### Task 1: Add New Types

**Files:**
- Modify: `src/routing/types.ts:175-211`

- [ ] **Step 1: Add DepartureWindowConfig and DepartureResult interfaces**

Add these at the end of the file, before `DEFAULT_SETTINGS`:

```typescript
// --- in src/routing/types.ts, after SavedRoute interface ---

export interface DepartureWindowConfig {
    windowStart: number;    // Unix ms
    windowEnd: number;      // Unix ms
    intervalHours: number;  // 3, 6, 12, or 24
}

export interface DepartureResult {
    departureTime: number;          // Unix ms
    modelResults: ModelRouteResult[]; // one per successful model
    failedModels?: WindModelId[];
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/routing/types.ts
git commit -m "feat: add DepartureWindowConfig and DepartureResult types"
```

---

### Task 2: DeparturePlanner — Tests

**Files:**
- Create: `tests/adapters/DeparturePlanner.test.ts`

- [ ] **Step 1: Write departure time generation tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { DeparturePlanner } from '../../src/adapters/DeparturePlanner';
import type { DepartureWindowConfig, LatLon, PolarData, RoutingOptions, WindModelId, ModelRouteResult, RouteResult, DepartureResult } from '../../src/routing/types';

// We test the pure generateDepartureTimes function and the orchestration logic
// by mocking RoutingOrchestrator

describe('DeparturePlanner', () => {
    describe('generateDepartureTimes', () => {
        it('generates correct times for a 24h window at 6h intervals', () => {
            const base = new Date('2026-04-10T06:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base + 24 * 3600_000,
                intervalHours: 6,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times).toEqual([
                base,
                base + 6 * 3600_000,
                base + 12 * 3600_000,
                base + 18 * 3600_000,
                base + 24 * 3600_000,
            ]);
        });

        it('generates a single departure when window equals interval', () => {
            const base = new Date('2026-04-10T06:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base,
                intervalHours: 6,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times).toEqual([base]);
        });

        it('includes windowEnd even if not exactly on interval boundary', () => {
            const base = new Date('2026-04-10T06:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base + 7 * 3600_000, // 7h window, 6h interval
                intervalHours: 6,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            // Should have base and base+6h (base+7h would be past last interval step)
            expect(times).toEqual([
                base,
                base + 6 * 3600_000,
            ]);
        });

        it('generates correct times for 3h intervals over 12h', () => {
            const base = new Date('2026-04-10T00:00:00Z').getTime();
            const config: DepartureWindowConfig = {
                windowStart: base,
                windowEnd: base + 12 * 3600_000,
                intervalHours: 3,
            };
            const times = DeparturePlanner.generateDepartureTimes(config);
            expect(times.length).toBe(5); // 0, 3, 6, 9, 12
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/adapters/DeparturePlanner.test.ts`
Expected: FAIL — `Cannot find module '../../src/adapters/DeparturePlanner'`

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/adapters/DeparturePlanner.test.ts
git commit -m "test: add failing tests for DeparturePlanner time generation"
```

---

### Task 3: DeparturePlanner — Implementation

**Files:**
- Create: `src/adapters/DeparturePlanner.ts`

- [ ] **Step 1: Implement DeparturePlanner class**

```typescript
import type {
    LatLon,
    PolarData,
    RoutingOptions,
    WindModelId,
    ModelRouteResult,
    DepartureWindowConfig,
    DepartureResult,
    PipelineStep,
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
                // Create a fresh orchestrator per departure so cancellation
                // of one doesn't affect the next
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
                // All models failed for this departure — record it with empty results
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/adapters/DeparturePlanner.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/adapters/DeparturePlanner.ts
git commit -m "feat: implement DeparturePlanner orchestration loop"
```

---

### Task 4: Condition Bar Color Scales — Tests

**Files:**
- Create: `tests/ui/conditionBarColors.test.ts`

- [ ] **Step 1: Write color mapping tests**

```typescript
import { describe, it, expect } from 'vitest';
import { twsColor, sogColor, twaColor, swellColor } from '../../src/ui/conditionBarColors';

describe('twsColor', () => {
    it('returns blue for calm / motoring (< 4kt)', () => {
        expect(twsColor(2)).toBe('rgb(52, 152, 219)');
    });

    it('returns green for ideal sailing (10kt)', () => {
        const c = twsColor(10);
        expect(c).toMatch(/^rgb\(/);
        // Should be in the green range
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns red for heavy wind (30kt)', () => {
        const c = twsColor(30);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });
});

describe('twaColor', () => {
    it('returns green for dead run (180)', () => {
        const c = twaColor(180);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns green for broad reach (120)', () => {
        const c = twaColor(120);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns red for hard on the wind (25)', () => {
        const c = twaColor(25);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });
});

describe('sogColor', () => {
    it('returns red for stalled (0kt)', () => {
        const c = sogColor(0);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });

    it('returns green for good speed (7kt)', () => {
        const c = sogColor(7);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });
});

describe('swellColor', () => {
    it('returns green for calm swell (0.5m)', () => {
        const c = swellColor(0.5);
        const [, g] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(g).toBeGreaterThan(150);
    });

    it('returns red for heavy swell (4m)', () => {
        const c = swellColor(4);
        const [r] = c.match(/rgb\((\d+), (\d+), (\d+)\)/)!.slice(1).map(Number);
        expect(r).toBeGreaterThan(200);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ui/conditionBarColors.test.ts`
Expected: FAIL — `Cannot find module '../../src/ui/conditionBarColors'`

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/ui/conditionBarColors.test.ts
git commit -m "test: add failing tests for condition bar color scales"
```

---

### Task 5: Condition Bar Color Scales — Implementation

**Files:**
- Create: `src/ui/conditionBarColors.ts`

- [ ] **Step 1: Implement color scale functions**

```typescript
/**
 * Color scale functions for condition gradient bars.
 * Each function maps a metric value to an rgb() string.
 */

function lerp(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function rgb(r: number, g: number, b: number): string {
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Interpolate through color stops: [[threshold, r, g, b], ...]
 * Values below first stop get first color, above last get last color.
 */
function scaleColor(value: number, stops: [number, number, number, number][]): string {
    if (stops.length === 0) return rgb(128, 128, 128);
    if (value <= stops[0][0]) return rgb(stops[0][1], stops[0][2], stops[0][3]);
    if (value >= stops[stops.length - 1][0]) {
        const s = stops[stops.length - 1];
        return rgb(s[1], s[2], s[3]);
    }

    for (let i = 0; i < stops.length - 1; i++) {
        const [v0, r0, g0, b0] = stops[i];
        const [v1, r1, g1, b1] = stops[i + 1];
        if (value >= v0 && value <= v1) {
            const t = (value - v0) / (v1 - v0);
            return rgb(lerp(r0, r1, t), lerp(g0, g1, t), lerp(b0, b1, t));
        }
    }

    const s = stops[stops.length - 1];
    return rgb(s[1], s[2], s[3]);
}

/**
 * TWS color: Blue (calm) → Green (8-12kt ideal) → Yellow (15-20kt) → Red (25kt+)
 */
export function twsColor(tws: number): string {
    // Below 4kt: motoring blue
    if (tws < 4) return rgb(52, 152, 219); // #3498db
    return scaleColor(tws, [
        [4,   52, 152, 219],  // blue — light air
        [8,   46, 204, 113],  // green — ideal start
        [14,  46, 204, 113],  // green — ideal end
        [20, 243, 156,  18],  // yellow — fresh
        [25, 231,  76,  60],  // red — strong
        [35, 192,  57,  43],  // dark red — storm
    ]);
}

/**
 * SOG color: Red (stalled) → Yellow (slow) → Green (good VMG)
 */
export function sogColor(sog: number): string {
    return scaleColor(sog, [
        [0,  231,  76,  60],  // red — stalled
        [2,  243, 156,  18],  // yellow — slow
        [4,  168, 224, 106],  // yellow-green
        [6,   46, 204, 113],  // green — good
        [10,  39, 174,  96],  // darker green — fast
    ]);
}

/**
 * TWA color: Green (broad reach/run 90-180°) → Yellow (close hauled ~50-60°) → Red (hard on wind <40°)
 * Dead run (180°) is the greenest.
 */
export function twaColor(twa: number): string {
    // TWA is 0-180. Higher = further off wind = better.
    // Invert so we can use ascending scale: offWind = 180 - twa
    // offWind 0 = dead run (green), offWind 140 = hard on wind (red)
    const offWind = 180 - twa;
    return scaleColor(offWind, [
        [0,    39, 174,  96],  // dark green — dead run
        [60,   46, 204, 113],  // green — broad reach
        [90,  168, 224, 106],  // yellow-green — beam reach
        [120, 243, 156,  18],  // yellow — close hauled
        [140, 231,  76,  60],  // red — hard on wind / no-go
        [180, 192,  57,  43],  // dark red — head to wind
    ]);
}

/**
 * Swell color: Green (<1m) → Yellow (1-2m) → Red (3m+)
 */
export function swellColor(height: number): string {
    return scaleColor(height, [
        [0,    39, 174,  96],  // dark green — flat
        [0.5,  46, 204, 113],  // green — calm
        [1.5, 243, 156,  18],  // yellow — moderate
        [2.5, 231,  76,  60],  // red — rough
        [4,   192,  57,  43],  // dark red — heavy
    ]);
}

export type ConditionMetric = 'tws' | 'sog' | 'twa' | 'swell';

export const METRIC_LABELS: Record<ConditionMetric, string> = {
    tws: 'TWS',
    sog: 'SOG',
    twa: 'TWA',
    swell: 'Swell',
};
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/ui/conditionBarColors.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/ui/conditionBarColors.ts
git commit -m "feat: implement condition bar color scale functions"
```

---

### Task 6: ConditionBar Svelte Component

**Files:**
- Create: `src/ui/ConditionBar.svelte`

- [ ] **Step 1: Create the canvas-based gradient bar component**

```svelte
<canvas
    bind:this={canvas}
    class="condition-bar"
    width={canvasWidth}
    height={canvasHeight}
></canvas>

<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import type { RoutePoint } from '../routing/types';
    import type { ConditionMetric } from './conditionBarColors';
    import { twsColor, sogColor, twaColor, swellColor } from './conditionBarColors';

    export let points: RoutePoint[] = [];
    export let metric: ConditionMetric = 'tws';

    let canvas: HTMLCanvasElement;
    const canvasHeight = 14;
    let canvasWidth = 200;

    function getMetricValue(point: RoutePoint, m: ConditionMetric): number {
        switch (m) {
            case 'tws': return point.tws;
            case 'sog': return point.boatSpeed;
            case 'twa': return point.twa;
            case 'swell': return point.swell?.height ?? 0;
        }
    }

    function getColor(value: number, m: ConditionMetric): string {
        switch (m) {
            case 'tws': return twsColor(value);
            case 'sog': return sogColor(value);
            case 'twa': return twaColor(value);
            case 'swell': return swellColor(value);
        }
    }

    function render(): void {
        if (!canvas || points.length === 0) return;

        // Match canvas pixel width to CSS layout width
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
            canvasWidth = Math.round(rect.width * (window.devicePixelRatio || 1));
            canvas.width = canvasWidth;
            canvas.height = canvasHeight * (window.devicePixelRatio || 1);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        for (let px = 0; px < w; px++) {
            // Map pixel to a fractional index into the points array
            const frac = px / (w - 1);
            const idx = frac * (points.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.min(lo + 1, points.length - 1);
            const t = idx - lo;

            // Interpolate metric value between adjacent points
            const valLo = getMetricValue(points[lo], metric);
            const valHi = getMetricValue(points[hi], metric);
            const val = valLo + (valHi - valLo) * t;

            ctx.fillStyle = getColor(val, metric);
            ctx.fillRect(px, 0, 1, h);
        }
    }

    onMount(render);
    afterUpdate(render);
</script>

<style lang="less">
    .condition-bar {
        width: 100%;
        height: 14px;
        border-radius: 7px;
        display: block;
    }
</style>
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/ConditionBar.svelte
git commit -m "feat: add ConditionBar canvas gradient component"
```

---

### Task 7: DepartureWindowInput Svelte Component

**Files:**
- Create: `src/ui/DepartureWindowInput.svelte`

- [ ] **Step 1: Create the departure window input component**

```svelte
<div class="departure-window">
    <div class="dw-row">
        <label class="size-xs label" for="dw-from">From:</label>
        <input id="dw-from" type="datetime-local" bind:value={fromStr} class="input size-s" />
    </div>
    <div class="dw-row">
        <label class="size-xs label" for="dw-to">To:</label>
        <input id="dw-to" type="datetime-local" bind:value={toStr} class="input size-s" />
    </div>
    <div class="dw-row dw-row--interval">
        <label class="size-xs label" for="dw-interval">Every:</label>
        <select id="dw-interval" class="input size-s" bind:value={intervalHours}>
            <option value={3}>3 hours</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
        </select>
    </div>
    <div class="dw-summary size-xs">
        {departureCount} departures &times; {modelCount} model{modelCount !== 1 ? 's' : ''} = {departureCount * modelCount} routes
    </div>
</div>

<script lang="ts">
    import type { DepartureWindowConfig } from '../routing/types';

    export let modelCount: number = 1;

    // Default: now → +3 days, every 6h
    let fromStr = formatDateForInput(new Date());
    let toStr = formatDateForInput(new Date(Date.now() + 3 * 24 * 3600_000));
    let intervalHours = 6;

    $: departureCount = computeDepartureCount(fromStr, toStr, intervalHours);

    function computeDepartureCount(from: string, to: string, interval: number): number {
        const start = new Date(from).getTime();
        const end = new Date(to).getTime();
        if (isNaN(start) || isNaN(end) || end < start || interval <= 0) return 0;
        return Math.floor((end - start) / (interval * 3600_000)) + 1;
    }

    function formatDateForInput(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    export function getWindowConfig(): DepartureWindowConfig {
        return {
            windowStart: new Date(fromStr).getTime(),
            windowEnd: new Date(toStr).getTime(),
            intervalHours,
        };
    }
</script>

<style lang="less">
    .departure-window {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .dw-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .dw-row--interval {
        select {
            width: 100%;
        }
    }

    .dw-summary {
        opacity: 0.6;
        line-height: 1.4;
    }

    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 0;
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

    select.input {
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        padding-right: 24px;

        option {
            background: #1a1a2e;
            color: #e0e0e0;
        }
    }
</style>
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/DepartureWindowInput.svelte
git commit -m "feat: add DepartureWindowInput component"
```

---

### Task 8: DeparturePlannerResults Svelte Component

**Files:**
- Create: `src/ui/DeparturePlannerResults.svelte`

- [ ] **Step 1: Create the grouped results table component**

```svelte
<div class="departure-results">
    <!-- Metric toggle -->
    <div class="metric-toggle">
        <span class="size-xs toggle-label">Show:</span>
        {#each metrics as m}
            <button
                class="pill size-xs"
                class:pill--active={activeMetric === m}
                on:click={() => activeMetric = m}
            >
                {METRIC_LABELS[m]}
            </button>
        {/each}
    </div>

    <!-- Table header -->
    <div class="dp-header size-xs">
        <div class="col-depart">Depart</div>
        <div class="col-model">Model</div>
        <div class="col-bar">Conditions ({METRIC_LABELS[activeMetric]})</div>
        <div class="col-eta">ETA</div>
        <div class="col-dur">Dur.</div>
        <div class="col-motor">Mtr%</div>
    </div>

    <!-- Grouped rows -->
    {#each results as dep (dep.departureTime)}
        {@const isBest = bestDepartureTime === dep.departureTime}
        <div class="dep-group" class:dep-group--best={isBest}>
            {#each dep.modelResults as mr, modelIdx (mr.model)}
                <div
                    class="dp-row size-xs"
                    class:dp-row--selected={selectedKey === rowKey(dep.departureTime, mr.model)}
                    on:mouseenter={() => onHover(dep.departureTime, mr.model, mr)}
                    on:mouseleave={() => onHoverEnd()}
                    on:click={() => onSelect(dep.departureTime, mr.model, mr)}
                >
                    <div class="col-depart">
                        {#if modelIdx === 0}
                            {#if isBest}<span class="best-star">&#9733;</span>{/if}
                            {formatDepartureTime(dep.departureTime)}
                        {/if}
                    </div>
                    <div class="col-model">
                        <span class="model-dot" style:background={mr.color}></span>
                        {MODEL_LABELS[mr.model]}
                    </div>
                    <div class="col-bar">
                        <ConditionBar points={mr.route.path} metric={activeMetric} />
                    </div>
                    <div class="col-eta">{formatEta(mr.route.eta)}</div>
                    <div class="col-dur">{formatDuration(mr.route.durationHours)}</div>
                    <div class="col-motor">{computeMotorPercent(mr.route.path)}%</div>
                </div>
            {/each}
            {#if dep.failedModels && dep.failedModels.length > 0}
                <div class="dp-row dp-row--failed size-xs">
                    <div class="col-depart"></div>
                    <div class="col-rest">
                        &#9888; {dep.failedModels.map(m => MODEL_LABELS[m]).join(', ')} failed
                    </div>
                </div>
            {/if}
        </div>
    {/each}

    {#if results.length === 0 && !isScanning}
        <div class="no-results size-s">No departure results yet.</div>
    {/if}

    <!-- Legend -->
    {#if results.length > 0}
        <div class="dp-footer size-xs">
            Hover row to preview route &middot; Click to select
        </div>
    {/if}
</div>

<script lang="ts">
    import type { DepartureResult, ModelRouteResult, RoutePoint, WindModelId } from '../routing/types';
    import { MODEL_LABELS } from '../map/modelColors';
    import ConditionBar from './ConditionBar.svelte';
    import { METRIC_LABELS } from './conditionBarColors';
    import type { ConditionMetric } from './conditionBarColors';

    export let results: DepartureResult[] = [];
    export let isScanning: boolean = false;
    export let onRouteHover: (result: ModelRouteResult | null) => void = () => {};
    export let onRouteSelect: (result: ModelRouteResult | null) => void = () => {};

    const metrics: ConditionMetric[] = ['tws', 'sog', 'twa', 'swell'];
    let activeMetric: ConditionMetric = 'tws';
    let selectedKey: string | null = null;

    $: bestDepartureTime = findBestDeparture(results);

    function rowKey(departureTime: number, model: WindModelId): string {
        return `${departureTime}-${model}`;
    }

    function findBestDeparture(deps: DepartureResult[]): number | null {
        let bestTime: number | null = null;
        let bestDuration = Infinity;
        for (const dep of deps) {
            for (const mr of dep.modelResults) {
                if (mr.route.durationHours < bestDuration) {
                    bestDuration = mr.route.durationHours;
                    bestTime = dep.departureTime;
                }
            }
        }
        return bestTime;
    }

    function onHover(_departureTime: number, _model: WindModelId, mr: ModelRouteResult): void {
        if (selectedKey) return; // Don't hover-preview when a route is selected
        onRouteHover(mr);
    }

    function onHoverEnd(): void {
        if (selectedKey) return;
        onRouteHover(null);
    }

    function onSelect(departureTime: number, model: WindModelId, mr: ModelRouteResult): void {
        const key = rowKey(departureTime, model);
        if (selectedKey === key) {
            // Deselect
            selectedKey = null;
            onRouteSelect(null);
        } else {
            selectedKey = key;
            onRouteSelect(mr);
        }
    }

    function formatDepartureTime(ts: number): string {
        const d = new Date(ts);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatEta(ts: number): string {
        const d = new Date(ts);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatDuration(hours: number): string {
        const days = Math.floor(hours / 24);
        const hrs = Math.floor(hours % 24);
        if (days > 0) return `${days}d ${hrs}h`;
        return `${hrs}h`;
    }

    function computeMotorPercent(path: RoutePoint[]): number {
        if (path.length === 0) return 0;
        const motorCount = path.filter(p => p.isMotoring).length;
        return Math.round((motorCount / path.length) * 100);
    }
</script>

<style lang="less">
    .departure-results {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 10px;
    }

    .metric-toggle {
        display: flex;
        gap: 3px;
        align-items: center;
        margin-bottom: 10px;
    }

    .toggle-label {
        opacity: 0.5;
        margin-right: 4px;
    }

    .pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: inherit;
        padding: 3px 8px;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.15s;

        &:hover {
            opacity: 1;
        }

        &.pill--active {
            background: #4ecdc4;
            color: #000;
            opacity: 1;
            font-weight: bold;
            border-color: #4ecdc4;
        }
    }

    .dp-header {
        display: grid;
        grid-template-columns: 72px 44px 1fr 56px 44px 38px;
        gap: 6px;
        padding: 0 4px 6px;
        color: rgba(255, 255, 255, 0.4);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .dep-group {
        border-left: 2px solid transparent;
        margin-top: 2px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);

        &.dep-group--best {
            border-left-color: #4ecdc4;
            background: rgba(78, 205, 196, 0.05);
        }
    }

    .dp-row {
        display: grid;
        grid-template-columns: 72px 44px 1fr 56px 44px 38px;
        gap: 6px;
        padding: 5px 4px;
        align-items: center;
        cursor: pointer;
        transition: background 0.1s;

        &:hover {
            background: rgba(255, 255, 255, 0.06);
        }

        &.dp-row--selected {
            background: rgba(78, 205, 196, 0.12);
        }

        &.dp-row--failed {
            cursor: default;
            opacity: 0.5;

            .col-rest {
                grid-column: 2 / -1;
                color: #e9c46a;
            }
        }
    }

    .col-model {
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .model-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .best-star {
        color: #4ecdc4;
        margin-right: 2px;
    }

    .no-results {
        opacity: 0.5;
        text-align: center;
        padding: 20px 0;
    }

    .dp-footer {
        opacity: 0.4;
        margin-top: 8px;
        font-style: italic;
    }
</style>
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/DeparturePlannerResults.svelte
git commit -m "feat: add DeparturePlannerResults grouped table component"
```

---

### Task 9: Wire Up RoutingPanel — Mode Toggle and Conditional UI

**Files:**
- Modify: `src/ui/RoutingPanel.svelte`

This task adds the mode toggle to `RoutingPanel`, conditionally shows `DepartureWindowInput` vs the single departure input, changes the calculate button label, and conditionally shows `DeparturePlannerResults` vs the current results section.

- [ ] **Step 1: Add imports and mode state**

In the `<script>` block of `src/ui/RoutingPanel.svelte`, add imports near the existing imports (around line 308-320):

```typescript
// Add these imports alongside existing ones
import DepartureWindowInput from './DepartureWindowInput.svelte';
import DeparturePlannerResults from './DeparturePlannerResults.svelte';
import type { DepartureResult } from '../routing/types';
```

Add new exports and state after the existing exports (after line 352):

```typescript
export let mode: 'single' | 'departure' = 'single';
export let departureResults: DepartureResult[] = [];
export let isDepartureScanning: boolean = false;
export let onDepartureScan: () => void = () => {};
export let onDepartureRouteHover: (result: ModelRouteResult | null) => void = () => {};
export let onDepartureRouteSelect: (result: ModelRouteResult | null) => void = () => {};

let departureWindowInput: DepartureWindowInput;
```

Add a public getter for the departure window config (near `getDepartureTime` around line 422):

```typescript
export function getDepartureWindowConfig() {
    return departureWindowInput?.getWindowConfig();
}
```

- [ ] **Step 2: Add mode toggle in template**

Replace the departure time section (lines 142-154) with a mode toggle + conditional departure inputs:

```svelte
    <!-- Mode toggle -->
    <div class="section mb-10 mt-10 mode-toggle">
        <button
            class="pill size-xs"
            class:pill--active={mode === 'single'}
            on:click={() => mode = 'single'}
        >
            Single Route
        </button>
        <button
            class="pill size-xs"
            class:pill--active={mode === 'departure'}
            on:click={() => mode = 'departure'}
        >
            Departure Planner
        </button>
    </div>

    <!-- Departure time / window -->
    {#if mode === 'single'}
        <div class="section mb-15 departure-row">
            <div class="departure-input">
                <label class="size-xs label" for="departure">Departure:</label>
                <input
                    id="departure"
                    type="datetime-local"
                    bind:value={departureStr}
                    class="input size-s"
                />
            </div>
            <button class="gear-btn" on:click={() => settingsModal.open()} title="Settings">&#9881;</button>
        </div>
    {:else}
        <div class="section mb-15">
            <DepartureWindowInput
                modelCount={settingsStore.get('selectedModels').length}
                bind:this={departureWindowInput}
            />
            <button class="gear-btn gear-btn--float" on:click={() => settingsModal.open()} title="Settings">&#9881;</button>
        </div>
    {/if}
```

- [ ] **Step 3: Update calculate button label**

Replace the calculate button section (lines 157-166) with:

```svelte
    <!-- Calculate button -->
    <div class="section mb-15">
        <button
            class="button button--variant-orange size-m"
            style="width:100%"
            disabled={!canCalculate}
            on:click={handleCalculate}
        >
            {#if isRouting || isDepartureScanning}
                Cancel
            {:else if mode === 'departure'}
                Scan Departures
            {:else}
                Calculate Route
            {/if}
        </button>
    </div>
```

- [ ] **Step 4: Update handleCalculate to dispatch based on mode**

Replace the `handleCalculate` function (around line 431):

```typescript
function handleCalculate(): void {
    if (isRouting || isDepartureScanning) {
        onCancel();
    } else if (mode === 'departure') {
        onDepartureScan();
    } else {
        onCalculate();
    }
}
```

Update `canCalculate` (around line 426):

```typescript
$: canCalculate = waypointState === 'READY' && !isRouting && !isDepartureScanning;
```

- [ ] **Step 5: Add departure planner results section in template**

After the existing results sections (after line 271, before the data advisories section), add:

```svelte
    <!-- Departure planner results -->
    {#if mode === 'departure' && (departureResults.length > 0 || isDepartureScanning)}
        <DeparturePlannerResults
            results={departureResults}
            isScanning={isDepartureScanning}
            onRouteHover={onDepartureRouteHover}
            onRouteSelect={onDepartureRouteSelect}
        />
        {#if departureResults.length > 0 && !isDepartureScanning}
            <button class="button size-s mt-15" style="width:100%" on:click={handleClear}>
                Clear Results
            </button>
        {/if}
    {/if}
```

- [ ] **Step 6: Add mode toggle CSS**

Add to the `<style>` block:

```less
    /* Mode toggle */
    .mode-toggle {
        display: flex;
        gap: 4px;
    }

    .pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: inherit;
        padding: 4px 10px;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.15s;

        &:hover {
            opacity: 1;
        }

        &.pill--active {
            background: rgba(78, 205, 196, 0.2);
            border-color: #4ecdc4;
            opacity: 1;
        }
    }

    .gear-btn--float {
        position: absolute;
        right: 0;
        top: 0;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        line-height: 1;

        &:hover {
            color: rgba(255, 255, 255, 0.9);
        }
    }
```

- [ ] **Step 7: Verify the plugin builds**

Run: `npx rollup -c`
Expected: Build succeeds with no errors (warnings about Windy externals are normal)

- [ ] **Step 8: Commit**

```bash
git add src/ui/RoutingPanel.svelte
git commit -m "feat: add mode toggle and departure planner UI to RoutingPanel"
```

---

### Task 10: Wire Up plugin.svelte — Departure Scan Handler and Map Preview

**Files:**
- Modify: `src/plugin.svelte`

This task adds the departure planner state and handlers to the main plugin file, connecting `DeparturePlanner` to the UI and map.

- [ ] **Step 1: Add imports and state**

In the `<script>` block of `src/plugin.svelte`, add the import (near line 57):

```typescript
import { DeparturePlanner } from './adapters/DeparturePlanner';
import type { DepartureResult, DepartureWindowConfig } from './routing/types';
```

Add new state variables after the existing state (after line 86):

```typescript
let mode: 'single' | 'departure' = 'single';
let departureResults: DepartureResult[] = [];
let isDepartureScanning = false;
const departurePlanner = new DeparturePlanner();
```

- [ ] **Step 2: Add departure scan handler**

Add the `handleDepartureScan` function after the existing `handleCalculate` (after line 259):

```typescript
async function handleDepartureScan(): Promise<void> {
    const liveStart = waypointMgr?.getStart() ?? start;
    const liveEnd = waypointMgr?.getEnd() ?? end;
    const liveWaypoints = waypointMgr?.getWaypoints() ?? waypoints;

    if (!liveStart || !liveEnd) return;

    start = liveStart;
    end = liveEnd;
    waypoints = liveWaypoints;

    renderer.clearPreview();
    previewDistanceNm = 0;
    error = null;
    departureResults = [];
    isDepartureScanning = true;
    progressPercent = 0;
    progressStatus = 'Starting departure scan...';

    try {
        const windowConfig = routingPanel.getDepartureWindowConfig();
        if (!windowConfig) return;

        const settings = settingsStore.getAll();
        const polar = getPolarByName(settings.selectedPolarName);

        const distNm = distance(liveStart, liveEnd);
        const worstCaseVmg = settings.motorEnabled
            ? Math.min(settings.estimatedVmgKt, settings.motorSpeed)
            : settings.estimatedVmgKt;
        const estimatedHours = Math.max(24, Math.ceil(distNm / worstCaseVmg) * 2.0);
        const effectiveMaxDuration = Math.min(estimatedHours, settings.maxDuration);

        const baseOptions = {
            startTime: 0, // overridden by DeparturePlanner per departure
            timeStep: settings.timeStep,
            maxDuration: effectiveMaxDuration,
            headingStep: settings.headingStep,
            numSectors: settings.numSectors,
            arrivalRadius: settings.arrivalRadius,
            motorEnabled: settings.motorEnabled,
            motorThreshold: settings.motorThreshold,
            motorSpeed: settings.motorSpeed,
            comfortWeight: settings.comfortWeight,
            landMarginNm: settings.landMarginNm,
            preferredLandMarginNm: settings.preferredLandMarginNm,
        };

        await departurePlanner.scan(
            liveStart,
            liveEnd,
            polar,
            settings.selectedModels,
            liveWaypoints.length > 0 ? liveWaypoints : undefined,
            baseOptions,
            windowConfig,
            (status, percent) => {
                progressStatus = status;
                progressPercent = percent;
            },
            (result) => {
                departureResults = [...departureResults, result];
            },
        );
    } catch (err) {
        error = err instanceof Error ? err.message : 'Departure scan failed.';
    } finally {
        isDepartureScanning = false;
    }
}
```

- [ ] **Step 3: Add hover and select handlers for departure results**

Add after the `handleDepartureScan` function:

```typescript
function handleDepartureRouteHover(result: ModelRouteResult | null): void {
    renderer.clear();
    if (result) {
        renderer.renderRoutes([result]);
    }
}

function handleDepartureRouteSelect(result: ModelRouteResult | null): void {
    renderer.clear();
    boatMarkers.clear();
    if (result) {
        renderer.renderRoutes([result]);
        // Update results array to enable PlayerControls with the selected route
        results = [result];
    } else {
        results = [];
    }
}
```

- [ ] **Step 4: Update the cancel handler**

Modify `handleCancel` (around line 261):

```typescript
function handleCancel(): void {
    orchestrator.cancel();
    departurePlanner.cancel();
    isRouting = false;
    isDepartureScanning = false;
    progressStatus = '';
    progressPercent = 0;
}
```

- [ ] **Step 5: Update handleClear to also clear departure results**

Modify `handleClear` (around line 268):

```typescript
function handleClear(): void {
    results = [];
    departureResults = [];
    failedModels = [];
    error = null;
    renderer.clear();
    boatMarkers.clear();
    previewDistanceNm = 0;
}
```

- [ ] **Step 6: Update onDestroy to clean up departure planner**

Add `departurePlanner.destroy();` to the `onDestroy` callback (around line 380):

```typescript
onDestroy(() => {
    waypointMgr?.destroy();
    renderer.clear();
    boatMarkers.clear();
    orchestrator.destroy();
    departurePlanner.destroy();
    routeStore.unsubscribe(onRoutesChanged);
    if (originalTimestamp !== null) {
        store.set('timestamp', originalTimestamp);
    }
    if (originalProduct !== null) {
        store.set('product', originalProduct);
    }
});
```

- [ ] **Step 7: Pass new props to RoutingPanel in template**

Update the `<RoutingPanel>` tag in the template (lines 11-43) to include the new props:

```svelte
    <RoutingPanel
        {waypointState}
        {start}
        {end}
        {waypoints}
        isRouting={isRouting || isDepartureScanning}
        {previewDistanceNm}
        {progressPercent}
        {progressStatus}
        {results}
        {failedModels}
        {error}
        {warning}
        {pipelineSteps}
        {mode}
        {departureResults}
        {isDepartureScanning}
        onCalculate={handleCalculate}
        onCancel={handleCancel}
        onClear={handleClear}
        onDepartureScan={handleDepartureScan}
        onDepartureRouteHover={handleDepartureRouteHover}
        onDepartureRouteSelect={handleDepartureRouteSelect}
        onTimeChange={handlePlayerTimeChange}
        onModelSwitch={handleModelSwitch}
        onAddWaypoint={handleAddWaypoint}
        onStopAddingWaypoints={handleStopAddingWaypoints}
        onRemoveWaypoint={handleRemoveWaypoint}
        {savedRoutes}
        {suggestedRouteName}
        onSaveRoute={handleSaveRoute}
        onLoadRoute={handleLoadRoute}
        onDeleteRoute={handleDeleteRoute}
        onEditStart={handleEditStart}
        onEditEnd={handleEditEnd}
        onEditWaypoint={handleEditWaypoint}
        bind:this={routingPanel}
    />
```

- [ ] **Step 8: Verify the plugin builds**

Run: `npx rollup -c`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add src/plugin.svelte
git commit -m "feat: wire up DeparturePlanner to plugin lifecycle and map preview"
```

---

### Task 11: Run All Tests and Build

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass, including the new `DeparturePlanner.test.ts` and `conditionBarColors.test.ts`

- [ ] **Step 2: Run full build**

Run: `npx rollup -c`
Expected: Build succeeds. Both `dist/plugin.min.js` and `dist/router.worker.js` are generated.

- [ ] **Step 3: Verify no type errors**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit any fixups if needed**

If any test or build failures required fixes, commit them:

```bash
git add -A
git commit -m "fix: resolve build/test issues from departure planner integration"
```
