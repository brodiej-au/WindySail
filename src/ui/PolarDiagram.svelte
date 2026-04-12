<!-- Read-only polar diagram: classic half-circle sailing polar plot -->
<svg
    class="polar-diagram"
    viewBox="0 0 {width} {layout.height}"
    xmlns="http://www.w3.org/2000/svg"
>
    <!-- Speed reference arcs -->
    {#each rings as ring}
        <path
            d={arcPath(layout.cx, layout.cy, (ring / maxSpeed) * layout.radius)}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            stroke-width="1"
        />
        <!-- Label at 0° position (top of arc) -->
        {#if !mini}
        <text
            x={layout.cx + 4}
            y={layout.cy - (ring / maxSpeed) * layout.radius - 3}
            class="ring-label"
        >{ring}</text>
        {/if}
    {/each}

    <!-- Angle reference lines -->
    {#each angleLines as deg}
        {@const outer = polarToSvg(deg, maxSpeed, layout.cx, layout.cy, layout.radius, maxSpeed)}
        <line
            x1={layout.cx}
            y1={layout.cy}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(255,255,255,0.08)"
            stroke-width="1"
        />
        <!-- Angle label at outer edge -->
        {#if !mini}
        {@const lbl = polarToSvg(deg, maxSpeed * 1.08, layout.cx, layout.cy, layout.radius, maxSpeed)}
        <text x={lbl.x} y={lbl.y} class="angle-label">{deg}°</text>
        {/if}
    {/each}

    <!-- TWS curves -->
    {#each polar.twsSpeeds as _tws, ci}
        {@const color = twsColor(ci, polar.twsSpeeds.length)}
        {@const speedsForTws = polar.twaAngles.map((_a, ri) => polar.speeds[ri][ci])}
        <path
            d={buildCurvePath(polar.twaAngles, speedsForTws, layout.cx, layout.cy, layout.radius, maxSpeed)}
            fill="none"
            stroke={color}
            stroke-width="2"
        />
        <!-- Data points -->
        {#each polar.twaAngles as twa, ri}
            {@const pt = polarToSvg(twa, polar.speeds[ri][ci], layout.cx, layout.cy, layout.radius, maxSpeed)}
            <circle cx={pt.x} cy={pt.y} r="3" fill={color} />
        {/each}
    {/each}
</svg>

{#if !mini}
<!-- Legend -->
<div class="legend">
    {#each polar.twsSpeeds as tws, ci}
        {@const color = twsColor(ci, polar.twsSpeeds.length)}
        <span class="legend-item">
            <span class="legend-dot" style:background={color}></span>
            <span class="size-xs">{tws} kt</span>
        </span>
    {/each}
</div>
{/if}

<script lang="ts">
    import type { PolarData } from '../routing/types';
    import {
        twsColor,
        computeMaxSpeed,
        polarLayout,
        polarToSvg,
        speedRingValues,
        arcPath,
        buildCurvePath,
    } from './polarDiagramUtils';

    export let polar: PolarData;
    export let width: number = 460;
    export let mini: boolean = false;

    const angleLines = [0, 30, 60, 90, 120, 150, 180];

    $: layout = polarLayout(width);
    $: maxSpeed = computeMaxSpeed(polar.speeds);
    $: rings = speedRingValues(maxSpeed);
</script>

<style lang="less">
    .polar-diagram {
        display: block;
        width: 100%;
        height: auto;
    }

    .ring-label {
        fill: rgba(255, 255, 255, 0.45);
        font-size: 10px;
        text-anchor: start;
        dominant-baseline: auto;
    }

    .angle-label {
        fill: rgba(255, 255, 255, 0.45);
        font-size: 10px;
        text-anchor: middle;
        dominant-baseline: central;
    }

    .legend {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 10px 14px;
        padding: 8px 0 0;
        color: rgba(255, 255, 255, 0.85);
        background: transparent;
    }

    .legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .legend-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }
</style>
