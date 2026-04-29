<div class="player-controls">
    <!-- Row 1: Time display + Play/Pause -->
    <div class="row row--top mb-10">
        <span class="time-display size-s">{formatTime(currentTime)}</span>
        <button class="button size-s play-btn" on:click={togglePlay}>
            {isPlaying ? '⏸' : '▶'}
        </button>
    </div>

    <!-- Row 2: Time scrubber with Start/Finish/waypoint dots just above -->
    <div class="row mb-10">
        <div class="scrubber-wrap">
            {#if results.length > 0}
                <div class="track-dots">
                    <div class="track-dot track-dot--start" title="Start">S</div>
                    {#each waypointFractions as f, i}
                        <div class="track-dot track-dot--wpt" style="left: {f * 100}%" title="Waypoint {i + 1}">{i + 1}</div>
                    {/each}
                    <div class="track-dot track-dot--end" title="Finish">F</div>
                </div>
            {/if}
            <input
                type="range"
                class="scrubber"
                min={minTime}
                max={maxTime}
                step={60000}
                bind:value={currentTime}
                on:input={handleScrub}
            />
        </div>
    </div>

</div>

<script lang="ts">
    import { onDestroy } from 'svelte';

    import type { LatLon, ModelRouteResult } from '../routing/types';
    import { waypointEtas } from '../routing/waypointEta';

    export let results: ModelRouteResult[] = [];
    export let waypoints: LatLon[] = [];
    export let onTimeChange: (time: number) => void = () => {};

    /**
     * Set time from an external source (e.g. Windy timeline bar).
     * Updates scrubber position and triggers boat marker updates.
     */
    export function setTime(time: number): void {
        if (isPlaying) return; // Don't interrupt playback
        if (time < minTime || time > maxTime) return;
        currentTime = time;
    }

    // Reactive computed bounds
    $: minTime =
        results.length > 0
            ? Math.min(...results.map(r => r.route.path[0]?.time ?? Infinity))
            : Date.now();

    $: maxTime =
        results.length > 0 ? Math.max(...results.map(r => r.route.eta)) : Date.now() + 3600000;

    // Waypoint crossings as fractions of the scrubber range.
    $: waypointFractions = (() => {
        if (!waypoints.length || results.length === 0) return [];
        const span = maxTime - minTime;
        if (span <= 0) return [];
        // Use the first route's path — all models share the same waypoints.
        const etas = waypointEtas(results[0].route.path, waypoints);
        return etas
            .map(t => (t - minTime) / span)
            .filter(f => f >= 0 && f <= 1);
    })();

    // Reactive defaults
    $: if (results.length > 0 && currentTime === 0) {
        currentTime = minTime;
    }

    let currentTime = 0;
    let isPlaying = false;
    let rafId: number | null = null;
    let lastRealTime: number | null = null;

    function formatTime(ts: number): string {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function handleScrub(): void {
        onTimeChange(currentTime);
    }

    function togglePlay(): void {
        if (isPlaying) {
            stopPlay();
        } else {
            startPlay();
        }
    }

    function startPlay(): void {
        // If at end, restart from beginning
        if (currentTime >= maxTime) {
            currentTime = minTime;
        }
        isPlaying = true;
        lastRealTime = null;
        rafId = requestAnimationFrame(tick);
    }

    function stopPlay(): void {
        isPlaying = false;
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
        lastRealTime = null;
    }

    function tick(now: number): void {
        if (!isPlaying) return;

        if (lastRealTime === null) {
            lastRealTime = now;
        }

        const deltaMs = now - lastRealTime;
        lastRealTime = now;

        // 1 hour of route time per second of real time:
        // 1s real = 3600s route = 3,600,000ms route
        // => deltaMs real * 3600 = route ms to advance
        currentTime = currentTime + deltaMs * 3600;

        if (currentTime >= maxTime) {
            currentTime = maxTime;
            onTimeChange(currentTime);
            stopPlay();
            return;
        }

        onTimeChange(currentTime);
        rafId = requestAnimationFrame(tick);
    }

    onDestroy(() => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
        }
    });
</script>

<style lang="less">
    .player-controls {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 12px;
        margin-top: 10px;
    }

    .row {
        display: flex;
        align-items: center;
        width: 100%;
    }

    .row--top {
        justify-content: space-between;
        gap: 8px;
    }

    .time-display {
        flex: 1;
        opacity: 0.9;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .play-btn {
        flex-shrink: 0;
        min-width: 36px;
        text-align: center;
        padding: 4px 8px;
    }

    .scrubber-wrap {
        position: relative;
        width: 100%;
        padding-top: 22px; /* leave room for the S/F/waypoint row above */
    }

    .track-dots {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 16px;
        pointer-events: none;
    }

    .track-dot {
        position: absolute;
        top: 0;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        line-height: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 0 0 2px rgba(27, 36, 51, 0.95), 0 1px 3px rgba(0, 0, 0, 0.5);
        transform: translateX(-50%);
    }
    /* Vertical drop line from each dot down to the slider rail. */
    .track-dot::after {
        content: '';
        position: absolute;
        left: 50%;
        top: 100%;
        width: 2px;
        height: 14px;
        border-radius: 1px;
        transform: translateX(-50%);
        pointer-events: none;
    }
    .track-dot--start {
        left: 0;
        background: radial-gradient(circle at 30% 30%, #22c55e, #15803d);
    }
    .track-dot--start::after {
        background: linear-gradient(to bottom, rgba(34, 197, 94, 0.9), rgba(34, 197, 94, 0.05));
    }
    .track-dot--end {
        left: 100%;
        background: radial-gradient(circle at 30% 30%, #ef4444, #991b1b);
    }
    .track-dot--end::after {
        background: linear-gradient(to bottom, rgba(239, 68, 68, 0.9), rgba(239, 68, 68, 0.05));
    }
    .track-dot--wpt {
        background: radial-gradient(circle at 30% 30%, #60a5fa, #1d4ed8);
    }
    .track-dot--wpt::after {
        background: linear-gradient(to bottom, rgba(96, 165, 250, 0.9), rgba(96, 165, 250, 0.05));
    }

    .scrubber {
        width: 100%;
        cursor: pointer;
        accent-color: #457b9d;
    }

    @media (max-width: 600px) {
        .play-btn {
            min-width: 44px;
            padding: 6px 10px;
        }
    }
</style>
