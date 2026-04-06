# Windy Sail Router — Design Specification

## Overview

A Windy.com plugin providing sailing weather routing inside the Windy interface. Computes optimal routes using boat polar data, time-varying wind forecasts, and land avoidance. The core differentiator is multi-model routing — comparing routes across GFS, ECMWF, ICON, and BOM ACCESS simultaneously.

**Build target:** Phase 1 (MVP). Phases 2-4 specced for future implementation.

**Key decisions made:**
- Clean-room TypeScript isochrone implementation (not a direct libweatherrouting port)
- Web Worker for routing computation from the start
- Layered architecture: UI (Svelte) / Adapters (Windy APIs) / Engine (pure TS in Worker)
- On-demand land checking with simple cache (no bounding box pre-population)
- Bavaria 38 hardcoded polar for MVP
- GPL-3.0 license

---

## Architecture

### Three-Layer Design

```
Main Thread (UI + Adapters)              |  Web Worker (Routing Engine)
                                         |
  plugin.svelte                          |
    +- RoutingPanel.svelte               |
         |                               |
         v                               |
  RoutingOrchestrator.ts                 |
    +- WindProvider.ts --> @windy/fetch   |
    +- LandChecker.ts --> @windy/fetch   |
    +- WorkerBridge.ts <----message------+-- router.worker.ts
                         ----message---->|     +- IsochroneRouter.ts
                                         |     +- Polar.ts
                                         |     +- WindGrid.ts
                                         |     +- geo.ts
```

**Why this split:**
- Windy APIs (`@windy/fetch`, `@windy/map`) can only run on the main thread
- Routing engine is pure math with zero Windy dependencies — testable in isolation
- Web Worker boundary enforces separation via message passing
- Adapters can be swapped if Windy APIs change without touching the engine

### Worker Message Protocol

| Direction | Message | Payload |
|-----------|---------|---------|
| main->worker | `START_ROUTING` | WindGridData, PolarData, start, end, options |
| worker->main | `CHECK_LAND` | `{ points: [lat,lon][], segments: [from,to][] }` |
| main->worker | `LAND_RESULTS` | `{ pointResults: boolean[], segmentResults: boolean[] }` |
| worker->main | `PROGRESS` | `{ step: number, totalSteps: number, percent: number }` |
| worker->main | `ROUTE_COMPLETE` | RouteResult (path, metadata, conditions) |
| worker->main | `ROUTE_FAILED` | `{ reason: string }` |

Each isochrone step produces one CHECK_LAND round-trip. For a 48-step route, that is 48 round-trips — message passing is fast; elevation API calls are the bottleneck.

### Data Flow (Route Calculation)

1. User clicks "Calculate Route"
2. Validate inputs (start, end set)
3. Compute bounding box (start to end + 1 degree margin)
4. WindProvider pre-fetches wind grid on 0.5 degree spacing via `getPointForecastData('gfs', ...)`
5. Serialise wind grid + polar + options, post `START_ROUTING` to Worker
6. Worker expands isochrones, sends `CHECK_LAND` per step
7. Main thread checks land via LandChecker (cache + `getElevation`), replies `LAND_RESULTS`
8. Worker prunes frontier, emits `PROGRESS`
9. On arrival or max duration, Worker sends `ROUTE_COMPLETE`
10. Main thread renders route on map, populates results panel

---

## Phase 1 — MVP (Build Target)

### Scope

- Single-model routing (GFS only)
- Click-to-set start and end on map
- Hardcoded Bavaria 38 polar
- Land avoidance via `getElevation` with on-demand cache
- Route rendered as polyline on map
- Basic results: ETA, distance, average SOG, max TWS
- Desktop `rhpane` layout only
- Web Worker for routing computation

### File Structure

```
windy-plugin-sail-router/
  src/
    plugin.svelte                  # Main plugin shell
    pluginConfig.ts                # Windy plugin configuration

    routing/
      IsochroneRouter.ts           # Core isochrone algorithm
      Polar.ts                     # Polar parsing + interpolation
      WindGrid.ts                  # Spatial/temporal wind interpolation
      types.ts                     # Shared routing types
      geo.ts                       # Geodesic math

    worker/
      router.worker.ts             # Web Worker entry point
      messages.ts                  # Message type definitions

    adapters/
      WindProvider.ts              # Fetch wind grid from Windy
      LandChecker.ts              # Elevation-based land detection + cache
      WorkerBridge.ts             # Typed Worker message wrapper
      RoutingOrchestrator.ts      # Coordinates full routing flow

    map/
      RouteRenderer.ts            # Draw route polyline + markers
      WaypointManager.ts          # Click-to-place start/end

    ui/
      RoutingPanel.svelte         # Main control panel
      ProgressBar.svelte          # Routing progress indicator

    data/
      polars/
        bavaria38.json            # Default polar data

  dist/
  package.json
  tsconfig.json
  rollup.config.js
```

### Module Details

#### IsochroneRouter.ts

Core isochrone expansion algorithm. Pure TypeScript, no external dependencies.

**Inputs:** WindGridData, PolarData, start LatLon, end LatLon, RoutingOptions
**Output:** RouteResult (path with per-point conditions, or failure reason)

Algorithm:
- Initialise frontier with start point
- Each step: expand all frontier points across 72 headings (0-360 in 5 degree increments)
- For each heading: look up wind at (t+dt, lat, lon) from WindGrid, compute TWA, get boat speed from Polar
- Advance position geodesically by (boatSpeed * dt) along heading
- Send candidate points to main thread for land validation
- Filter invalid points, prune to 72 angular sectors (keep furthest per sector)
- Check if any point is within 1nm of destination
- Max 168 steps (7 days at 1hr step)

The router does NOT call any external APIs. It operates on pre-built data structures passed via messages.

#### Polar.ts

Boat speed lookup from TWA/TWS matrix.

```typescript
interface PolarData {
  name: string;
  twaAngles: number[];      // [0, 10, 20, ..., 180]
  twsSpeeds: number[];      // [4, 6, 8, 10, 12, 14, 16, 20, 25, 30]
  speeds: number[][];       // speeds[twaIndex][twsIndex] in knots
}
```

- `getSpeed(twa: number, tws: number): number` — bilinear interpolation
- Symmetric: `speed(twa) = speed(360 - twa)`, only stores 0-180 degrees
- Returns 0 for TWA < minimum angle (no-go zone) or TWS = 0

#### WindGrid.ts

Spatial and temporal interpolation over the pre-fetched wind forecast grid.

- Stores arrays of wind_u, wind_v indexed by grid position and forecast timestamp
- `getWindAt(t: number, lat: number, lon: number): { speed: number, direction: number }`
- Bilinear spatial interpolation between 4 nearest grid points
- Linear temporal interpolation between bracketing forecast hours
- Wind speed in knots, direction in degrees (where wind comes FROM)

#### geo.ts

Geodesic utility functions using spherical earth approximation (sufficient for routing).

- `advancePosition(lat, lon, heading, distanceNm)` — returns new {lat, lon}
- `bearing(from, to)` — initial bearing in degrees
- `distance(from, to)` — great circle distance in nautical miles
- `computeTWA(boatHeading, windDirection)` — true wind angle 0-180 degrees
- `normaliseAngle(deg)` — normalise to 0-360

#### WindProvider.ts (Main Thread Adapter)

- `fetchWindGrid(model: string, bounds: LatLonBounds, options): Promise<WindGridData>`
- Pre-fetches `getPointForecastData('gfs', { lat, lon, step: 3 })` on 0.5 degree grid
- Concurrency limit: 5 simultaneous requests
- Extracts `wind_u-surface` and `wind_v-surface` from response
- Returns plain serialisable object (no classes) for Worker transfer

#### LandChecker.ts (Main Thread Adapter)

- `Map<string, boolean>` cache keyed by `${Math.round(lat*100)},${Math.round(lon*100)}`
- `checkPoints(points: [number,number][]): Promise<boolean[]>` — batch check, cache misses call `getElevation`
- `checkSegments(segments: [number,number,number,number][]): Promise<boolean[]>` — sample every 0.01 degrees along each segment
- `getElevation` returns elevation; point is sea if elevation <= 0

#### RoutingOrchestrator.ts (Main Thread)

Coordinates the full flow:
1. Validate start/end are set
2. Compute bounding box with margin
3. Call WindProvider to fetch grid (emit "Fetching weather..." status)
4. Send data to Worker via WorkerBridge
5. Handle CHECK_LAND callbacks by delegating to LandChecker
6. Forward PROGRESS to UI
7. Return RouteResult or error to UI

#### WorkerBridge.ts

- Creates and manages the Web Worker lifecycle
- `computeRoute(windGrid, polar, start, end, options): Promise<RouteResult>`
- Handles the land-check callback loop internally (Worker sends CHECK_LAND, bridge calls LandChecker, sends LAND_RESULTS back)
- Emits progress events via a callback
- `terminate()` to kill the Worker on cleanup

#### router.worker.ts

Web Worker entry point:
- Receives `START_ROUTING` message
- Instantiates IsochroneRouter with the provided data
- Runs the algorithm, sending CHECK_LAND for each step and waiting for LAND_RESULTS
- Emits PROGRESS after each step
- Sends ROUTE_COMPLETE or ROUTE_FAILED when done

#### RouteRenderer.ts

- Gets Leaflet `map` from `@windy/map`
- `renderRoute(route: RouteResult)`: draws `L.polyline` in GFS blue (#457B9D), weight 3
- Start marker: green `L.divIcon` with anchor icon
- End marker: red `L.divIcon` with flag icon
- `clear()`: removes all layers from map
- Called on route complete and on plugin destroy

#### WaypointManager.ts

- Uses `@windy/singleclick` for map click capture
- State machine: `IDLE` -> `WAITING_START` -> `WAITING_END` -> `READY`
- Places draggable `L.marker` for start and end
- On dragend, updates coordinates and notifies the UI
- `getStart()`, `getEnd()` return current LatLon or null
- `reset()` removes markers and returns to IDLE
- `destroy()` cleans up listeners and markers

#### RoutingPanel.svelte

Right-hand pane content:
- Header: "Sail Router"
- Instructions: "Click map to set start point" / "Click map to set end point" (context-sensitive)
- Start/End coordinate display (updated reactively from WaypointManager)
- Boat display: "Bavaria 38" (static text for Phase 1)
- Departure time: date/time input, defaults to now
- "Calculate Route" button (disabled until start+end set)
- ProgressBar component (shown during routing)
- Results section (shown after completion):
  - ETA (date/time)
  - Total distance (nm)
  - Average SOG (kt)
  - Max TWS encountered (kt)
  - Route duration
- "Clear Route" button to reset
- Uses Windy CSS classes for native look

#### ProgressBar.svelte

- Simple progress bar: filled div inside container
- Accepts `percent` prop (0-100)
- Status text: "Fetching weather data..." / "Computing route... X%" / "Complete"

#### pluginConfig.ts

```typescript
const config: ExternalPluginConfig = {
  name: 'windy-plugin-sail-router',
  version: '0.1.0',
  icon: '⛵',
  title: 'Sail Router',
  description: 'Weather routing for sailing with multi-model comparison',
  author: 'Brodie (appd.com.au)',
  repository: '', // Set when repo is created
  desktopUI: 'rhpane',
  mobileUI: 'fullscreen',
  routerPath: '/sail-router/:lat?/:lon?',
  listenToSingleclick: true,
  private: true,
};
```

### Routing Options (Phase 1 subset)

```typescript
interface RoutingOptions {
  startTime: number;          // Unix timestamp ms, default: Date.now()
  timeStep: number;           // hours, default: 1.0
  maxDuration: number;        // hours, default: 168 (7 days)
  headingStep: number;        // degrees, default: 5
  numSectors: number;         // pruning sectors, default: 72
  arrivalRadius: number;      // nautical miles, default: 1.0
}
```

### Route Result

```typescript
interface RouteResult {
  path: RoutePoint[];
  eta: number;                // Unix timestamp ms
  totalDistanceNm: number;
  avgSpeedKt: number;
  maxTws: number;             // knots
  durationHours: number;
}

interface RoutePoint {
  lat: number;
  lon: number;
  time: number;               // Unix timestamp ms
  twa: number;                // degrees
  tws: number;                // knots
  twd: number;                // degrees
  boatSpeed: number;          // knots
  heading: number;            // degrees
}
```

### Bavaria 38 Polar Data

Source: publicly available polar data for Bavaria 38.

TWA angles: 0, 30, 40, 52, 60, 75, 90, 110, 120, 135, 150, 165, 180 degrees
TWS speeds: 4, 6, 8, 10, 12, 14, 16, 20, 25 knots

Stored as `src/data/polars/bavaria38.json`.

### Error Handling (Phase 1)

- Wind fetch failure: display error in panel, "Failed to fetch weather data. Try again."
- No route found (max duration exceeded): "No route found within 7 days. Try a shorter passage or different departure time."
- Worker crash: catch error, display "Routing computation failed."
- Start/end on land: "Start point appears to be on land. Please adjust." (check on route start)
- All errors shown in the results area of RoutingPanel. No silent failures.

### Disclaimer

Displayed at the bottom of the panel at all times:
"Routes are advisory only. Not a substitute for proper passage planning and seamanship."

---

## Phase 2 — Multi-Model + Polars (Future)

### Features

- **Multi-model routing:** Run isochrone algorithm against ECMWF, GFS, ICON, BOM ACCESS, BOM ACCESS-SY in parallel
- **Colour-coded route comparison:** Each model's route drawn with distinct colour
  - ECMWF: #E63946 (red), GFS: #457B9D (blue), ICON: #2A9D8F (teal), BOM ACCESS: #E9C46A (gold), BOM ACCESS-SY: #F4A261 (orange, dashed)
- **Comparison table:** Side-by-side ETA, distance, avg SOG, max TWS per model
- **Polar selector:** Dropdown with bundled boats (Bavaria 38, Jeanneau SO 440, Beneteau Oceanis 45)
- **Custom polar upload:** Parse CSV/JSON polar files, validate, store in localStorage
- **Route annotations:** DivIcon markers every 6 hours along each route showing TWS, TWD, SOG, COG, ETA
- **Isochrone visualisation:** Toggle to show isochrone wavefronts as semi-transparent polygons

### New/Modified Files

- `ui/ModelPicker.svelte` — checkbox group for weather model selection
- `ui/PolarSelector.svelte` — dropdown + upload button
- `ui/RouteResults.svelte` — comparison table, replaces simple results
- `ui/RouteComparison.svelte` — expanded side-by-side view
- `map/IsochroneRenderer.ts` — draw isochrone polygons
- `map/AnnotationRenderer.ts` — place 6-hour condition markers
- `data/polars/jeanneau-so440.json`
- `data/polars/beneteau-oceanis45.json`
- Modify `RoutingOrchestrator.ts` to run multiple models in parallel
- Modify `WorkerBridge.ts` to manage multiple Worker instances (one per model)

### Implementation Notes

- Each model gets its own Worker instance for true parallelism
- Wind grids fetched in parallel for all selected models
- LandChecker cache is shared across all models (land doesn't vary by weather model)
- Progress bar shows per-model progress or aggregate

---

## Phase 3 — Currents + Safety (Future)

### Features

- **CMEMS current integration:** Fetch ocean current vectors via `getPointForecastData('cmems', ...)`, add to boat velocity: `SOG = polar_speed + current_vector`
- **Wave data:** Fetch from ecmwfWaves or gfsWaves, display wave height/period/direction along route
- **Wave speed penalty:** Optional scaling factor when wave height exceeds threshold
- **Safety constraints:**
  - Max wind speed limit (reject points above threshold)
  - Max wave height limit
  - Min wind speed (treat as 0 SOG / drifting)
  - Night sailing penalty (speed multiplier 0-1 between sunset/sunrise)
- **Intermediate waypoints:** Multi-leg routing — click on route to insert waypoint, drag to adjust, route computed leg-by-leg
- **Route timeline:** Horizontal scrollable view showing TWS, TWD, SOG, waves at each hour along the route
- **GPX export:** Download route as GPX file with waypoints and weather annotations
- **GeoJSON export:** Download routes as GeoJSON FeatureCollection
- **Mobile layout:** Fullscreen panel with collapsible sections

### New/Modified Files

- `adapters/CurrentProvider.ts` — fetch CMEMS current grid
- `adapters/WaveProvider.ts` — fetch wave forecast data
- `ui/SettingsPanel.svelte` — safety limits, current/wave toggles
- `ui/RouteTimeline.svelte` — horizontal condition timeline
- `ui/WaypointList.svelte` — ordered list of intermediate waypoints
- `export/GpxExporter.ts` — generate GPX XML
- `export/GeoJsonExporter.ts` — generate GeoJSON
- Modify routing types to include current vector and wave data
- Modify IsochroneRouter to accept current data and safety constraints
- Modify WaypointManager for multi-waypoint support

### Routing Options Additions

```typescript
interface RoutingOptionsPhase3 extends RoutingOptions {
  maxWindSpeed: number | null;      // knots
  maxWaveHeight: number | null;     // metres
  minWindSpeed: number | null;      // knots
  nightSailingPenalty: number;      // 0-1, default 1.0
  useCurrent: boolean;              // default true
  useWavePenalty: boolean;          // default false
  waveSpeedFactor: number;          // 0-1
  models: ModelId[];                // which models to route
}
```

---

## Phase 4 — Polish + Community (Future)

### Features

- **Polar editor/viewer:** Interactive polar diagram display within the plugin, edit individual cells
- **Sail configuration presets:** Light air, heavy air, storm — each applies a speed scaling factor to the polar
- **Night sailing penalty option:** Configurable in settings
- **Share route via URL:** Encode route parameters in URL hash, reconstruct on load via `routerPath`
- **Community polar library:** Curated list of boat polars hosted as JSON, fetchable by the plugin
- **Publish to Windy plugin gallery:** Remove `private: true`, set up GitHub Actions publishing workflow
- **Performance optimisations:** Tune grid density, heading resolution, caching for longer routes
- **Accessibility:** Keyboard navigation for the panel, screen reader labels

### New/Modified Files

- `ui/PolarEditor.svelte` — interactive polar diagram with editable cells
- `ui/SailPresets.svelte` — preset selector (light/heavy/storm)
- `data/polar-library-index.json` — manifest of community polars
- Modify pluginConfig to `private: false`
- Add `.github/workflows/publish-plugin.yml`

---

## Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `getElevation` rate limiting | Routing stalls near coast | On-demand cache, only check visited points |
| `getPointForecastData` rate limiting | Can't pre-fetch grid | Reduce grid density, batch with delays, concurrency limit of 5 |
| Client-side computation too slow for long routes | Poor UX | Web Worker from day 1, reduce heading resolution if needed |
| Windy plugin API changes | Plugin breaks | Pin to known API patterns, minimal coupling via adapter layer |
| Polar data accuracy | Bad routing suggestions | Advisory disclaimer, allow custom polars in Phase 2 |
| Web Worker message passing overhead for land checks | Slow routing | Batch all candidates per step in single message |
| Wind grid too coarse at 0.5 degrees | Inaccurate coastal routing | Can reduce to 0.25 degrees if API allows, or use interpolator fallback |

---

## Licensing

- Plugin code: GPL-3.0 (algorithm derived from libweatherrouting concepts)
- Windy weather data: used client-side only within plugin environment
- Polar data: sourced from public domain / community sources
- Disclaimer displayed in UI at all times
