<div class="conditions-chart">
    <h4 class="size-xs chart-title">Route Conditions</h4>
    <canvas bind:this={canvasEl} height="160"></canvas>
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
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

    $: if (canvasEl && path.length > 0) {
        buildChart(path);
    }

    function buildChart(pts: RoutePoint[]): void {
        if (chart) {
            chart.destroy();
            chart = null;
        }

        const hasSwell = pts.some(p => p.swell != null);
        const hasCurrents = pts.some(p => p.current != null);

        if (!hasSwell && !hasCurrents) return;

        const labels = pts.map(p => p.time);

        const datasets: any[] = [];

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
                yAxisID: 'y',
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
                            color: 'rgba(255, 255, 255, 0.6)',
                            boxWidth: 12,
                            font: { size: 10 },
                        },
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
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
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', maxRotation: 0, font: { size: 10 } },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                    },
                    y: {
                        display: hasSwell,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Swell (m)',
                            color: 'rgba(100, 149, 237, 0.8)',
                            font: { size: 10 },
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 10 } },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        beginAtZero: true,
                    },
                    y1: {
                        display: hasCurrents,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Current (kt)',
                            color: 'rgba(75, 192, 130, 0.8)',
                            font: { size: 10 },
                        },
                        ticks: { color: 'rgba(255, 255, 255, 0.6)', font: { size: 10 } },
                        grid: { drawOnChartArea: false },
                        beginAtZero: true,
                    },
                },
            },
        });
    }

    onDestroy(() => {
        if (chart) {
            chart.destroy();
            chart = null;
        }
    });
</script>

<style lang="less">
    .conditions-chart {
        margin-top: 12px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;

        canvas {
            width: 100% !important;
        }
    }

    .chart-title {
        opacity: 0.6;
        margin: 0 0 8px 0;
        font-weight: normal;
    }
</style>
