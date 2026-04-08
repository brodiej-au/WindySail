<!-- Button to open modal -->
{#if hasData}
    <button class="open-chart-btn size-s" on:click={openModal}>
        Route Conditions ›
    </button>
{/if}

<!-- Modal overlay -->
{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="size-m">Route Conditions</h3>
                <button class="close-btn" on:click={closeModal}>✕</button>
            </div>
            <div class="modal-body">
                <canvas bind:this={canvasEl}></canvas>
            </div>
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
    import type { RoutePoint } from '../routing/types';

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

    export let path: RoutePoint[] = [];

    let canvasEl: HTMLCanvasElement;
    let chart: Chart | null = null;
    let showModal = false;

    $: hasSwell = path.some(p => p.swell != null);
    $: hasCurrents = path.some(p => p.current != null);
    // Always show button if we have route data (wind data is always available)
    $: hasData = path.length > 1;

    async function openModal(): Promise<void> {
        showModal = true;
        await tick();
        if (canvasEl) buildChart(path);
    }

    function closeModal(): void {
        destroyChart();
        showModal = false;
    }

    function handleBackdropClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
            closeModal();
        }
    }

    function destroyChart(): void {
        if (chart) {
            chart.destroy();
            chart = null;
        }
    }

    function buildChart(pts: RoutePoint[]): void {
        destroyChart();
        if (!canvasEl || pts.length < 2) return;

        const labels = pts.map(p => p.time);
        const datasets: any[] = [];

        // Always show wind speed (TWS) — it's always available
        datasets.push({
            label: 'Wind Speed (kt)',
            data: pts.map(p => p.tws),
            borderColor: 'rgba(255, 165, 0, 0.9)',
            backgroundColor: 'rgba(255, 165, 0, 0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2,
            yAxisID: 'y',
        });

        // Boat speed
        datasets.push({
            label: 'Boat Speed (kt)',
            data: pts.map(p => p.boatSpeed),
            borderColor: 'rgba(255, 255, 255, 0.7)',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [5, 3],
            yAxisID: 'y',
        });

        if (hasSwell) {
            datasets.push({
                label: 'Swell Height (m)',
                data: pts.map(p => p.swell?.height ?? null),
                borderColor: 'rgba(100, 149, 237, 0.9)',
                backgroundColor: 'rgba(100, 149, 237, 0.15)',
                fill: true,
                tension: 0.3,
                pointRadius: 0,
                borderWidth: 2,
                yAxisID: 'y1',
            });
        }

        if (hasCurrents) {
            datasets.push({
                label: 'Current Speed (kt)',
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

        const hasRightAxis = hasSwell || hasCurrents;

        chart = new Chart(canvasEl, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
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
                                return `${item.dataset.label}: ${item.parsed.y.toFixed(2)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            displayFormats: {
                                hour: 'EEE HH:mm',
                                day: 'EEE dd',
                            },
                        },
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
                        display: hasRightAxis,
                        position: 'right',
                        title: {
                            display: true,
                            text: hasSwell && hasCurrents ? 'Swell (m) / Current (kt)' : hasSwell ? 'Swell (m)' : 'Current (kt)',
                            color: 'rgba(100, 149, 237, 0.8)',
                            font: { size: 11 },
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 11 } },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    onDestroy(() => {
        destroyChart();
    });
</script>

<style lang="less">
    .open-chart-btn {
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
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    }

    .modal-container {
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        width: 90vw;
        max-width: 900px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);

        h3 {
            margin: 0;
            opacity: 0.9;
        }
    }

    .close-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;

        &:hover {
            color: rgba(255, 255, 255, 0.9);
        }
    }

    .modal-body {
        padding: 18px;
        height: 350px;
        position: relative;

        canvas {
            width: 100% !important;
            height: 100% !important;
        }
    }
</style>
