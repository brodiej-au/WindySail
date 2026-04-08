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

    <!-- Boat / polar -->
    <div class="section mb-10">
        <span class="size-xs label">Boat:</span>
        <span class="size-s">{polarName}</span>
    </div>

    <!-- Settings panel (collapsible) -->
    <SettingsPanel />

    <!-- Departure time -->
    <div class="section mb-15 mt-10">
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
    {#if results.length === 1}
        {@const r = results[0].route}
        <div class="section results">
            <h3 class="size-m mb-10">Route Summary</h3>
            <div class="result-grid">
                <div class="result-item">
                    <span class="size-xs label">ETA</span>
                    <span class="size-s">{formatEta(r.eta)}</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Distance</span>
                    <span class="size-s">{r.totalDistanceNm.toFixed(1)} nm</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Avg SOG</span>
                    <span class="size-s">{r.avgSpeedKt.toFixed(1)} kt</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Max TWS</span>
                    <span class="size-s">{r.maxTws.toFixed(0)} kt</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Duration</span>
                    <span class="size-s">{formatDuration(r.durationHours)}</span>
                </div>
            </div>

            <button class="button size-s mt-15" style="width:100%" on:click={handleClear}>
                Clear Route
            </button>
        </div>
    {:else if results.length > 1}
        <div class="section results">
            <h3 class="size-m mb-10">Route Comparison</h3>
            <table class="comparison-table size-xs">
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>ETA</th>
                        <th>Dist</th>
                        <th>SOG</th>
                        <th>TWS</th>
                        <th>Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {#each results as mr (mr.model)}
                        {@const fastest = mr.route.durationHours === fastestDuration}
                        <tr class:fastest-row={fastest}>
                            <td class="model-cell">
                                <span class="model-dot" style:background={mr.color}></span>
                                <span class={fastest ? 'fastest-label' : ''}
                                    >{MODEL_LABELS[mr.model]}</span
                                >
                            </td>
                            <td>{formatEta(mr.route.eta)}</td>
                            <td>{mr.route.totalDistanceNm.toFixed(0)} nm</td>
                            <td>{mr.route.avgSpeedKt.toFixed(1)}</td>
                            <td>{mr.route.maxTws.toFixed(0)}</td>
                            <td>{formatDuration(mr.route.durationHours)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>

            <!-- Failed model warnings -->
            {#if failedModels.length > 0}
                <div class="failed-list mt-10">
                    {#each failedModels as fm}
                        <div class="failed-item size-xs">
                            ⚠ {MODEL_LABELS[fm.model]}: {fm.reason}
                        </div>
                    {/each}
                </div>
            {/if}

            <button class="button size-s mt-15" style="width:100%" on:click={handleClear}>
                Clear Route
            </button>
        </div>
    {/if}

    <!-- Route Detail Modal -->
    {#if results.length > 0}
        <RouteDetailModal {results} />
    {/if}

    <!-- Player controls -->
    {#if results.length > 0}
        <PlayerControls
            {results}
            {onTimeChange}
            {onModelSwitch}
        />
    {/if}

    <!-- Disclaimer -->
    <div class="disclaimer size-xs mt-15">
        Routes are advisory only. Not a substitute for proper passage planning and seamanship.
    </div>
</div>

<script lang="ts">
    import ProgressBar from './ProgressBar.svelte';
    import SettingsPanel from './SettingsPanel.svelte';
    import PlayerControls from './PlayerControls.svelte';
    import RouteDetailModal from './RouteDetailModal.svelte';

    import type { LatLon, ModelRouteResult, WindModelId } from '../routing/types';
    import type { WaypointState } from '../map/WaypointManager';
    import { MODEL_LABELS } from '../map/modelColors';

    export let waypointState: WaypointState = 'WAITING_START';
    export let start: LatLon | null = null;
    export let end: LatLon | null = null;
    export let isRouting: boolean = false;
    export let progressPercent: number = 0;
    export let progressStatus: string = '';
    export let results: ModelRouteResult[] = [];
    export let failedModels: { model: WindModelId; reason: string }[] = [];
    export let polarName: string = 'Bavaria 38';
    export let error: string | null = null;

    export let onCalculate: () => void = () => {};
    export let onCancel: () => void = () => {};
    export let onClear: () => void = () => {};
    export let onTimeChange: (time: number) => void = () => {};
    export let onModelSwitch: (model: WindModelId) => void = () => {};

    // Default departure to now, formatted for datetime-local input
    let departureStr = formatDateForInput(new Date());

    export function getDepartureTime(): number {
        return new Date(departureStr).getTime();
    }

    $: canCalculate = waypointState === 'READY' && !isRouting;

    $: fastestDuration =
        results.length > 1 ? Math.min(...results.map((r) => r.route.durationHours)) : Infinity;

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
            return '\u2014';
        }
        return `${pos.lat.toFixed(3)}\u00B0, ${pos.lon.toFixed(3)}\u00B0`;
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

    /* Comparison table */
    .comparison-table {
        width: 100%;
        border-collapse: collapse;
        line-height: 1.5;

        th {
            opacity: 0.5;
            font-weight: normal;
            text-align: left;
            padding: 0 4px 4px 0;
            white-space: nowrap;
        }

        td {
            padding: 3px 4px 3px 0;
            white-space: nowrap;
        }

        tr.fastest-row {
            background: rgba(255, 255, 255, 0.06);
            border-radius: 3px;
            font-weight: 600;
        }
    }

    .model-cell {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .model-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .fastest-label {
        font-weight: 600;
    }

    /* Failed models */
    .failed-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .failed-item {
        color: #e9c46a;
        opacity: 0.85;
        line-height: 1.4;
    }

    .disclaimer {
        opacity: 0.4;
        line-height: 1.4;
        font-style: italic;
    }
</style>
