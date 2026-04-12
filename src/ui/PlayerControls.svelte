<div class="player-controls">
    <!-- Row 1: Time display + Play/Pause -->
    <div class="row row--top mb-10">
        <span class="time-display size-s">{formatTime(currentTime)}</span>
        <button class="button size-s play-btn" on:click={togglePlay}>
            {isPlaying ? '⏸' : '▶'}
        </button>
    </div>

    <!-- Row 2: Time scrubber -->
    <div class="row mb-10">
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

<script lang="ts">
    import { onDestroy } from 'svelte';

    import type { ModelRouteResult } from '../routing/types';

    export let results: ModelRouteResult[] = [];
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
        padding: 5px 0;
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
