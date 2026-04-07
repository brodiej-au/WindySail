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

    <!-- Row 3: Model toggle buttons (only if multi-model) -->
    {#if results.length > 1}
        <div class="row row--models">
            {#each results as r}
                <button
                    class="button size-xs model-btn"
                    class:model-btn--active={activeModel === r.model}
                    style:border-color={r.color}
                    style:background={activeModel === r.model
                        ? r.color + '33'
                        : 'rgba(255,255,255,0.06)'}
                    on:click={() => handleModelSwitch(r.model)}
                >
                    {MODEL_LABELS[r.model]}
                </button>
            {/each}
        </div>
    {/if}
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';

    import { MODEL_LABELS } from '../map/modelColors';
    import type { ModelRouteResult, WindModelId } from '../routing/types';

    export let results: ModelRouteResult[] = [];
    export let onTimeChange: (time: number) => void = () => {};
    export let onModelSwitch: (model: WindModelId) => void = () => {};

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

    $: if (results.length > 0 && activeModel === null) {
        activeModel = results[0].model;
    }

    let currentTime = 0;
    let isPlaying = false;
    let activeModel: WindModelId | null = null;
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

    function handleModelSwitch(model: WindModelId): void {
        activeModel = model;
        onModelSwitch(model);
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

    .row--models {
        gap: 6px;
        flex-wrap: wrap;
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

    .model-btn {
        border-width: 2px;
        border-style: solid;
        border-radius: 4px;
        cursor: pointer;
        color: inherit;
        opacity: 0.85;
        transition:
            opacity 0.15s,
            background 0.15s;
        padding: 3px 8px;

        &:hover {
            opacity: 1;
        }

        &.model-btn--active {
            opacity: 1;
        }
    }
</style>
