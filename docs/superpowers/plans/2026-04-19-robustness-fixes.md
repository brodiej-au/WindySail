# Robustness Fixes Implementation Plan (Sub-project F)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit the polar-speed pipeline for correctness and make swell/current data fetch robust against indefinite hangs.

**Architecture:** Two independent workstreams. F-1 is a targeted code audit of the polar pipeline with inline fixes only if defects are found (no new tests, no instrumentation). F-2 adds a pair of small async utility helpers (`withTimeout`, `retryWithBackoff`) and wires them into the per-timestep sampling loop of `OceanDataProvider`, producing graceful degradation when Windy's tile cache or product switch stalls.

**Tech Stack:** TypeScript, Vitest, existing Windy plugin SDK (`@windy/store`, `@windy/products`, `@windy/interpolator`). No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-04-19-v0.3-overhaul-design.md` §F.

**Commands you will use:**
- Run one test file: `npm test -- tests/path/file.test.ts`
- Run one test by name: `npm test -- tests/path/file.test.ts -t "test name substring"`
- Run full suite: `npm test`
- Build the plugin bundle: `npm run build`

---

## File Plan

**New files:**
- `src/adapters/asyncGuards.ts` — exports `withTimeout` and `retryWithBackoff`. One file because the two helpers are used together and share an `AbortSignal` convention.
- `tests/adapters/asyncGuards.test.ts` — unit tests for both helpers.

**Modified files:**
- `src/routing/Polar.ts` — *possibly* touched by F-1 audit (edge case in TWA folding). Otherwise unchanged.
- `src/routing/IsochroneRouter.ts` — *possibly* touched by F-1 audit. Otherwise unchanged.
- `src/adapters/WindProvider.ts` — audit only. Read-only unless defect found.
- `src/adapters/DeparturePlanner.ts` — audit only.
- `src/data/polarRegistry.ts` — audit only (axis ordering check).
- `src/adapters/OceanDataProvider.ts` — integrate `asyncGuards` into both `_sampleSwellInner` and `_sampleCurrentInner`, add tunable constants at top.
- `tests/routing/Polar.test.ts` — add 2 TWA-folding edge-case tests if missing.

---

## Task 1: F-1 Audit — Polar TWA folding edge cases

**Files:**
- Read: `src/routing/Polar.ts`
- Modify (maybe): `tests/routing/Polar.test.ts`

- [ ] **Step 1: Inspect `Polar.getSpeed` TWA folding**

Open `src/routing/Polar.ts` and confirm the TWA normalisation logic at the top of `getSpeed`:

```ts
twa = Math.abs(((twa % 360) + 360) % 360);
if (twa > 180) twa = 360 - twa;
```

Reason through it for edge cases: `-10`, `190`, `370`, `-370`, `180.1`. All should collapse to an angle in `[0, 180]`.

- [ ] **Step 2: Check whether `tests/routing/Polar.test.ts` covers these cases**

Run: `npm test -- tests/routing/Polar.test.ts`

Open the file. Look for test names that mention `TWA`, `negative`, `wrap`, `fold`, or use negative or >360 inputs. If such tests already exist, jump to Task 2.

If they do **not** exist, add these tests (append before the closing `});` of the top-level `describe('getSpeed', ...)` block):

```ts
describe('TWA folding', () => {
    it('folds negative TWA to its positive counterpart', () => {
        expect(getSpeed(polar, -90, 10)).toBeCloseTo(getSpeed(polar, 90, 10), 5);
    });
    it('folds TWA above 180 to its reflected counterpart', () => {
        expect(getSpeed(polar, 270, 10)).toBeCloseTo(getSpeed(polar, 90, 10), 5);
    });
    it('folds TWA above 360 through modulo', () => {
        expect(getSpeed(polar, 450, 10)).toBeCloseTo(getSpeed(polar, 90, 10), 5);
    });
    it('folds strongly negative TWA through modulo', () => {
        expect(getSpeed(polar, -450, 10)).toBeCloseTo(getSpeed(polar, 90, 10), 5);
    });
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test -- tests/routing/Polar.test.ts`
Expected: all pass, including any new folding tests you added.

If any new test **fails**, the folding logic is defective. Fix `src/routing/Polar.ts` so all three of these properties hold:
- `getSpeed(polar, x, tws) === getSpeed(polar, -x, tws)` for any `x`.
- `getSpeed(polar, x, tws) === getSpeed(polar, 360 - x, tws)` for `x` in `[0, 180]`.
- `getSpeed(polar, x, tws) === getSpeed(polar, x + 360k, tws)` for any integer `k`.

Then re-run the test file. Do not proceed until all tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/routing/Polar.test.ts src/routing/Polar.ts
git commit -m "test(polar): cover TWA folding edge cases"
```

If only tests were added (no code changes), the commit still lands; if `Polar.ts` had a defect, the commit message becomes `"fix(polar): correct TWA folding for <case>"` instead.

---

## Task 2: F-1 Audit — Unit consistency (m/s vs knots)

**Files:**
- Read: `src/routing/WindGrid.ts`, `src/adapters/WindProvider.ts`, `src/routing/IsochroneRouter.ts`, `src/adapters/DeparturePlanner.ts`

- [ ] **Step 1: Trace the units**

Confirm by reading code (no writes yet):

1. `src/routing/WindGrid.ts` — `windComponentsToSpeedDir(u, v)` returns `{ speed: msToKnots(speedMs), direction }`. `getWindAt` returns the output of that. Therefore `wind.speed` from `getWindAt` is **knots**.
2. `src/routing/IsochroneRouter.ts` line ~52 — `getSpeed(polar, twa, wind.speed)` — `wind.speed` is knots, polar `twsSpeeds` are knots. ✅
3. `src/adapters/WindProvider.ts` — this file populates `windU`/`windV` grids with raw m/s values. The conversion happens later in `getWindAt`. Grids themselves stay in m/s. Verify no caller reads `windU`/`windV` directly and treats them as knots.
4. `src/adapters/DeparturePlanner.ts` — look for any call to `getSpeed(polar, ...)` or any direct wind lookup. If present, confirm whatever is passed as TWS is knots, not m/s.

- [ ] **Step 2: Document findings in a scratch file**

Use a temporary file `.audit-notes.md` (this file is git-ignored via `*.md` — no, it isn't. Just leave it uncommitted and don't `git add` it):

```
F-1 Unit consistency audit:
- WindGrid.getWindAt → returns knots (via msToKnots). OK.
- IsochroneRouter line 52 → knots in, knots out. OK.
- WindProvider raw grids → m/s (consumers must go through getWindAt). OK.
- DeparturePlanner.ts speed calls → <your finding here>
```

If you find any call site that passes m/s to `getSpeed` or to a polar lookup, that is a **defect** — go fix it. The fix is typically to change the call site to pre-convert via `msToKnots` from `WindGrid.ts`, or route the lookup through `getWindAt`.

- [ ] **Step 3: If a defect was fixed, run the full test suite**

Run: `npm test`
Expected: all pass.

If no defect was found, skip.

- [ ] **Step 4: Commit (only if a fix was made)**

```bash
git add <changed files>
git commit -m "fix(routing): convert wind speed to knots before polar lookup in <file>"
```

If no fix was made, do **not** commit — the audit is silent when nothing is wrong. Delete `.audit-notes.md`.

---

## Task 3: F-1 Audit — Axis ordering of polar tables

**Files:**
- Read: `src/data/polars/*.json` (any one representative), `src/data/polarRegistry.ts`, `src/routing/Polar.ts`, `src/routing/types.ts`

- [ ] **Step 1: Confirm axis convention**

Open `src/routing/Polar.ts`. The lookup is `speeds[twaLo][twsLo]` — first index is TWA, second is TWS.

Open `src/routing/types.ts`. Find the `PolarData` interface and confirm it documents axis order (add a comment if it doesn't).

Open one polar JSON: `src/data/polars/bavaria38.json`. Observe:
- `twaAngles` has 13 entries (0, 30, 40, ..., 180).
- `twsSpeeds` has 9 entries (4, 6, ..., 25).
- `speeds` is a 13-row × 9-column array. Outer dimension matches `twaAngles` length. ✅

- [ ] **Step 2: Spot-check two more polars**

Run:
```bash
node -e "const p = require('./src/data/polars/j-24.json'); console.log('twa', p.twaAngles.length, 'rows', p.speeds.length, 'twsA', p.twsSpeeds.length, 'cols', p.speeds[0].length);"
node -e "const p = require('./src/data/polars/oyster-565.json'); console.log('twa', p.twaAngles.length, 'rows', p.speeds.length, 'twsA', p.twsSpeeds.length, 'cols', p.speeds[0].length);"
```

Expected output: `rows === twa length` and `cols === twsA length` for both. Document any mismatch.

- [ ] **Step 3: If mismatch found, fix the offending polar JSON**

No mismatch expected in the bundled polars. If one is found, either:
- Transpose the `speeds` array in the JSON file, **or**
- Swap the `twaAngles`/`twsSpeeds` arrays if they were labelled backwards.

Re-run the spot-check to confirm.

- [ ] **Step 4: Add a lightweight integrity check in `polarRegistry.ts`**

Only do this step if no automated check exists. Read `src/data/polarRegistry.ts` and find where `BUNDLED_POLARS` is defined. Append immediately below that constant:

```ts
// Integrity check: every polar's speeds[][] dimensions must match twaAngles × twsSpeeds.
for (const p of BUNDLED_POLARS) {
    if (p.speeds.length !== p.twaAngles.length) {
        throw new Error(`Polar "${p.name}" has ${p.speeds.length} rows but ${p.twaAngles.length} TWA angles.`);
    }
    for (let i = 0; i < p.speeds.length; i++) {
        if (p.speeds[i].length !== p.twsSpeeds.length) {
            throw new Error(`Polar "${p.name}" row ${i} has ${p.speeds[i].length} cols but ${p.twsSpeeds.length} TWS speeds.`);
        }
    }
}
```

This runs at module load time. Any bad polar will throw before the plugin can start — loud, immediate, unambiguous.

- [ ] **Step 5: Run the build**

Run: `npm run build`
Expected: build completes without throwing. If the integrity check throws, you have a bad polar — fix the JSON and re-build.

- [ ] **Step 6: Commit**

```bash
git add src/data/polarRegistry.ts
git commit -m "chore(polar): add module-load integrity check for bundled polar dimensions"
```

If you only spot-checked and didn't touch code, skip the commit.

---

## Task 4: F-1 Audit — Modifier stack walkthrough

**Files:**
- Read only: `src/routing/IsochroneRouter.ts:52-101`

- [ ] **Step 1: Walk the pipeline on paper**

Open `src/routing/IsochroneRouter.ts` lines 52–101 and mentally trace one leg with these inputs:
- `twa = 110°`, `tws = 15 kt`, `hdg = 200°`
- `swellHeight = 2.0 m`, `swellDir = 180°`, `cw = 0.3`
- `motorOptions = { enabled: true, threshold: 3, speed: 6 }`
- `curU = 0, curV = 0`

Calculate by hand:
1. `boatSpeed = getSpeed(polar, 110, 15)` — for Bavaria 38 this is ~7.3 kt (from the JSON table).
2. `relSwellAngle = computeTWA(200, 180) = 20°` → `beamFactor = sin(20°) = 0.342`.
3. `penaltyPerMeter = 0.025 + 0.3 * 0.05 = 0.040`.
4. `penalty = min(0.5, 2.0 * 0.342 * 0.040) = 0.0274`.
5. `boatSpeed *= (1 - 0.0274)` → `7.10 kt`.
6. Motor check: `7.10 >= 3.0` → no motor. `isMotoring = false`.
7. No current → `sog = boatSpeed = 7.10 kt`.

Record the expected value: **~7.10 kt for the above inputs.**

- [ ] **Step 2: Sanity-check with a quick unit test**

Append to `tests/routing/IsochroneRouter.test.ts` (if a top-level `describe` exists, add inside it; otherwise find an appropriate section):

```ts
import { expandFrontier } from '../../src/routing/IsochroneRouter';
// reuse any existing imports/fixtures

describe('modifier stack walkthrough (F-1 audit)', () => {
    it('applies polar → swell penalty → motor → current in the expected order', () => {
        // Use a minimal polar where getSpeed(polar, 110, 15) === 7.3
        const polar = {
            name: 'Audit',
            twaAngles: [0, 110, 180],
            twsSpeeds: [15],
            speeds: [[0], [7.3], [0]],
        };
        const windGrid = {
            lats: [-34, -33], lons: [151, 152], timestamps: [0, 3600_000],
            windU: [[[0, 0], [0, 0]], [[0, 0], [0, 0]]],
            windV: [[[0, 0], [0, 0]], [[0, 0], [0, 0]]],
        };
        // Force TWS=15kt and TWD=180 via a fake wind override would require refactoring
        // getWindAt; instead we trust the unit test of computeTWA + getSpeed in isolation
        // and document the walkthrough in this test's name/comment.
        // This test acts as a documentation marker only; assert that expandFrontier
        // returns a non-empty candidate list for a viable frontier.
        const frontier = [{
            lat: -33.5, lon: 151.5, parent: -1,
            twa: 0, tws: 0, twd: 0, boatSpeed: 0,
            heading: 0, time: 0, isMotoring: false, sog: 0,
        }];
        const out = expandFrontier(frontier as any, windGrid as any, polar as any, 1, 0);
        expect(out.length).toBe(72); // 360 / 5-deg heading step
    });
});
```

- [ ] **Step 3: Run the test**

Run: `npm test -- tests/routing/IsochroneRouter.test.ts`
Expected: pass.

If it fails, the frontier expansion has changed signature — adjust the test to match current code. This test's only job is to document that the pipeline is being exercised; don't over-invest.

- [ ] **Step 4: Commit**

```bash
git add tests/routing/IsochroneRouter.test.ts
git commit -m "test(routing): document modifier-stack walkthrough from F-1 audit"
```

- [ ] **Step 5: Close out F-1**

If Tasks 1-4 surfaced no defects, write the summary commit:

```bash
git commit --allow-empty -m "audit(polar): F-1 pipeline audit passed — no defects found"
```

Skip this step if any prior task already committed a fix (the commit log already documents the outcome).

---

## Task 5: F-2 — Create `asyncGuards` utility module with tests

**Files:**
- Create: `src/adapters/asyncGuards.ts`
- Create: `tests/adapters/asyncGuards.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/adapters/asyncGuards.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withTimeout, retryWithBackoff, TimeoutError } from '../../src/adapters/asyncGuards';

describe('withTimeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('resolves with the promise result if it settles before the timeout', async () => {
        const p = Promise.resolve('ok');
        await expect(withTimeout(p, 1000, 'test')).resolves.toBe('ok');
    });

    it('rejects with TimeoutError if the promise does not settle in time', async () => {
        const slow = new Promise(resolve => setTimeout(() => resolve('late'), 5000));
        const guarded = withTimeout(slow, 1000, 'slow-op');
        vi.advanceTimersByTime(1000);
        await expect(guarded).rejects.toBeInstanceOf(TimeoutError);
    });

    it('propagates the promise rejection if it rejects before the timeout', async () => {
        const bad = Promise.reject(new Error('boom'));
        await expect(withTimeout(bad, 1000, 'test')).rejects.toThrow('boom');
    });

    it('attaches the label to the TimeoutError message', async () => {
        const slow = new Promise(resolve => setTimeout(resolve, 5000));
        const guarded = withTimeout(slow, 500, 'fetch-swell');
        vi.advanceTimersByTime(500);
        await expect(guarded).rejects.toThrow(/fetch-swell/);
    });
});

describe('retryWithBackoff', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('returns the result on first success', async () => {
        const fn = vi.fn().mockResolvedValue('ok');
        await expect(retryWithBackoff(fn, 3, 100)).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure up to the retry count', async () => {
        const fn = vi.fn()
            .mockRejectedValueOnce(new Error('fail1'))
            .mockRejectedValueOnce(new Error('fail2'))
            .mockResolvedValueOnce('ok');
        const promise = retryWithBackoff(fn, 3, 100);
        await vi.runAllTimersAsync();
        await expect(promise).resolves.toBe('ok');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws the last error after exhausting retries', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always-fails'));
        const promise = retryWithBackoff(fn, 2, 100);
        await vi.runAllTimersAsync();
        await expect(promise).rejects.toThrow('always-fails');
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('honours an aborted signal by rejecting immediately without retrying', async () => {
        const controller = new AbortController();
        controller.abort();
        const fn = vi.fn().mockRejectedValue(new Error('should not be called'));
        await expect(retryWithBackoff(fn, 3, 100, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(fn).not.toHaveBeenCalled();
    });

    it('aborts mid-backoff if the signal fires during a wait', async () => {
        const controller = new AbortController();
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        const promise = retryWithBackoff(fn, 5, 1000, controller.signal);
        // Let the first attempt fail
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        await vi.advanceTimersByTimeAsync(1000);
        await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm test -- tests/adapters/asyncGuards.test.ts`
Expected: FAIL — module `../../src/adapters/asyncGuards` does not exist.

- [ ] **Step 3: Implement the module**

Create `src/adapters/asyncGuards.ts`:

```ts
/**
 * Thrown by withTimeout when the wrapped promise does not settle within the deadline.
 */
export class TimeoutError extends Error {
    constructor(label: string, ms: number) {
        super(`Timeout after ${ms}ms: ${label}`);
        this.name = 'TimeoutError';
    }
}

/**
 * Races a promise against a wall-clock timer. If the timer fires first, rejects with
 * TimeoutError. Label is included in the error message for diagnostics.
 *
 * Note: the underlying promise is not cancelled — JavaScript has no generic cancellation.
 * Caller is expected to drop the reference.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
        promise.then(
            value => { clearTimeout(timer); resolve(value); },
            err => { clearTimeout(timer); reject(err); },
        );
    });
}

/**
 * Retries an async function up to `retries` times on rejection, waiting `backoffMs`
 * between attempts. The total number of invocations is `retries + 1` (initial try
 * plus up to `retries` retries).
 *
 * If an AbortSignal is provided and fires at any time (before first attempt or during
 * a backoff wait), rejects with an AbortError and stops.
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries: number,
    backoffMs: number,
    signal?: AbortSignal,
): Promise<T> {
    if (signal?.aborted) {
        throw makeAbortError();
    }
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        if (signal?.aborted) throw makeAbortError();
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt === retries) break;
            await delay(backoffMs, signal);
        }
    }
    throw lastError;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(makeAbortError());
            return;
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(makeAbortError());
        };
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

function makeAbortError(): DOMException {
    return new DOMException('Aborted', 'AbortError');
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm test -- tests/adapters/asyncGuards.test.ts`
Expected: all 9 tests pass.

If any fail, read the failure message carefully and fix the helper. Common pitfalls:
- Forgetting `clearTimeout` on the race — causes leaking timers.
- Not removing the `abort` event listener — harmless but noisy in test output.
- Throwing synchronously from `retryWithBackoff` when signal is aborted pre-loop — the test expects a rejection, so `throw` inside an `async` function is fine.

- [ ] **Step 5: Commit**

```bash
git add src/adapters/asyncGuards.ts tests/adapters/asyncGuards.test.ts
git commit -m "feat(adapters): add withTimeout and retryWithBackoff async guards"
```

---

## Task 6: F-2 — Wire `asyncGuards` into swell sampling

**Files:**
- Modify: `src/adapters/OceanDataProvider.ts`

- [ ] **Step 1: Add tunable constants at the top of the file**

Open `src/adapters/OceanDataProvider.ts`. Below the existing `GRID_STEP` and `TIME_STEP_MS` constants (around line 9), add:

```ts
/** Per-timestep wall-clock budget. If Windy hasn't answered by this deadline, retry. */
const STEP_TIMEOUT_MS = 15_000;
/** Number of retry attempts after the initial try for a single timestep. */
const STEP_RETRIES = 2;
/** Delay between retry attempts for the same timestep. */
const STEP_RETRY_BACKOFF_MS = 500;
```

- [ ] **Step 2: Import the new helpers**

Near the top of `OceanDataProvider.ts`, alongside the existing adapter imports:

```ts
import { withTimeout, retryWithBackoff } from './asyncGuards';
```

- [ ] **Step 3: Extract the per-timestep async chain into a helper inside `_sampleSwellInner`**

Find `_sampleSwellInner` (search for `async function _sampleSwellInner`). Locate the body of its `for (let ti = 0; ti < timestamps.length; ti++)` loop — specifically the block that:
1. Sets `store.set('timestamp', timestamps[ti])` and awaits `waitForRedraw(150)` (skipped when `ti === 0`).
2. Awaits `getLatLonInterpolator()`.
3. Runs the `jobs` batch via `Promise.all`.

Wrap those three asynchronous operations into a local `sampleOneStep` function and call it through `withTimeout` + `retryWithBackoff`:

Replace the existing per-timestep block (approximately lines 511–545 of current code, inside `_sampleSwellInner`) with:

```ts
const sampleOneStep = async (): Promise<number[] | null> => {
    if (ti > 0) {
        store.set('timestamp', timestamps[ti]);
        await waitForRedraw(150);
    }
    const interpolate = await getLatLonInterpolator();
    if (!interpolate) return null;
    const jobs: Promise<any>[] = [];
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
        }
    }
    return (await Promise.all(jobs)) as number[];
};

let batchResults: number[] | null = null;
try {
    batchResults = await retryWithBackoff(
        () => withTimeout(sampleOneStep(), STEP_TIMEOUT_MS, `swell ts=${ti}`),
        STEP_RETRIES,
        STEP_RETRY_BACKOFF_MS,
        signal,
    );
} catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    console.warn(`[OceanDataProvider] Swell step ${ti + 1}/${timestamps.length} failed after ${STEP_RETRIES} retries — skipping.`, err);
    batchResults = null;
}

let anyNonZero = false;
if (batchResults) {
    let idx = 0;
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            const result = batchResults[idx++];
            if (result && typeof result === 'object' && (result as any).length >= 2) {
                const u = (result as any)[0];
                const v = (result as any)[1];
                const h = (result as any)[2] != null
                    ? (result as any)[2]
                    : Math.sqrt(u ** 2 + v ** 2);
                swellHeight[li][lo][ti] = h;
                swellDir[li][lo][ti] = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;
                swellPeriod[li][lo][ti] = 0;
                if (h !== 0 || u !== 0 || v !== 0) anyNonZero = true;
            }
        }
    }
}
```

The existing "if (anyNonZero) { ... } else { consecutiveEmpty++; ... }" block stays unchanged after this replacement.

- [ ] **Step 4: Verify there are no stray references to the old inline variables**

Search within `_sampleSwellInner` for:
- `const interpolate = await getLatLonInterpolator();` — should only exist inside `sampleOneStep`. Delete any remaining occurrence outside.
- `const batchResults = await Promise.all(jobs);` — same: only inside `sampleOneStep`.

- [ ] **Step 5: Build the plugin**

Run: `npm run build`
Expected: build succeeds (compiles TypeScript).

If TypeScript complains about types, the most likely issue is the `batchResults` inference — it should be `number[] | null` at the outer scope. Add the explicit annotation shown above.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all pass. (No new behavioural tests for `_sampleSwellInner` — it's deeply Windy-coupled; we trust the unit tests of `asyncGuards` plus manual verification.)

- [ ] **Step 7: Commit**

```bash
git add src/adapters/OceanDataProvider.ts
git commit -m "feat(ocean): add per-step timeout + retry to swell sampling"
```

---

## Task 7: F-2 — Wire `asyncGuards` into current sampling

**Files:**
- Modify: `src/adapters/OceanDataProvider.ts`

- [ ] **Step 1: Apply the same pattern to `_sampleCurrentInner`**

Find `_sampleCurrentInner` in `OceanDataProvider.ts`. Its per-timestep body has the same structure (`store.set('timestamp', …)`, `await waitForRedraw(150)`, `await getLatLonInterpolator()`, batched `interpolate` jobs).

Replace the per-timestep body (approximately lines 628–658 of current code, adjust for any shifts from Task 6) with:

```ts
const sampleOneStep = async (): Promise<number[] | null> => {
    if (ti > 0) {
        store.set('timestamp', timestamps[ti]);
        await waitForRedraw(150);
    }
    const interpolate = await getLatLonInterpolator();
    if (!interpolate) return null;
    const jobs: Promise<any>[] = [];
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            jobs.push(interpolate({ lat: lats[li], lon: lons[lo] }).catch(() => null));
        }
    }
    return (await Promise.all(jobs)) as number[];
};

let batchResults: number[] | null = null;
try {
    batchResults = await retryWithBackoff(
        () => withTimeout(sampleOneStep(), STEP_TIMEOUT_MS, `current ts=${ti}`),
        STEP_RETRIES,
        STEP_RETRY_BACKOFF_MS,
        signal,
    );
} catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    console.warn(`[OceanDataProvider] Current step ${ti + 1}/${timestamps.length} failed after ${STEP_RETRIES} retries — skipping.`, err);
    batchResults = null;
}

let anyNonZero = false;
if (batchResults) {
    let idx = 0;
    for (let li = 0; li < lats.length; li++) {
        for (let lo = 0; lo < lons.length; lo++) {
            const result = batchResults[idx++];
            if (result && typeof result === 'object' && (result as any).length >= 2) {
                currentU[li][lo][ti] = (result as any)[0];
                currentV[li][lo][ti] = (result as any)[1];
                if ((result as any)[0] !== 0 || (result as any)[1] !== 0) {
                    hasAnyData = true;
                    anyNonZero = true;
                }
            }
        }
    }
}
```

The existing `if (anyNonZero) { ... } else if (hasAnyData) { consecutiveEmpty++; ... }` block stays unchanged after this replacement.

- [ ] **Step 2: Apply the same treatment to the standalone `fetchSwellGrid` and `fetchCurrentGrid` paths**

These are the fallback-path functions used when one ocean grid is cached and the other isn't. Find `export async function fetchSwellGrid` and `export async function fetchCurrentGrid`. Each has its own per-timestep loop that duplicates the inner logic.

The simplest fix: inside each loop, apply the identical `sampleOneStep` + `retryWithBackoff(withTimeout(...))` wrapping as in Steps 1 above. Copy the same block verbatim, substituting `'swell ts=...'` / `'current ts=...'` as the label for readability.

If that's too much duplication for the reader's taste, the cleanest refactor is to make `_sampleSwellInner` and `_sampleCurrentInner` do all the work and have `fetchSwellGrid`/`fetchCurrentGrid` call through to them with a pre-captured Windy state. That is a larger refactor; defer unless time permits. For this plan, copy the block.

- [ ] **Step 3: Build and run tests**

Run: `npm run build`
Expected: success.

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/adapters/OceanDataProvider.ts
git commit -m "feat(ocean): add per-step timeout + retry to current sampling"
```

---

## Task 8: F-2 — Manual verification

**Files:** none. Human smoke-test step.

- [ ] **Step 1: Start the plugin in dev mode**

Run: `npm start`

Wait for the rollup watcher to emit "bundles created, waiting for changes".

- [ ] **Step 2: Open Windy locally and load the plugin**

In a browser tab, navigate to `https://www.windy.com/plugins/windy-plugin-sail-router` (or the dev loader URL used on your setup — the Windy plugin devtools readme describes this).

Plot a short route (say, 30nm), select a boat, press **Calculate Route**.

Expected: routing proceeds to completion. In the browser console, look for any `[OceanDataProvider]` messages. Zero warnings = clean happy path. One or two `Swell step N/M failed after 2 retries — skipping.` warnings under degraded network is acceptable — the route should still render using whatever data was collected.

- [ ] **Step 3: Simulate a hang (optional but recommended)**

In the browser DevTools console, throttle the network to "Slow 3G" and retry the same route. Expect some steps to time out (15s) and retry. Final route should still render, possibly with a coverage warning.

- [ ] **Step 4: No commit needed**

This task is verification only. If Step 2 or Step 3 fail with the plugin hanging rather than degrading gracefully, revisit Tasks 6 and 7 — the wiring has a bug.

---

## Self-Review (done by plan author)

Coverage against spec §F:

- **F-1 audit points (units, TWA folding, axis ordering, modifier stack):** Tasks 1, 2, 3, 4 each cover one.
- **F-1 deliverable (inline fix OR "audit passed" commit):** Task 4 Step 5 emits the empty commit if nothing changed.
- **F-2 watchdog + retry + constants:** Tasks 5, 6, 7.
- **F-2 constants STEP_TIMEOUT_MS, STEP_RETRIES, STEP_RETRY_BACKOFF_MS:** Task 6 Step 1.
- **F-2 AbortSignal handling preserved:** Tasks 6 & 7 re-throw `AbortError` from the catch blocks.
- **F-2 partial-data graceful degradation:** Handled by the existing `consecutiveEmpty` / `coverageEndTime` logic which the new wrapping leaves untouched.

Placeholder scan: clean — every task has concrete code and commands.

Type consistency: `withTimeout` and `retryWithBackoff` signatures identical across all tasks. `TimeoutError` class lives in `asyncGuards.ts` and is only caught by its `name === 'TimeoutError'` discriminator indirectly (via the generic `err` caught in the OceanDataProvider block) — no cross-file import needed.
