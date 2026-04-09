<canvas
    bind:this={canvas}
    class="condition-bar"
    width={canvasWidth}
    height={canvasHeight}
></canvas>

<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import type { RoutePoint } from '../routing/types';
    import type { ConditionMetric } from './conditionBarColors';
    import { twsColor, sogColor, twaColor, swellColor } from './conditionBarColors';

    export let points: RoutePoint[] = [];
    export let metric: ConditionMetric = 'tws';

    let canvas: HTMLCanvasElement;
    const canvasHeight = 14;
    let canvasWidth = 200;

    function getMetricValue(point: RoutePoint, m: ConditionMetric): number {
        switch (m) {
            case 'tws': return point.tws;
            case 'sog': return point.boatSpeed;
            case 'twa': return point.twa;
            case 'swell': return point.swell?.height ?? 0;
        }
    }

    function getColor(value: number, m: ConditionMetric): string {
        switch (m) {
            case 'tws': return twsColor(value);
            case 'sog': return sogColor(value);
            case 'twa': return twaColor(value);
            case 'swell': return swellColor(value);
        }
    }

    function render(): void {
        if (!canvas || points.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
            canvasWidth = Math.round(rect.width * (window.devicePixelRatio || 1));
            canvas.width = canvasWidth;
            canvas.height = canvasHeight * (window.devicePixelRatio || 1);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width;
        const h = canvas.height;

        for (let px = 0; px < w; px++) {
            const frac = px / (w - 1);
            const idx = frac * (points.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.min(lo + 1, points.length - 1);
            const t = idx - lo;

            const valLo = getMetricValue(points[lo], metric);
            const valHi = getMetricValue(points[hi], metric);
            const val = valLo + (valHi - valLo) * t;

            ctx.fillStyle = getColor(val, metric);
            ctx.fillRect(px, 0, 1, h);
        }
    }

    onMount(render);
    afterUpdate(render);
</script>

<style lang="less">
    .condition-bar {
        width: 100%;
        height: 14px;
        border-radius: 7px;
        display: block;
    }
</style>
