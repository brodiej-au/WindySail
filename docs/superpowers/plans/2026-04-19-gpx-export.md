# GPX Export Implementation Plan (Sub-project G)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Export GPX" button that downloads the currently selected route as a GPX 1.1 file with a single `<rte>` container.

**Architecture:** Pure client-side: pure-function XML builder, Blob download trigger, one button wired into the results area. No new dependencies.

**Tech Stack:** Vanilla TypeScript template literals. Vitest for golden-file testing.

**Spec reference:** `docs/superpowers/specs/2026-04-19-v0.3-overhaul-design.md` §G.

**Commands:**
- Tests: `npm test -- tests/export/gpxExport.test.ts`
- Build: `npm run build`

---

## File Plan

**New files:**
- `src/export/gpxExport.ts` — `buildGpx(args)` + `triggerGpxDownload(args)` + `escapeXml` helper.
- `tests/export/gpxExport.test.ts` — unit + golden-file test.
- `tests/fixtures/route-3wpt.gpx` — expected output for a 3-waypoint test input.

**Modified files:**
- Wherever the "Save Route" / model-compare buttons live in the results panel (likely `src/ui/RoutingPanel.svelte` when results are shown, or `src/ui/RouteDetailModal.svelte`). Find by searching for `Save Route` in `src/ui/`.

---

## Task 1: Pure XML builder with golden-file test

**Files:**
- Create: `src/export/gpxExport.ts`, `tests/export/gpxExport.test.ts`, `tests/fixtures/route-3wpt.gpx`.

- [ ] **Step 1: Write the expected golden fixture**

Create `tests/fixtures/route-3wpt.gpx`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Windy Sail Router v0.3.0" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Pittwater to Sydney Harbour</name>
    <time>2026-04-19T09:15:00.000Z</time>
  </metadata>
  <rte>
    <name>Sail Router plan</name>
    <rtept lat="-33.6012" lon="151.3098"><name>Start &#8212; Pittwater</name></rtept>
    <rtept lat="-33.8210" lon="151.4400"><name>Waypoint 1</name></rtept>
    <rtept lat="-33.8523" lon="151.2108"><name>Finish &#8212; Sydney Harbour</name></rtept>
  </rte>
</gpx>
```

- [ ] **Step 2: Write the failing test**

Create `tests/export/gpxExport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildGpx, escapeXml, suggestedFilename } from '../../src/export/gpxExport';

describe('escapeXml', () => {
    it('escapes all five XML entities', () => {
        expect(escapeXml('A & B <c> "d" \'e\'')).toBe(
            'A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;'
        );
    });
});

describe('buildGpx', () => {
    it('matches the golden 3-waypoint fixture', () => {
        const fixture = readFileSync(
            resolve(__dirname, '../fixtures/route-3wpt.gpx'),
            'utf8'
        );
        const actual = buildGpx({
            startName: 'Pittwater',
            endName: 'Sydney Harbour',
            start: { lat: -33.6012, lon: 151.3098 },
            end: { lat: -33.8523, lon: 151.2108 },
            waypoints: [{ lat: -33.821, lon: 151.44 }],
            version: '0.3.0',
            timestamp: '2026-04-19T09:15:00.000Z',
        });
        expect(actual.trim()).toBe(fixture.trim());
    });

    it('handles routes with no intermediate waypoints', () => {
        const out = buildGpx({
            startName: 'A', endName: 'B',
            start: { lat: 0, lon: 0 }, end: { lat: 1, lon: 1 },
            waypoints: [],
            version: '0.3.0',
            timestamp: '2026-04-19T00:00:00.000Z',
        });
        expect(out).toContain('<rtept lat="0.0000" lon="0.0000"');
        expect(out).toContain('<rtept lat="1.0000" lon="1.0000"');
        expect(out).not.toContain('Waypoint 1');
    });

    it('escapes special characters in names', () => {
        const out = buildGpx({
            startName: 'A & B <test>',
            endName: 'End',
            start: { lat: 0, lon: 0 }, end: { lat: 1, lon: 1 },
            waypoints: [],
            version: '0.3.0',
            timestamp: '2026-04-19T00:00:00.000Z',
        });
        expect(out).toContain('A &amp; B &lt;test&gt;');
        expect(out).not.toContain('A & B <test>');
    });
});

describe('suggestedFilename', () => {
    it('slugifies names and includes ISO date', () => {
        expect(suggestedFilename('Pittwater', 'Sydney Harbour', new Date('2026-04-19T00:00:00Z')))
            .toBe('sail-router-pittwater-sydney-harbour-2026-04-19.gpx');
    });

    it('handles names with accents and punctuation', () => {
        expect(suggestedFilename("St. Jean's", 'Île d\'Or', new Date('2026-01-01T00:00:00Z')))
            .toBe('sail-router-st-jeans-ile-dor-2026-01-01.gpx');
    });

    it('falls back to "route" when both names are empty', () => {
        expect(suggestedFilename('', '', new Date('2026-04-19T00:00:00Z')))
            .toBe('sail-router-route-2026-04-19.gpx');
    });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
npm test -- tests/export/gpxExport.test.ts
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 4: Implement `src/export/gpxExport.ts`**

```ts
import type { LatLon } from '../routing/types';

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export interface BuildGpxArgs {
    startName: string;
    endName: string;
    start: LatLon;
    end: LatLon;
    waypoints: LatLon[];
    version: string;
    timestamp: string; // ISO string
}

function emdash(s: string): string {
    // Render em-dash as a numeric character reference so file bytes are stable
    // across editors that might otherwise re-encode.
    return s.replace(/\u2014/g, '&#8212;');
}

function formatCoord(n: number): string {
    return n.toFixed(4);
}

export function buildGpx(args: BuildGpxArgs): string {
    const routeName = `${args.startName} to ${args.endName}`;
    const stops: { point: LatLon; name: string }[] = [];
    stops.push({ point: args.start, name: `Start \u2014 ${args.startName}` });
    args.waypoints.forEach((wp, i) => stops.push({ point: wp, name: `Waypoint ${i + 1}` }));
    stops.push({ point: args.end, name: `Finish \u2014 ${args.endName}` });

    const rtepts = stops.map(s =>
        `    <rtept lat="${formatCoord(s.point.lat)}" lon="${formatCoord(s.point.lon)}"><name>${emdash(escapeXml(s.name))}</name></rtept>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Windy Sail Router v${escapeXml(args.version)}" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(routeName)}</name>
    <time>${escapeXml(args.timestamp)}</time>
  </metadata>
  <rte>
    <name>Sail Router plan</name>
${rtepts}
  </rte>
</gpx>`;
}

function slugify(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function suggestedFilename(startName: string, endName: string, now: Date): string {
    const slug1 = slugify(startName) || '';
    const slug2 = slugify(endName) || '';
    const combo = [slug1, slug2].filter(Boolean).join('-') || 'route';
    const date = now.toISOString().slice(0, 10);
    return `sail-router-${combo}-${date}.gpx`;
}

export function triggerGpxDownload(args: BuildGpxArgs): void {
    const xml = buildGpx(args);
    const filename = suggestedFilename(args.startName, args.endName, new Date());
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/export/gpxExport.test.ts
```

Expected: all pass.

If the golden file comparison fails, diff the actual output against the fixture. Whitespace discrepancies are the most likely culprit — ensure the fixture uses exactly `\n` line endings (not `\r\n`).

- [ ] **Step 6: Commit**

```bash
git add src/export/gpxExport.ts tests/export/gpxExport.test.ts tests/fixtures/route-3wpt.gpx
git commit -m "feat(export): GPX builder with golden-file test"
```

---

## Task 2: Wire the Export button into the results UI

**Files:**
- Modify: the component that hosts the results actions (usually `src/ui/RoutingPanel.svelte`).

- [ ] **Step 1: Locate the results action area**

```bash
grep -n "Save Route" src/ui/
```

Open the file that contains the Save Route button. That's the place to add Export GPX.

- [ ] **Step 2: Add the button and handler**

Near the top of `<script>`:

```ts
import { triggerGpxDownload } from '../export/gpxExport';
import config from '../pluginConfig';
// If plan B (i18n) is done, also: import { t } from '../i18n';

function handleExportGpx() {
    // The "currently selected route" is whichever model the user has highlighted.
    // Adapt the ref below to whatever variable the existing code uses for the selected ModelRouteResult.
    if (!start || !end) return;
    triggerGpxDownload({
        startName: startName ?? 'Start',
        endName: endName ?? 'Finish',
        start,
        end,
        waypoints,
        version: config.version,
        timestamp: new Date().toISOString(),
    });
}
```

Add the button next to Save Route (same button group), using the same class conventions as the existing button:

```svelte
<button class="button size-xs" on:click={handleExportGpx}>
    {t('routing.exportGpx')}
</button>
```

**If i18n not yet applied:** use the string `Export GPX`.

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Manual verification**

Run `npm start`, open plugin, compute a route, press **Export GPX**. Expected: a `.gpx` file downloads. Open in a text editor and confirm structure matches the spec. Load in a nav app (OpenCPN, Garmin BaseCamp) if available — route should render with start/waypoints/finish as labelled route points.

- [ ] **Step 5: Commit**

```bash
git add <the modified file>
git commit -m "feat(ui): Export GPX button in results panel"
```

---

## Self-Review

Spec coverage (§G):
- **G-1 button placement and i18n key**: Task 2.
- **G-2 GPX XML content (rte-only, no wpt, no timing)**: Task 1's golden fixture.
- **G-3 mechanics (Blob + download + filename)**: Task 1 (`triggerGpxDownload`, `suggestedFilename`).
- **Golden-file test for 3-waypoint fixture**: Task 1 Step 2.

Placeholder scan: clean. One caveat: "Wherever the Save Route button lives" requires the implementer to grep. That's fine — the task walks them through it.

Type consistency: `BuildGpxArgs` interface stable. `LatLon` reused from `src/routing/types.ts`.
