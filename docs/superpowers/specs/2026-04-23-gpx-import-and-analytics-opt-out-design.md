# GPX/RTZ Import + Analytics Opt-Out — Design

**Date:** 2026-04-23
**Status:** Approved for implementation

Two small, independent features:

1. Import a GPX or RTZ file to populate start, finish, and intermediate waypoints.
2. A Settings toggle letting users opt out of anonymous analytics.

---

## 1. GPX / RTZ Import

### Goal

Let the user load a route from an external planner (Navionics, OpenCPN, ECDIS, etc.) instead of clicking each point on the map. First point becomes start, last becomes finish, everything in between is a waypoint.

### Supported formats

| Format | Element to read |
|---|---|
| GPX `<rte>` | `<rtept lat lon>` children (primary — round-trips with our own exporter) |
| GPX `<wpt>` list | standalone `<wpt lat lon>` elements, in document order (fallback when no `<rte>` present) |
| RTZ (IEC 61174) | `<route><waypoints><waypoint><position lat lon/></waypoint>…` |

Track points (`<trkpt>`) are **not** supported. A track typically has hundreds of points and needs a sampling heuristic to reduce to a routable plan; out of scope for this pass.

### New module: `src/import/routeImport.ts`

```ts
export interface ImportedRoute {
    start: LatLon;
    end: LatLon;
    waypoints: LatLon[];
    name?: string;       // from <metadata><name> or <rte><name> or <route routeName>
    warning?: string;    // e.g. "route has 12 waypoints (over the usual 5)"
}

export class RouteImportError extends Error {
    constructor(public code: 'invalid-xml' | 'no-points' | 'too-few-points' | 'out-of-range' | 'unknown-format', message: string);
}

export function parseRouteFile(filename: string, xml: string): ImportedRoute;
export function parseGpx(xml: string): ImportedRoute;
export function parseRtz(xml: string): ImportedRoute;
```

- `parseRouteFile` picks by extension (`.gpx` / `.rtz`); if the extension is unrecognized it sniffs the root element name (`gpx` vs `route`).
- Uses browser `DOMParser`. No new dependencies.
- Validation rules, in order:
    1. Well-formed XML (otherwise `invalid-xml`).
    2. ≥2 points extracted (otherwise `too-few-points`).
    3. Every coord in `lat ∈ [-90, 90]`, `lon ∈ [-180, 180]` (otherwise `out-of-range`).
- Returns the first point as `start`, last as `end`, middles as `waypoints` (in order).
- If `waypoints.length > 5`, populates `warning` (does not throw — caller decides what to do).

### UI integration — `RoutingPanel.svelte`

**Placement:** a small secondary button, `Import GPX / RTZ`, shown in the `WAITING_START` state next to the existing `Use my location` button (around line 6). Only visible in this state; once the user has placed start/end or loaded a saved route, the Import button is gone. To re-import, the user clicks `Clear Route` first.

**Flow:**
1. Hidden `<input type="file" accept=".gpx,.rtz" />` in the template. Button click triggers `.click()`.
2. On file change: read as text (`file.text()`), call `parseRouteFile`.
3. On error: set the existing `error` string in the panel (reuses the block already rendered around `RoutingPanel.svelte:257`).
4. On success:
    - If `warning` present, call `confirm(warning + ' Proceed?')`. If user cancels, abort.
    - Apply via the existing edit handlers: `onEditStart(result.start)`, `onEditEnd(result.end)`, then one `onEditWaypoint(i, wp)` per waypoint. This routes through the same land-check plumbing as manual placement — no parallel code path.
    - If `result.name`, seed `saveRouteName` so the Save flow pre-fills.

**Why reuse the edit handlers:** all the land-check, out-of-bounds handling, and marker placement already lives there. The file is just a different driver for the same operations.

### i18n additions (`src/i18n/en.ts`)

```
routing.importFile:           "Import GPX / RTZ"
routing.importWaypointWarning: "This route has {count} waypoints — more than usual. Proceed?"
routing.importErrorInvalidXml: "Could not read file — not valid GPX or RTZ."
routing.importErrorNoPoints:   "File contains no route points."
routing.importErrorTooFew:     "File must contain at least a start and finish point."
routing.importErrorOutOfRange: "File contains invalid coordinates."
```

### Tests — `tests/routeImport.test.ts`

- Round-trip: feed the output of `buildGpx()` back into `parseGpx()`; start/end/waypoints match.
- GPX with only `<wpt>` (no `<rte>`): parses as ordered list.
- Minimal RTZ fixture: start + end + 1 waypoint parses correctly.
- Malformed XML → `invalid-xml`.
- Single-point file → `too-few-points`.
- `<rtept lat="91" …>` → `out-of-range`.
- 6-waypoint route → `warning` populated, no throw.

---

## 2. Analytics Opt-Out

### Goal

Default-on anonymous analytics (current behavior), but let the user turn it off in Settings. Toggling off takes effect immediately. Toggling on takes effect on next reload (we do not dynamically inject the GA script after the fact — simpler and the user will reload anyway when they resume using the plugin).

### Setting

Add to `UserSettings` in `src/routing/types.ts`:

```ts
analyticsEnabled: boolean; // default: true
```

Added to `DEFAULT_SETTINGS`. The `SettingsStore.load()` merge (`SettingsStore.ts:33`) back-fills the key for existing users → they default to opted-in, matching current behavior.

Syncs via the existing cloud-settings sync with no special handling.

### `src/analytics.ts` changes

```ts
const GA_ID = 'G-JJ4VC3LNC0';
const DISABLE_KEY = `ga-disable-${GA_ID}`;

export function initAnalytics(): void {
    if (!settingsStore.get('analyticsEnabled')) {
        (window as any)[DISABLE_KEY] = true;
        return; // never load the GA script
    }
    // …existing init…
}

export function trackEvent(name: string, params?: …): void {
    if (!settingsStore.get('analyticsEnabled')) return;
    // …existing push…
}
```

Also: when the user toggles the setting **off** mid-session, set `window[DISABLE_KEY] = true` immediately (in the settings change handler, or — simpler — just the `trackEvent` gate is enough since our only caller is our own code). Belt-and-suspenders: set the flag in the Settings modal's toggle handler too.

### UI — `SettingsModal.svelte`

New section at the bottom of the modal body (after the Advanced collapsible), styled the same as existing sections:

```
─ Privacy ─────────────────────────
☑ Share anonymous usage analytics  (i)
  ↳ tooltip: "Helps improve the plugin. No personal data is collected.
             Changes take effect on next reload."
```

Wired identically to the existing `showIsochrones` toggle (`SettingsModal.svelte:94-97`) — a `toggleAnalytics()` function that sets the store and updates local state.

### i18n additions

```
settings.sectionPrivacy:        "Privacy"
settings.analyticsEnabled:      "Share anonymous usage analytics"
settings.infoAnalyticsEnabled:  "Helps improve the plugin. No personal data is collected. Changes take effect on next reload."
```

### Tests — `tests/analytics.test.ts`

- Setting `false` before `initAnalytics()` → no `<script>` appended; `window['ga-disable-G-JJ4VC3LNC0'] === true`.
- Setting `false` → `trackEvent('foo')` does not push to `sailDataLayer`.
- Setting `true` → `initAnalytics()` appends the GA script and `trackEvent` pushes as today.

---

## Out of scope (explicit)

- Track (`<trkpt>`) import with simplification.
- Multi-route GPX files (if multiple `<rte>` present, we read the first).
- RTE/RTZ export (we already export GPX; RTZ export is not needed).
- A "re-enable" flow that dynamically injects the GA script mid-session without reload.
- Granular analytics categories (all-or-nothing is fine for a plugin this size).
