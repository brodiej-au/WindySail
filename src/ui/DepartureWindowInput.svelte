<div class="departure-window">
    <div class="dw-row">
        <label class="size-xs label" for="dw-from">From:</label>
        <input id="dw-from" type="datetime-local" bind:value={fromStr} class="input size-s" />
    </div>
    <div class="dw-row">
        <label class="size-xs label" for="dw-to">To:</label>
        <input id="dw-to" type="datetime-local" bind:value={toStr} class="input size-s" />
    </div>
    <div class="dw-row dw-row--interval">
        <label class="size-xs label" for="dw-interval">Every:</label>
        <select id="dw-interval" class="input size-s" bind:value={intervalHours}>
            <option value={3}>3 hours</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
        </select>
    </div>
    <div class="dw-summary size-xs">
        {departureCount} departures &times; {modelCount} model{modelCount !== 1 ? 's' : ''} = {departureCount * modelCount} routes
    </div>
</div>

<script lang="ts">
    import type { DepartureWindowConfig } from '../routing/types';

    export let modelCount: number = 1;

    let fromStr = formatDateForInput(new Date());
    let toStr = formatDateForInput(new Date(Date.now() + 3 * 24 * 3600_000));
    let intervalHours = 6;

    $: departureCount = computeDepartureCount(fromStr, toStr, intervalHours);

    function computeDepartureCount(from: string, to: string, interval: number): number {
        const start = new Date(from).getTime();
        const end = new Date(to).getTime();
        if (isNaN(start) || isNaN(end) || end < start || interval <= 0) return 0;
        return Math.floor((end - start) / (interval * 3600_000)) + 1;
    }

    function formatDateForInput(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    export function getWindowConfig(): DepartureWindowConfig {
        return {
            windowStart: new Date(fromStr).getTime(),
            windowEnd: new Date(toStr).getTime(),
            intervalHours,
        };
    }
</script>

<style lang="less">
    .departure-window {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .dw-row {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .dw-row--interval {
        select {
            width: 100%;
        }
    }

    .dw-summary {
        opacity: 0.6;
        line-height: 1.4;
    }

    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 0;
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

    select.input {
        cursor: pointer;
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(255,255,255,0.5)'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 8px center;
        padding-right: 24px;

        option {
            background: #1a1a2e;
            color: #e0e0e0;
        }
    }
</style>
