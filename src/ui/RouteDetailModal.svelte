<!-- Button to open modal -->
<button class="open-detail-btn size-s" on:click={openModal}>
    Route Details ›
</button>

<!-- Modal overlay -->
{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container">
            <!-- Header with model tabs -->
            <div class="modal-header">
                <h3 class="size-m">Route Details</h3>
                <div class="model-tabs">
                    {#each results as mr, i}
                        <button
                            class="model-tab size-xs"
                            class:active={selectedIndex === i}
                            style:border-color={mr.color}
                            style:background={selectedIndex === i ? mr.color + '30' : 'transparent'}
                            on:click={() => selectModel(i)}
                        >
                            <span class="tab-dot" style:background={mr.color}></span>
                            {MODEL_LABELS[mr.model]}
                        </button>
                    {/each}
                </div>
                <button class="close-btn" on:click={closeModal}>✕</button>
            </div>

            <!-- Trip summary -->
            {#if results[selectedIndex]}
            {@const route = results[selectedIndex].route}
            <div class="trip-summary">
                <div class="summary-item">
                    <span class="summary-label size-xs">Departure</span>
                    <span class="summary-value size-s">{formatDateTime(route.path[0].time)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label size-xs">ETA</span>
                    <span class="summary-value size-s">{formatDateTime(route.eta)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label size-xs">Duration</span>
                    <span class="summary-value size-s">{formatDuration(route.durationHours)}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label size-xs">Distance</span>
                    <span class="summary-value size-s">{route.totalDistanceNm.toFixed(1)} nm</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label size-xs">Avg SOG</span>
                    <span class="summary-value size-s">{route.avgSpeedKt.toFixed(1)} kt</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label size-xs">Max TWS</span>
                    <span class="summary-value size-s">{route.maxTws.toFixed(0)} kt</span>
                </div>
            </div>

            <!-- Dataset toggles -->
            <div class="dataset-toggles">
                <label class="dataset-toggle size-xs">
                    <input type="checkbox" bind:checked={visibleDatasets.wind} on:change={rebuildChart} />
                    <span class="toggle-dot" style="background: rgba(255, 165, 0, 0.9)"></span>
                    Wind
                </label>
                <label class="dataset-toggle size-xs">
                    <input type="checkbox" bind:checked={visibleDatasets.sog} on:change={rebuildChart} />
                    <span class="toggle-dot" style="background: rgba(255, 255, 255, 0.8)"></span>
                    SOG
                </label>
                <label class="dataset-toggle size-xs">
                    <input type="checkbox" bind:checked={visibleDatasets.twa} on:change={rebuildChart} />
                    <span class="toggle-dot" style="background: rgba(233, 196, 106, 0.9)"></span>
                    TWA
                </label>
                {#if hasSwell}
                <label class="dataset-toggle size-xs">
                    <input type="checkbox" bind:checked={visibleDatasets.swell} on:change={rebuildChart} />
                    <span class="toggle-dot" style="background: rgba(100, 149, 237, 0.9)"></span>
                    Swell
                </label>
                {/if}
                {#if hasCurrents}
                <label class="dataset-toggle size-xs">
                    <input type="checkbox" bind:checked={visibleDatasets.current} on:change={rebuildChart} />
                    <span class="toggle-dot" style="background: rgba(75, 192, 130, 0.9)"></span>
                    Current
                </label>
                {/if}
            </div>

            <!-- Chart -->
            <div class="modal-body">
                <canvas bind:this={canvasEl}></canvas>
            </div>

            <!-- Leg table -->
            <div class="leg-table-container">
                <table class="leg-table size-xs">
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>TWS</th>
                            <th>TWA</th>
                            <th>HDG</th>
                            <th>SOG</th>
                            {#if hasSwell}<th>Swell</th>{/if}
                            {#if hasCurrents}<th>Current</th>{/if}
                        </tr>
                    </thead>
                    <tbody>
                        {#each legPoints as pt}
                            <tr class:motoring-row={pt.isMotoring}>
                                <td>{formatTime(pt.time)}</td>
                                <td>{pt.tws.toFixed(1)}</td>
                                <td>{pt.twa.toFixed(0)}°</td>
                                <td>{pt.heading.toFixed(0)}°</td>
                                <td>{pt.boatSpeed.toFixed(1)}{pt.isMotoring ? ' ⚙' : ''}</td>
                                {#if hasSwell}<td>{pt.swell ? pt.swell.height.toFixed(1) + 'm' : '-'}</td>{/if}
                                {#if hasCurrents}<td>{pt.current ? pt.current.speed.toFixed(1) + 'kt' : '-'}</td>{/if}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
            {/if}
        </div>
    </div>
{/if}

<script lang="ts">
    import { onDestroy, tick } from 'svelte';
    import {
        Chart,
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        TimeScale,
        Tooltip,
        Legend,
        Filler,
    } from 'chart.js';
    import 'chartjs-adapter-date-fns';
    import type { ModelRouteResult, RoutePoint } from '../routing/types';
    import { MODEL_LABELS } from '../map/modelColors';

    Chart.register(
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        TimeScale,
        Tooltip,
        Legend,
        Filler,
    );

    export let results: ModelRouteResult[] = [];

    let canvasEl: HTMLCanvasElement;
    let chart: Chart | null = null;
    let showModal = false;
    let selectedIndex = 0;
    let visibleDatasets: Record<string, boolean> = {
        wind: true,
        sog: true,
        twa: true,
        swell: true,
        current: true,
    };

    // Module-level route points for the motoring bands plugin
    let chartRoutePoints: RoutePoint[] = [];

    $: selectedPath = results[selectedIndex]?.route.path ?? [];
    $: hasSwell = selectedPath.some(p => p.swell != null);
    $: hasCurrents = selectedPath.some(p => p.current != null);

    // Sample every Nth point for leg table (max ~20 rows)
    $: legPoints = samplePoints(selectedPath, 20);

    function samplePoints(pts: RoutePoint[], maxRows: number): RoutePoint[] {
        if (pts.length <= maxRows) return pts;
        const step = Math.ceil(pts.length / maxRows);
        const sampled: RoutePoint[] = [];
        for (let i = 0; i < pts.length; i += step) {
            sampled.push(pts[i]);
        }
        // Always include last point
        if (sampled[sampled.length - 1] !== pts[pts.length - 1]) {
            sampled.push(pts[pts.length - 1]);
        }
        return sampled;
    }

    async function openModal(): Promise<void> {
        showModal = true;
        await tick();
        if (canvasEl) buildChart(selectedPath);
    }

    function closeModal(): void {
        destroyChart();
        showModal = false;
    }

    async function selectModel(index: number): Promise<void> {
        selectedIndex = index;
        await tick();
        if (canvasEl && showModal) buildChart(selectedPath);
    }

    function handleBackdropClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
            closeModal();
        }
    }

    function rebuildChart(): void {
        if (canvasEl && showModal) buildChart(selectedPath);
    }

    function destroyChart(): void {
        if (chart) {
            chart.destroy();
            chart = null;
        }
    }

    // Motoring bands plugin - draws subtle background bands for motoring segments
    const motoringBandsPlugin = {
        id: 'motoringBands',
        beforeDraw(chart: Chart) {
            const pts = chartRoutePoints;
            if (!pts || pts.length < 2) return;

            const { ctx } = chart;
            const xScale = chart.scales['x'];
            const { top, bottom } = chart.chartArea;
            if (!xScale) return;

            ctx.save();
            ctx.fillStyle = 'rgba(233, 196, 106, 0.06)';

            let bandStart: number | null = null;
            for (let i = 0; i < pts.length; i++) {
                if (pts[i].isMotoring) {
                    if (bandStart === null) bandStart = i;
                } else {
                    if (bandStart !== null) {
                        const x0 = xScale.getPixelForValue(pts[bandStart].time);
                        const x1 = xScale.getPixelForValue(pts[i - 1].time);
                        ctx.fillRect(x0, top, x1 - x0, bottom - top);
                        bandStart = null;
                    }
                }
            }
            // Close any trailing motoring band
            if (bandStart !== null) {
                const x0 = xScale.getPixelForValue(pts[bandStart].time);
                const x1 = xScale.getPixelForValue(pts[pts.length - 1].time);
                ctx.fillRect(x0, top, x1 - x0, bottom - top);
            }

            ctx.restore();
        },
    };

    function buildChart(pts: RoutePoint[]): void {
        destroyChart();
        if (!canvasEl || pts.length < 2) return;

        // Store route points for the motoring bands plugin and tooltip access
        chartRoutePoints = pts;

        const labels = pts.map(p => p.time);
        const datasets: any[] = [];

        // Wind speed (always available)
        if (visibleDatasets.wind) {
            datasets.push({
                label: 'Wind (kt)',
                data: pts.map(p => p.tws),
                borderColor: 'rgba(255, 165, 0, 0.9)',
                backgroundColor: 'rgba(255, 165, 0, 0.08)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
                yAxisID: 'y',
            });
        }

        // Boat speed (always available)
        if (visibleDatasets.sog) {
            datasets.push({
                label: 'SOG (kt)',
                data: pts.map(p => p.boatSpeed),
                borderColor: 'rgba(255, 255, 255, 0.8)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1.5,
                borderDash: [5, 3],
                yAxisID: 'y',
            });
        }

        // TWA trace
        if (visibleDatasets.twa) {
            datasets.push({
                label: 'TWA (deg)',
                data: pts.map(p => p.twa),
                borderColor: 'rgba(233, 196, 106, 0.9)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 1.5,
                borderDash: [4, 4],
                yAxisID: 'y2',
            });
        }

        if (hasSwell && visibleDatasets.swell) {
            datasets.push({
                label: 'Swell (m)',
                data: pts.map(p => p.swell?.height ?? null),
                borderColor: 'rgba(100, 149, 237, 0.9)',
                backgroundColor: 'rgba(100, 149, 237, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
                yAxisID: 'y1',
            });
        }

        if (hasCurrents && visibleDatasets.current) {
            datasets.push({
                label: 'Current (kt)',
                data: pts.map(p => p.current?.speed ?? null),
                borderColor: 'rgba(75, 192, 130, 0.9)',
                backgroundColor: 'transparent',
                fill: false,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
                yAxisID: 'y1',
            });
        }

        const showY1 = (hasSwell && visibleDatasets.swell) || (hasCurrents && visibleDatasets.current);
        const showY2 = visibleDatasets.twa;

        // Determine y1 title text
        const showSwellAxis = hasSwell && visibleDatasets.swell;
        const showCurrentAxis = hasCurrents && visibleDatasets.current;
        const y1Title = showSwellAxis && showCurrentAxis
            ? 'Swell (m) / Current (kt)'
            : showSwellAxis ? 'Swell (m)' : 'Current (kt)';

        chart = new Chart(canvasEl, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            color: 'rgba(255, 255, 255, 0.7)',
                            boxWidth: 12,
                            font: { size: 11 },
                            padding: 15,
                        },
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        titleColor: 'rgba(255, 255, 255, 0.9)',
                        bodyColor: 'rgba(255, 255, 255, 0.8)',
                        callbacks: {
                            title(items) {
                                if (!items.length) return '';
                                const d = new Date(items[0].parsed.x);
                                return d.toLocaleString(undefined, {
                                    weekday: 'short',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                });
                            },
                            label(item) {
                                return `${item.dataset.label}: ${item.parsed.y.toFixed(1)}`;
                            },
                            afterBody(items) {
                                if (!items.length) return '';
                                const idx = items[0].dataIndex;
                                const pt = chartRoutePoints[idx];
                                if (!pt) return '';
                                const mode = pt.isMotoring ? 'Motoring \u2699' : 'Sailing';
                                return `Mode: ${mode}\nHeading: ${pt.heading.toFixed(0)}\u00B0`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { displayFormats: { hour: 'EEE HH:mm', day: 'EEE dd' } },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', maxRotation: 0, font: { size: 11 } },
                        grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    },
                    y: {
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Speed (kt)',
                            color: 'rgba(255, 165, 0, 0.8)',
                            font: { size: 11 },
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
                        grid: { color: 'rgba(255, 255, 255, 0.08)' },
                        beginAtZero: true,
                    },
                    y1: {
                        display: showY1,
                        position: 'right',
                        title: {
                            display: true,
                            text: y1Title,
                            color: 'rgba(100, 149, 237, 0.8)',
                            font: { size: 11 },
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true,
                    },
                    y2: {
                        display: showY2,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'TWA (deg)',
                            color: 'rgba(233, 196, 106, 0.8)',
                            font: { size: 11 },
                        },
                        min: 0,
                        max: 180,
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
                        grid: { drawOnChartArea: false },
                    },
                },
            },
            plugins: [motoringBandsPlugin],
        });
    }

    function formatDateTime(ts: number): string {
        return new Date(ts).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatTime(ts: number): string {
        return new Date(ts).toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatDuration(hours: number): string {
        const days = Math.floor(hours / 24);
        const hrs = Math.floor(hours % 24);
        return days > 0 ? `${days}d ${hrs}h` : `${hrs}h`;
    }

    onDestroy(() => {
        destroyChart();
    });
</script>

<style lang="less">
    .open-detail-btn {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        cursor: pointer;
        text-align: left;
        opacity: 0.85;
        transition: all 0.2s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
            opacity: 1;
        }
    }

    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    }

    .modal-container {
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        width: 92vw;
        max-width: 950px;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        overflow: hidden;
    }

    .modal-header {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);

        h3 {
            margin: 0;
            opacity: 0.9;
            white-space: nowrap;
        }
    }

    .model-tabs {
        display: flex;
        gap: 6px;
        flex: 1;
        justify-content: center;
    }

    .model-tab {
        padding: 4px 12px;
        border: 1px solid;
        border-radius: 4px;
        background: transparent;
        color: rgba(255, 255, 255, 0.7);
        cursor: pointer;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 5px;
        transition: all 0.15s ease;

        &:hover {
            color: rgba(255, 255, 255, 0.9);
        }

        &.active {
            color: #fff;
            font-weight: 600;
        }
    }

    .tab-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }

    .close-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;

        &:hover {
            color: rgba(255, 255, 255, 0.9);
        }
    }

    .trip-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 20px;
        padding: 10px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .summary-item {
        display: flex;
        flex-direction: column;
    }

    .summary-label {
        opacity: 0.5;
        line-height: 1.3;
    }

    .summary-value {
        font-weight: 500;
        opacity: 0.9;
    }

    .dataset-toggles {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        padding: 6px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .dataset-toggle {
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.7);
        user-select: none;

        input[type='checkbox'] {
            width: 13px;
            height: 13px;
            margin: 0;
            accent-color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
        }

        &:hover {
            color: rgba(255, 255, 255, 0.9);
        }
    }

    .toggle-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .modal-body {
        padding: 12px 16px;
        height: 280px;
        position: relative;
        flex-shrink: 0;

        canvas {
            width: 100% !important;
            height: 100% !important;
        }
    }

    .leg-table-container {
        flex: 1;
        overflow-y: auto;
        padding: 0 16px 12px;
        min-height: 0;
        max-height: 200px;
    }

    .leg-table {
        width: 100%;
        border-collapse: collapse;

        th {
            position: sticky;
            top: 0;
            background: #1a1a2e;
            opacity: 0.5;
            font-weight: normal;
            text-align: left;
            padding: 4px 6px 4px 0;
            white-space: nowrap;
        }

        td {
            padding: 3px 6px 3px 0;
            white-space: nowrap;
            opacity: 0.8;
        }

        tr.motoring-row td {
            color: #e9c46a;
        }
    }
</style>
