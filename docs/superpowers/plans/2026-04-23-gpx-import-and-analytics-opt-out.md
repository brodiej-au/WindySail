# GPX/RTZ Import + Analytics Opt-Out Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two small features: (1) a "Import GPX / RTZ" button that populates start / finish / waypoints from an external route file; (2) a Privacy toggle in Settings to opt out of anonymous analytics.

**Architecture:** Feature 1 adds a new pure module `src/import/routeImport.ts` with regex-based parsers (no DOM dep, works in node tests and browser). The RoutingPanel's existing edit handlers (`onEditStart` / `onEditEnd` / `onEditWaypoint`) are reused as the application driver — the file just feeds them the coordinates. Feature 2 adds `analyticsEnabled: boolean` to `UserSettings`, gates `initAnalytics()` / `trackEvent()` on it, and adds a Privacy section at the bottom of `SettingsModal.svelte`. Both features land behind existing cloud-settings sync with no backend changes.

**Tech Stack:** TypeScript, Svelte, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-23-gpx-import-and-analytics-opt-out-design.md`

---

## File Structure

**New files:**
- `src/import/routeImport.ts` — parsers + `parseRouteFile` dispatcher + `RouteImportError` + `ImportedRoute` type
- `tests/import/routeImport.test.ts` — unit tests for all parsers + dispatcher + validation
- `tests/fixtures/import-wpt-only.gpx` — sample GPX with only `<wpt>` elements
- `tests/fixtures/import-route.rtz` — minimal RTZ sample
- `tests/analytics.test.ts` — opt-out behavior

**Files to modify:**
- `src/routing/types.ts` — add `analyticsEnabled` to `UserSettings` + `DEFAULT_SETTINGS`
- `src/analytics.ts` — gate `initAnalytics()` and `trackEvent()` on the setting
- `src/i18n/en.ts` — add strings for import button, warnings, errors, and Privacy settings section
- `src/ui/SettingsModal.svelte` — add Privacy section with analytics checkbox
- `src/ui/RoutingPanel.svelte` — add "Import GPX / RTZ" button + hidden file input + handler in `WAITING_START` state

---

## Part A — Import module

The parsers work on the subset of GPX/RTZ attributes we care about (`lat`, `lon`, optional `<name>`). Using regex keeps the module environment-agnostic (no `DOMParser` — which isn't present in vitest's default node env) and dependency-free.

### Task 1: Create `routeImport.ts` with GPX `<rte>` parser

**Files:**
- Create: `src/import/routeImport.ts`
- Create: `tests/import/routeImport.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/import/routeImport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseGpx, RouteImportError } from '../../src/import/routeImport';

describe('parseGpx — <rte> routes', () => {
    it('parses the exporter round-trip fixture', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/route-3wpt.gpx'), 'utf8');
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: -33.6012, lon: 151.3098 });
        expect(r.end).toEqual({ lat: -33.8523, lon: 151.2108 });
        expect(r.waypoints).toEqual([{ lat: -33.8210, lon: 151.4400 }]);
        expect(r.name).toBe('Pittwater to Sydney Harbour');
    });

    it('accepts lon/lat order reversed in attribute list', () => {
        const xml = `<?xml version="1.0"?><gpx><rte>
            <rtept lon="10.5" lat="45.1"/>
            <rtept lat="46.2" lon="11.6"/>
        </rte></gpx>`;
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: 45.1, lon: 10.5 });
        expect(r.end).toEqual({ lat: 46.2, lon: 11.6 });
        expect(r.waypoints).toEqual([]);
    });

    it('prefers <metadata><name> over <rte><name> for route name', () => {
        const xml = `<?xml version="1.0"?><gpx>
            <metadata><name>My Plan</name></metadata>
            <rte><name>Sail Router plan</name>
                <rtept lat="0" lon="0"/><rtept lat="1" lon="1"/>
            </rte></gpx>`;
        expect(parseGpx(xml).name).toBe('My Plan');
    });

    it('falls back to <rte><name> when no metadata name', () => {
        const xml = `<?xml version="1.0"?><gpx>
            <rte><name>Leg 1</name>
                <rtept lat="0" lon="0"/><rtept lat="1" lon="1"/>
            </rte></gpx>`;
        expect(parseGpx(xml).name).toBe('Leg 1');
    });

    it('throws too-few-points for a single rtept', () => {
        const xml = `<?xml version="1.0"?><gpx><rte><rtept lat="0" lon="0"/></rte></gpx>`;
        expect(() => parseGpx(xml)).toThrow(RouteImportError);
        try { parseGpx(xml); } catch (e) {
            expect((e as RouteImportError).code).toBe('too-few-points');
        }
    });

    it('throws out-of-range for lat > 90', () => {
        const xml = `<?xml version="1.0"?><gpx><rte>
            <rtept lat="91" lon="0"/><rtept lat="0" lon="0"/>
        </rte></gpx>`;
        try { parseGpx(xml); } catch (e) {
            expect((e as RouteImportError).code).toBe('out-of-range');
        }
    });

    it('populates warning for more than 5 waypoints (6+ intermediates = 8+ total)', () => {
        const pts = Array.from({ length: 8 }, (_, i) => `<rtept lat="${i}" lon="${i}"/>`).join('');
        const xml = `<?xml version="1.0"?><gpx><rte>${pts}</rte></gpx>`;
        const r = parseGpx(xml);
        expect(r.waypoints.length).toBe(6);
        expect(r.warning).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: FAIL — module `../../src/import/routeImport` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/import/routeImport.ts`:

```ts
import type { LatLon } from '../routing/types';

export interface ImportedRoute {
    start: LatLon;
    end: LatLon;
    waypoints: LatLon[];
    name?: string;
    warning?: string;
}

export type RouteImportErrorCode =
    | 'invalid-xml'
    | 'no-points'
    | 'too-few-points'
    | 'out-of-range'
    | 'unknown-format';

export class RouteImportError extends Error {
    constructor(public code: RouteImportErrorCode, message: string) {
        super(message);
        this.name = 'RouteImportError';
    }
}

const WAYPOINT_WARN_THRESHOLD = 5;

/**
 * Extracts lat/lon attribute values from a tag like `<rtept lat=".." lon=".."/>`.
 * Accepts either attribute order and either quote style. Returns null for invalid.
 */
function extractLatLon(tag: string): LatLon | null {
    const latMatch = tag.match(/\blat\s*=\s*["']([^"']+)["']/);
    const lonMatch = tag.match(/\blon\s*=\s*["']([^"']+)["']/);
    if (!latMatch || !lonMatch) return null;
    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon };
}

/**
 * Extracts text content of the first `<tagName>...</tagName>` match, trimmed.
 * Returns null if not found. `scope` optionally limits the search to a substring.
 */
function extractText(xml: string, tagName: string, scope?: string): string | null {
    const haystack = scope ?? xml;
    const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const m = haystack.match(re);
    return m ? decodeEntities(m[1]).trim() : null;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

/**
 * Build an ImportedRoute from an in-order list of points, validating counts
 * and coordinate ranges. Adds a `warning` when intermediates exceed the threshold.
 */
function buildRoute(points: LatLon[], name?: string): ImportedRoute {
    if (points.length === 0) {
        throw new RouteImportError('no-points', 'File contains no route points.');
    }
    if (points.length < 2) {
        throw new RouteImportError('too-few-points', 'Route needs at least a start and finish.');
    }
    for (const p of points) {
        if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) {
            throw new RouteImportError('out-of-range', `Coord out of range: ${p.lat},${p.lon}`);
        }
    }
    const waypoints = points.slice(1, -1);
    const route: ImportedRoute = {
        start: points[0],
        end: points[points.length - 1],
        waypoints,
    };
    if (name) route.name = name;
    if (waypoints.length > WAYPOINT_WARN_THRESHOLD) {
        route.warning = `This route has ${waypoints.length} waypoints — more than the usual 5.`;
    }
    return route;
}

export function parseGpx(xml: string): ImportedRoute {
    // Pull every <rtept ...> (self-closing or with children) from the first <rte>.
    const rteBlockMatch = xml.match(/<rte\b[\s\S]*?<\/rte>/i);
    const points: LatLon[] = [];
    if (rteBlockMatch) {
        const rteBlock = rteBlockMatch[0];
        const tagRe = /<rtept\b[^>]*?\/?>/gi;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(rteBlock)) !== null) {
            const p = extractLatLon(m[0]);
            if (p) points.push(p);
        }
    }
    // Name resolution: <metadata><name> (global) wins over <rte><name>.
    let name: string | undefined;
    const metaMatch = xml.match(/<metadata\b[\s\S]*?<\/metadata>/i);
    if (metaMatch) {
        const n = extractText(metaMatch[0], 'name');
        if (n) name = n;
    }
    if (!name && rteBlockMatch) {
        const n = extractText(rteBlockMatch[0], 'name');
        if (n) name = n;
    }
    return buildRoute(points, name);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: PASS for all tests in the `parseGpx — <rte> routes` block.

- [ ] **Step 5: Commit**

```bash
git add src/import/routeImport.ts tests/import/routeImport.test.ts
git commit -m "feat(import): parse GPX <rte> routes" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add GPX `<wpt>`-only fallback

**Files:**
- Modify: `src/import/routeImport.ts`
- Modify: `tests/import/routeImport.test.ts`
- Create: `tests/fixtures/import-wpt-only.gpx`

- [ ] **Step 1: Write the failing tests and fixture**

Create `tests/fixtures/import-wpt-only.gpx`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TestTool" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="-33.6012" lon="151.3098"><name>Pittwater</name></wpt>
  <wpt lat="-33.8210" lon="151.4400"><name>Turn</name></wpt>
  <wpt lat="-33.8523" lon="151.2108"><name>Sydney</name></wpt>
</gpx>
```

Append to `tests/import/routeImport.test.ts`:

```ts
describe('parseGpx — <wpt>-only fallback', () => {
    it('parses waypoints in document order when no <rte>', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/import-wpt-only.gpx'), 'utf8');
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: -33.6012, lon: 151.3098 });
        expect(r.end).toEqual({ lat: -33.8523, lon: 151.2108 });
        expect(r.waypoints).toEqual([{ lat: -33.8210, lon: 151.4400 }]);
    });

    it('prefers <rte> over <wpt> when both are present', () => {
        const xml = `<?xml version="1.0"?><gpx>
            <wpt lat="10" lon="10"/><wpt lat="11" lon="11"/>
            <rte><rtept lat="0" lon="0"/><rtept lat="1" lon="1"/></rte>
        </gpx>`;
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: 0, lon: 0 });
        expect(r.end).toEqual({ lat: 1, lon: 1 });
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: New `<wpt>-only fallback` tests FAIL ("too-few-points" for the fallback file because no `<rte>` was found and no `<wpt>` path exists yet).

- [ ] **Step 3: Add the fallback in `parseGpx`**

In `src/import/routeImport.ts`, update `parseGpx` to fall back to `<wpt>` when no `<rte>` produced points:

```ts
export function parseGpx(xml: string): ImportedRoute {
    const rteBlockMatch = xml.match(/<rte\b[\s\S]*?<\/rte>/i);
    const points: LatLon[] = [];
    if (rteBlockMatch) {
        const tagRe = /<rtept\b[^>]*?\/?>/gi;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(rteBlockMatch[0])) !== null) {
            const p = extractLatLon(m[0]);
            if (p) points.push(p);
        }
    }
    if (points.length === 0) {
        // Fallback: <wpt> list in document order
        const wptRe = /<wpt\b[^>]*?(?:\/>|>[\s\S]*?<\/wpt>)/gi;
        let m: RegExpExecArray | null;
        while ((m = wptRe.exec(xml)) !== null) {
            const p = extractLatLon(m[0]);
            if (p) points.push(p);
        }
    }
    let name: string | undefined;
    const metaMatch = xml.match(/<metadata\b[\s\S]*?<\/metadata>/i);
    if (metaMatch) {
        const n = extractText(metaMatch[0], 'name');
        if (n) name = n;
    }
    if (!name && rteBlockMatch) {
        const n = extractText(rteBlockMatch[0], 'name');
        if (n) name = n;
    }
    return buildRoute(points, name);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/routeImport.ts tests/import/routeImport.test.ts tests/fixtures/import-wpt-only.gpx
git commit -m "feat(import): fall back to <wpt> list when GPX has no <rte>" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Add RTZ parser

**Files:**
- Modify: `src/import/routeImport.ts`
- Modify: `tests/import/routeImport.test.ts`
- Create: `tests/fixtures/import-route.rtz`

- [ ] **Step 1: Create the RTZ fixture and write failing tests**

Create `tests/fixtures/import-route.rtz`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<route version="1.2" xmlns="http://www.cirm.org/RTZ/1/2" routeName="Harbour Run">
  <routeInfo vesselName="TestBoat"/>
  <waypoints>
    <defaultWaypoint><leg/></defaultWaypoint>
    <waypoint id="1" name="Start">
      <position lat="-33.6012" lon="151.3098"/>
    </waypoint>
    <waypoint id="2" name="Turn">
      <position lat="-33.8210" lon="151.4400"/>
    </waypoint>
    <waypoint id="3" name="Finish">
      <position lat="-33.8523" lon="151.2108"/>
    </waypoint>
  </waypoints>
</route>
```

Append to `tests/import/routeImport.test.ts`:

```ts
import { parseRtz } from '../../src/import/routeImport';

describe('parseRtz', () => {
    it('parses minimal RTZ with start, waypoint, finish', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/import-route.rtz'), 'utf8');
        const r = parseRtz(xml);
        expect(r.start).toEqual({ lat: -33.6012, lon: 151.3098 });
        expect(r.end).toEqual({ lat: -33.8523, lon: 151.2108 });
        expect(r.waypoints).toEqual([{ lat: -33.8210, lon: 151.4400 }]);
        expect(r.name).toBe('Harbour Run');
    });

    it('reads name from <route routeName="...">', () => {
        const xml = `<?xml version="1.0"?><route routeName="Alpha">
            <waypoints>
                <waypoint><position lat="0" lon="0"/></waypoint>
                <waypoint><position lat="1" lon="1"/></waypoint>
            </waypoints>
        </route>`;
        expect(parseRtz(xml).name).toBe('Alpha');
    });

    it('throws too-few-points when only one <position>', () => {
        const xml = `<?xml version="1.0"?><route>
            <waypoints><waypoint><position lat="0" lon="0"/></waypoint></waypoints>
        </route>`;
        try { parseRtz(xml); } catch (e) {
            expect((e as RouteImportError).code).toBe('too-few-points');
        }
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: `parseRtz` tests FAIL — function not exported.

- [ ] **Step 3: Add `parseRtz`**

Append to `src/import/routeImport.ts`:

```ts
export function parseRtz(xml: string): ImportedRoute {
    const wpBlockMatch = xml.match(/<waypoints\b[\s\S]*?<\/waypoints>/i);
    const points: LatLon[] = [];
    if (wpBlockMatch) {
        // Each <waypoint>...</waypoint> block contains a <position lat=".." lon=".."/>.
        // We also tolerate self-closing <position/>.
        const wpRe = /<waypoint\b[\s\S]*?<\/waypoint>/gi;
        let m: RegExpExecArray | null;
        while ((m = wpRe.exec(wpBlockMatch[0])) !== null) {
            const posMatch = m[0].match(/<position\b[^>]*?\/?>/i);
            if (!posMatch) continue;
            const p = extractLatLon(posMatch[0]);
            if (p) points.push(p);
        }
    }
    // Name: <route routeName="...">
    const nameAttrMatch = xml.match(/<route\b[^>]*?\brouteName\s*=\s*["']([^"']+)["']/i);
    const name = nameAttrMatch ? decodeEntities(nameAttrMatch[1]).trim() : undefined;
    return buildRoute(points, name);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/routeImport.ts tests/import/routeImport.test.ts tests/fixtures/import-route.rtz
git commit -m "feat(import): parse RTZ (IEC 61174) route files" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add `parseRouteFile` dispatcher + malformed-XML guard

**Files:**
- Modify: `src/import/routeImport.ts`
- Modify: `tests/import/routeImport.test.ts`

- [ ] **Step 1: Write failing tests for dispatcher**

Append to `tests/import/routeImport.test.ts`:

```ts
import { parseRouteFile } from '../../src/import/routeImport';

describe('parseRouteFile — dispatcher', () => {
    it('picks GPX parser for .gpx extension', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/route-3wpt.gpx'), 'utf8');
        const r = parseRouteFile('plan.gpx', xml);
        expect(r.waypoints).toHaveLength(1);
    });

    it('picks RTZ parser for .rtz extension', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/import-route.rtz'), 'utf8');
        const r = parseRouteFile('plan.rtz', xml);
        expect(r.waypoints).toHaveLength(1);
    });

    it('sniffs by root element when extension is unknown', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/import-route.rtz'), 'utf8');
        const r = parseRouteFile('plan.bin', xml);
        expect(r.start).toEqual({ lat: -33.6012, lon: 151.3098 });
    });

    it('throws unknown-format when root is neither gpx nor route', () => {
        const xml = `<?xml version="1.0"?><foo/>`;
        try { parseRouteFile('unknown.xml', xml); } catch (e) {
            expect((e as RouteImportError).code).toBe('unknown-format');
        }
    });

    it('throws invalid-xml for garbage input', () => {
        try { parseRouteFile('x.gpx', 'not xml at all'); } catch (e) {
            expect((e as RouteImportError).code).toBe('invalid-xml');
        }
    });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: dispatcher tests FAIL — `parseRouteFile` not exported.

- [ ] **Step 3: Add the dispatcher**

Append to `src/import/routeImport.ts`:

```ts
/**
 * Pick parser by filename extension, falling back to root-element sniffing.
 * Throws RouteImportError('invalid-xml') if the input doesn't look like XML,
 * or 'unknown-format' if the root element is neither <gpx> nor <route>.
 */
export function parseRouteFile(filename: string, xml: string): ImportedRoute {
    if (!/<\s*\?xml/i.test(xml) && !/<\s*[A-Za-z]/.test(xml)) {
        throw new RouteImportError('invalid-xml', 'File is not valid XML.');
    }
    const ext = (filename.toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1];
    if (ext === 'gpx') return parseGpx(xml);
    if (ext === 'rtz') return parseRtz(xml);
    // Sniff: look at the first element name after any XML prolog.
    const rootMatch = xml.match(/<\s*([A-Za-z][\w:-]*)\b/);
    const root = rootMatch?.[1]?.toLowerCase();
    if (root === 'gpx') return parseGpx(xml);
    if (root === 'route') return parseRtz(xml);
    throw new RouteImportError('unknown-format', `Unrecognized format (root: <${root ?? '?'}>)`);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/import/routeImport.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/import/routeImport.ts tests/import/routeImport.test.ts
git commit -m "feat(import): add parseRouteFile dispatcher with format sniffing" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Part B — Wire import into the UI

### Task 5: Add i18n strings for import

**Files:**
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Add keys inside the `routing` block**

In `src/i18n/en.ts`, inside the `routing: { ... }` object (around line 46, before the closing brace), add:

```ts
    importFile: 'Import GPX / RTZ',
    importWaypointWarning: 'This route has {count} waypoints — more than usual. Import anyway?',
    importErrorInvalidXml: 'Could not read file — not valid GPX or RTZ.',
    importErrorNoPoints: 'File contains no route points.',
    importErrorTooFewPoints: 'File must contain at least a start and finish point.',
    importErrorOutOfRange: 'File contains invalid coordinates.',
    importErrorUnknownFormat: 'Unrecognized file format — expected .gpx or .rtz.',
```

- [ ] **Step 2: Run existing i18n tests to verify no regression**

Run: `npx vitest run tests/i18n`
Expected: PASS (no broken keys).

- [ ] **Step 3: Commit**

```bash
git add src/i18n/en.ts
git commit -m "i18n: add strings for GPX/RTZ import" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Wire the Import button into `RoutingPanel.svelte`

**Files:**
- Modify: `src/ui/RoutingPanel.svelte`

**Context:** The `WAITING_START` branch of the waypoint-instructions block is at `RoutingPanel.svelte:5-6`. That's where we add the button and hidden file input. The handler uses the existing `onEditStart` / `onEditEnd` / `onEditWaypoint` props — they already handle land checks and marker placement.

- [ ] **Step 1: Add the file input, button, and handler**

In `src/ui/RoutingPanel.svelte`:

(a) In the `WAITING_START` template block (around line 5), add the Import button + hidden input right after the `Use my location` button:

```svelte
{#if waypointState === 'WAITING_START'}
    <p class="size-m instruction">{t('routing.startPrompt', { what: t('routing.startWhat') })}<span hidden>{$locale}</span></p>
    <button class="button size-xs location-btn" on:click={handleUseMyLocationAsStart}>{t('routing.useMyLocation')}</button>
    <button class="button size-xs location-btn" on:click={() => importFileInput?.click()}>{t('routing.importFile')}</button>
    <input
        bind:this={importFileInput}
        type="file"
        accept=".gpx,.rtz"
        style="display:none"
        on:change={handleImportFile}
    />
{:else if waypointState === 'WAITING_END'}
```

(b) In the `<script>` block, add the import at the top (near other imports from `src/export`):

```ts
import { parseRouteFile, RouteImportError } from '../import/routeImport';
```

(c) Inside the `<script>` block, add a state variable and handler (place near the other `let ...` declarations and helper functions — e.g. after `let showAboutModal = false;` around line 599):

```ts
let importFileInput: HTMLInputElement | null = null;

async function handleImportFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset so re-selecting the same file still triggers change.
    input.value = '';
    if (!file) return;

    let xml: string;
    try {
        xml = await file.text();
    } catch {
        error = t('routing.importErrorInvalidXml');
        return;
    }

    let imported;
    try {
        imported = parseRouteFile(file.name, xml);
    } catch (err) {
        if (err instanceof RouteImportError) {
            error = t(`routing.importError${pascal(err.code)}`) || err.message;
        } else {
            error = t('routing.importErrorInvalidXml');
        }
        return;
    }

    if (imported.warning && !confirm(t('routing.importWaypointWarning', { count: imported.waypoints.length }))) {
        return;
    }

    error = null;

    // Drive the same handlers a manual click would.
    const startOk = await onEditStart(imported.start);
    if (!startOk) {
        error = t('routing.importErrorOutOfRange');
        return;
    }
    const endOk = await onEditEnd(imported.end);
    if (!endOk) {
        error = t('routing.importErrorOutOfRange');
        return;
    }
    for (let i = 0; i < imported.waypoints.length; i++) {
        await onEditWaypoint(i, imported.waypoints[i]);
    }
    if (imported.name) {
        saveRouteName = imported.name;
    }
}

function pascal(s: string): string {
    return s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}
```

Notes for the agent:
- Map from `RouteImportError.code` (`invalid-xml`, `no-points`, `too-few-points`, `out-of-range`, `unknown-format`) to i18n keys (`importErrorInvalidXml`, `importErrorNoPoints`, `importErrorTooFewPoints`, `importErrorOutOfRange`, `importErrorUnknownFormat`). The `pascal` helper does the conversion.
- `error` is already declared as `export let error: string | null = null;` (line 563). Assigning to it here shows the string in the existing error block at line 257.
- `onEditStart`, `onEditEnd`, `onEditWaypoint` are already declared as props (lines 582-584). They return `Promise<boolean>` — `false` means the coordinate was rejected (e.g. on land). On rejection we stop and surface an error.

- [ ] **Step 2: Build to verify Svelte compiles**

Run: `npm run build`
Expected: build succeeds with no type errors or Svelte compile errors.

- [ ] **Step 3: Manual browser smoke test**

Run: `npm start` (rollup watch mode)

In a browser with the plugin loaded:
1. Clear any existing route.
2. Click **Import GPX / RTZ**.
3. Select the existing `tests/fixtures/route-3wpt.gpx`.
4. Verify start, finish, and 1 waypoint pin appear on the map and the panel shows the `RouteStopsCard` in READY state.
5. Try importing a .rtz file and a file with >5 waypoints — confirm the warning prompt appears.

Document the result — success or the failure mode seen — in the task handoff.

- [ ] **Step 4: Commit**

```bash
git add src/ui/RoutingPanel.svelte
git commit -m "feat(ui): add GPX/RTZ import button to RoutingPanel" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Part C — Analytics opt-out

### Task 7: Add `analyticsEnabled` to UserSettings

**Files:**
- Modify: `src/routing/types.ts`

- [ ] **Step 1: Add the field and default**

In `src/routing/types.ts`:

(a) In the `UserSettings` interface (starts around line 222), add the field anywhere before the closing `}` — for example just before the `// Motorboat mode` comment at line 239:

```ts
    // Privacy
    analyticsEnabled: boolean; // send anonymous usage analytics
```

(b) In `DEFAULT_SETTINGS` (starts around line 249), add the default value before the closing `}`:

```ts
    analyticsEnabled: true,
```

- [ ] **Step 2: Verify no existing consumers break**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routing/types.ts
git commit -m "feat(settings): add analyticsEnabled setting (default true)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Gate `analytics.ts` on the setting

**Files:**
- Modify: `src/analytics.ts`
- Create: `tests/analytics.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/analytics.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the settings store BEFORE importing analytics, so analytics picks up the mock.
vi.mock('../src/stores/SettingsStore', () => {
    const mockSettings: Record<string, unknown> = { analyticsEnabled: true };
    return {
        settingsStore: {
            get: (k: string) => mockSettings[k],
            set: (k: string, v: unknown) => { mockSettings[k] = v; },
        },
    };
});

import { initAnalytics, trackEvent } from '../src/analytics';
import { settingsStore } from '../src/stores/SettingsStore';

const GA_ID = 'G-JJ4VC3LNC0';
const DISABLE_KEY = `ga-disable-${GA_ID}`;

beforeEach(() => {
    // Reset module state by clearing any injected GA script and globals.
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach(s => s.remove());
    (window as any)[DISABLE_KEY] = false;
    (window as any).sailDataLayer = [];
    // Reset the "initialized" flag inside analytics.ts by re-importing.
    vi.resetModules();
});

describe('analytics opt-out', () => {
    it('skips loading GA when analyticsEnabled is false and sets the disable flag', async () => {
        settingsStore.set('analyticsEnabled', false);
        const mod = await import('../src/analytics');
        mod.initAnalytics();
        const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]');
        expect(scripts.length).toBe(0);
        expect((window as any)[DISABLE_KEY]).toBe(true);
    });

    it('loads GA when analyticsEnabled is true', async () => {
        settingsStore.set('analyticsEnabled', true);
        const mod = await import('../src/analytics');
        mod.initAnalytics();
        const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]');
        expect(scripts.length).toBe(1);
    });

    it('trackEvent is a no-op when opted out', async () => {
        settingsStore.set('analyticsEnabled', false);
        const mod = await import('../src/analytics');
        const before = (window as any).sailDataLayer.length;
        mod.trackEvent('x', { a: 1 });
        expect((window as any).sailDataLayer.length).toBe(before);
    });

    it('trackEvent pushes when opted in', async () => {
        settingsStore.set('analyticsEnabled', true);
        const mod = await import('../src/analytics');
        mod.initAnalytics();
        const before = (window as any).sailDataLayer.length;
        mod.trackEvent('x', { a: 1 });
        expect((window as any).sailDataLayer.length).toBeGreaterThan(before);
    });
});
```

This test file uses browser-ish globals (`document`, `window`). Enable the DOM environment for this test by adding at the very top of the file:

```ts
/**
 * @vitest-environment happy-dom
 */
```

Add `happy-dom` as a devDependency because vitest's default env is node:

```bash
npm install --save-dev happy-dom
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npx vitest run tests/analytics.test.ts`
Expected: FAIL — current `initAnalytics()` always loads the script; `trackEvent()` always pushes.

- [ ] **Step 3: Update `src/analytics.ts`**

Replace the contents of `src/analytics.ts` with:

```ts
import { settingsStore } from './stores/SettingsStore';

const GA_ID = 'G-JJ4VC3LNC0';
const DISABLE_KEY = `ga-disable-${GA_ID}`;
let initialized = false;

// Isolated dataLayer to avoid conflicts with Windy's own gtag
(window as Record<string, unknown>).sailDataLayer =
    (window as Record<string, unknown>).sailDataLayer || [];

function sailGtag(): void {
    // Must push the `arguments` object, not a plain array — gtag.js requires this
    ((window as Record<string, unknown>).sailDataLayer as IArguments[]).push(arguments as unknown as IArguments);
}

function isEnabled(): boolean {
    try {
        return settingsStore.get('analyticsEnabled') !== false;
    } catch {
        return true; // if store unavailable, default-on matches prior behavior
    }
}

export function initAnalytics(): void {
    if (initialized) return;
    initialized = true;

    if (!isEnabled()) {
        (window as Record<string, unknown>)[DISABLE_KEY] = true;
        return;
    }

    sailGtag('js' as never, new Date() as never);
    sailGtag('config' as never, GA_ID as never);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}&l=sailDataLayer`;
    document.head.appendChild(script);
}

export function trackEvent(name: string, params?: Record<string, string | number>): void {
    if (!isEnabled()) return;
    sailGtag('event' as never, name as never, params as never);
}

/**
 * Called by the Settings UI when the user toggles analytics off mid-session.
 * Sets the GA kill-switch so any already-loaded gtag script sends nothing more.
 */
export function applyAnalyticsOptOut(): void {
    (window as Record<string, unknown>)[DISABLE_KEY] = true;
}
```

- [ ] **Step 4: Run the tests to verify pass**

Run: `npx vitest run tests/analytics.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/analytics.ts tests/analytics.test.ts package.json package-lock.json pnpm-lock.yaml
git commit -m "feat(analytics): gate on analyticsEnabled setting with opt-out kill switch" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(Commit whichever lockfile actually changed — only `package-lock.json` if you used `npm install`, or `pnpm-lock.yaml` if you used `pnpm`.)

---

### Task 9: Add Privacy section to Settings modal

**Files:**
- Modify: `src/i18n/en.ts`
- Modify: `src/ui/SettingsModal.svelte`

- [ ] **Step 1: Add i18n keys**

In `src/i18n/en.ts`, inside the `settings: { ... }` object, add (next to the existing `sectionVoyage`, `sectionMotor`, `sectionFeel` keys):

```ts
    sectionPrivacy: 'Privacy',
    analyticsEnabled: 'Share anonymous usage analytics',
    infoAnalyticsEnabled: 'Helps improve the plugin. No personal data is collected. Changes take effect on next reload.',
```

- [ ] **Step 2: Add the section in `SettingsModal.svelte`**

In `src/ui/SettingsModal.svelte`:

(a) Add a new section inside `<div class="modal-body">`, placed **after** the `advanced-section` block (after line 189), so Privacy is the last section:

```svelte
<!-- Privacy -->
<div class="section mb-10">
    <span class="size-xs label">{t('settings.sectionPrivacy')}</span>
    <label class="model-row size-s">
        <input type="checkbox" checked={analyticsEnabled} on:change={toggleAnalytics} />
        <span>{t('settings.analyticsEnabled')}</span>
        <InfoTooltip text={t('settings.infoAnalyticsEnabled')} />
    </label>
</div>
```

(b) In the `<script>` block, add the reactive state (near the other `let ...` declarations around line 221):

```ts
let analyticsEnabled: boolean = settingsStore.get('analyticsEnabled');
```

(c) Add the import for the opt-out helper at the top of the script block:

```ts
import { applyAnalyticsOptOut } from '../analytics';
```

(d) Add the `toggleAnalytics` function (near `toggleIsochrones` around line 253):

```ts
function toggleAnalytics(): void {
    analyticsEnabled = !analyticsEnabled;
    settingsStore.set('analyticsEnabled', analyticsEnabled);
    if (!analyticsEnabled) {
        applyAnalyticsOptOut();
    }
}
```

(e) Add to the `onSettingsChange` handler (around line 322) so cloud-sync updates propagate to the checkbox:

```ts
function onSettingsChange(settings: UserSettings): void {
    // ...existing assignments...
    showIsochrones = settings.showIsochrones;
    analyticsEnabled = settings.analyticsEnabled;
}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Step 5: Manual smoke test**

Run: `npm start`

1. Open Settings, scroll to Privacy section.
2. Uncheck "Share anonymous usage analytics".
3. Open devtools → Network → filter `googletagmanager`. Refresh the plugin. Confirm no request to `googletagmanager.com`.
4. Re-check the box, reload. Confirm the request fires again.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/en.ts src/ui/SettingsModal.svelte
git commit -m "feat(settings): add Privacy section with analytics opt-out toggle" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the full test suite one more time**

Run: `npx vitest run`
Expected: all PASS.

- [ ] **Run a clean build**

Run: `npm run build`
Expected: clean build, `dist/plugin.min.js` produced.

- [ ] **Check `git log` for clean commit history**

Run: `git log --oneline -12`
Expected: one commit per task, reasonable messages.

---

## Notes for the implementer

- **TDD order:** Tasks 1-4 and 7-8 are strictly test-first — write the test, see it fail, then make it pass.
- **UI tasks (6, 9):** Svelte doesn't have a unit-test harness in this repo, so verification is a compile check (`npm run build`) plus a manual smoke test. Take a moment to exercise the flow in a browser before marking complete.
- **Happy-dom dep:** Task 8 adds `happy-dom` as a devDependency. If the project already has it by the time you get there, skip the install and just use it.
- **No hooks, no feature flags, no backward-compat shims:** new setting back-fills naturally via `SettingsStore.load()` merge.
- **Don't split the brainstorm further:** both features touch different files and don't interact, so one bundled PR is fine.
