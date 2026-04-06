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
    .disclaimer {
        opacity: 0.4;
        line-height: 1.4;
        font-style: italic;
    }
</style>
