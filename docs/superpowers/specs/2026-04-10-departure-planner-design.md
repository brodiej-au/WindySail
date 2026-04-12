# Departure Planner — Design Spec

## Overview

Find the optimal departure time for a passage by running routes at multiple start times across a user-defined window. Results are displayed in a grouped table with smooth gradient condition bars, allowing quick visual comparison across departure times and weather models.

## User Flow

1. User sets start/end points and optional waypoints on the map (same as today)
2. User toggles from **Single Route** mode to **Departure Planner** mode
3. User configures a departure window: **From** datetime, **To** datetime, **Every** N hours (3h, 6h, 12h, 24h)
4. User clicks **Scan Departures**
5. System computes routes for each departure time × each selected weather model
6. Results stream into a grouped table as each departure completes
7. User hovers rows to preview routes on the map, clicks to select and lock a route for detailed inspection

## Architecture

### DeparturePlanner (new class — `src/adapters/DeparturePlanner.ts`)

Orchestration loop that composes existing infrastructure:

- **Input:** start, end, waypoints, polar, models, routing options, `DepartureWindowConfig`
- **Generates** departure times from `windowStart` to `windowEnd` at `intervalHours` spacing
- **For each departure time:** calls `RoutingOrchestrator.computeRoutes()` with that `startTime`
- **Streams results** via an `onDepartureComplete` callback as each departure finishes
- **Returns:** `DepartureResult[]` sorted by departure time
- **Cancellation:** `cancel()` stops the current orchestrator run and skips remaining departures

Wind and ocean data caching is handled by the existing `WindCache` and `OceanCache` — overlapping forecast windows between nearby departure times are reused automatically.

### Data Flow

```
DeparturePlanner
  └─ for each departureTime in window:
       └─ RoutingOrchestrator.computeRoutes(startTime=departureTime, ...)
            ├─ WindProvider (sequential per model, cached)
            ├─ OceanDataProvider (swell + currents, cached)
            └─ WorkerBridge × N models (parallel per model)
                 └─ IsochroneRouter (in web worker)
```

No changes to the routing engine, workers, wind/ocean providers, or land checker.

## New Types (`src/routing/types.ts`)

```typescript
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

## UI Design

### Mode Toggle

A toggle near the departure time / calculate button area switches between:
- **Single Route** (default, current behavior)
- **Departure Planner** (new)

### Departure Window Input (`DepartureWindowInput.svelte`)

Replaces the single `datetime-local` input when in planner mode:
- **From:** `datetime-local` (defaults to now)
- **To:** `datetime-local` (defaults to +3 days)
- **Every:** dropdown — 3h, 6h, 12h, 24h
- Summary text: "8 departures × 2 models = 16 routes"

### Calculate Button

Changes label to **"Scan Departures"** in planner mode.

### Progress

The existing progress area shows overall scan progress:
- "Departure 3/8 — Computing routes..."
- Progress bar spans the full scan

### Results Table (`DeparturePlannerResults.svelte`)

Replaces the current results section when in planner mode.

**Layout:**
- **Metric toggle** at top: pill buttons for TWS | SOG | TWA | Swell
- **Table columns:** Departure time | Model | Condition bar | ETA | Duration | Motor%
- **Rows grouped by departure time:** each departure is a visual group containing one row per weather model
- **Best departure** highlighted with accent border — the departure group whose fastest model result has the shortest duration
- **Rows stream in** as departures complete

**Hover:** hovering a row renders that model's route on the map via `RouteRenderer`
**Click:** clicking locks the route — shows it on the map, enables `PlayerControls` and `RouteDetailModal` for full inspection

### Condition Gradient Bars (`ConditionBar.svelte`)

A `<canvas>` element per row. For each `RoutePoint` in the path (~1hr intervals), map the active metric to a color and draw a vertical stripe. Canvas stretches to fill the column for a smooth gradient.

**Color scales:**
- **TWS:** Green (8-12kt) → Yellow (15-20kt) → Red (25kt+), Blue for calms/motoring
- **SOG:** Green (good VMG) → Yellow (slow) → Red (stalled)
- **TWA:** Green (broad reach/run 90-180°) → Yellow (close hauled ~50-60°) → Red (hard on wind <40°)
- **Swell:** Green (<1m) → Yellow (1-2m) → Red (3m+)

## File Changes

### New Files
- `src/adapters/DeparturePlanner.ts` — departure scan orchestration
- `src/ui/DeparturePlannerResults.svelte` — grouped results table
- `src/ui/ConditionBar.svelte` — canvas gradient bar component
- `src/ui/DepartureWindowInput.svelte` — from/to/interval inputs
- `tests/adapters/DeparturePlanner.test.ts` — departure time generation, callback ordering, cancellation

### Modified Files
- `src/routing/types.ts` — add `DepartureWindowConfig`, `DepartureResult`
- `src/plugin.svelte` — add mode state (`'single' | 'departure'`), wire up `DeparturePlanner`, handle hover-to-preview
- `src/ui/RoutingPanel.svelte` — add mode toggle, conditionally render departure window vs single input, conditionally render planner results vs current results

### Unchanged
- Routing engine (`IsochroneRouter`, `Polar`, `WindGrid`, worker code)
- Adapters (`WindProvider`, `OceanDataProvider`, `LandChecker`, `WorkerBridge`)
- Stores (`SettingsStore`, `RouteStore`)
- Map renderers (`RouteRenderer`, `WaypointManager`, `BoatMarkerManager`)

## Performance Considerations

- No artificial cap on departure count — user controls via window + interval
- Results stream incrementally as each departure completes
- Wind/ocean caching handles overlapping forecast windows between departures
- Cancellation stops in-flight routing and skips remaining departures
- Each route uses the existing web worker, keeping the UI responsive

## Edge Cases

- **Forecast coverage:** Later departures may exceed the forecast horizon. `RoutingOrchestrator` already handles `maxDuration` capping; departures that can't produce a route due to insufficient data are reported as failed within their `DepartureResult`.
- **All departures fail:** Show an error message similar to current "All models failed" handling.
- **Single model selected:** Table still groups by departure time, just one row per group.
- **Mode switch while results shown:** Switching back to Single Route mode hides planner results (and vice versa). Route data is kept in memory until explicitly cleared.
