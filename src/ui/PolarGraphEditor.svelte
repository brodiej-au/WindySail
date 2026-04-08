<!-- Interactive polar graph editor: full-screen modal with draggable SVG points + sidebar controls -->
<div class="modal-backdrop">
    <div class="modal-container">
        <!-- Header -->
        <div class="modal-header">
            <h3 class="size-m">{polar ? `Edit: ${name}` : 'New Polar'}</h3>
            <button class="close-btn" on:click={onCancel}>✕</button>
        </div>

        <!-- Name input -->
        <div class="name-row">
            <label class="size-xs label" for="editorPolarName">Name</label>
            <input
                id="editorPolarName"
                type="text"
                class="input size-s"
                placeholder="e.g. My Boat 35"
                bind:value={name}
            />
        </div>

        <!-- Main area: diagram + sidebar -->
        <div class="main-area">
            <!-- SVG Diagram -->
            <div class="diagram-pane" bind:this={diagramPane}>
                <svg
                    class="polar-svg"
                    viewBox="0 0 {svgWidth} {layout.height}"
                    xmlns="http://www.w3.org/2000/svg"
                    bind:this={svgEl}
                    on:mousedown={handleSvgMouseDown}
                    on:touchstart|passive={handleSvgTouchStart}
                >
                    <!-- Speed reference arcs -->
                    {#each rings as ring}
                        <path
                            d={arcPath(layout.cx, layout.cy, (ring / maxSpeed) * layout.radius)}
                            fill="none"
                            stroke="rgba(255,255,255,0.12)"
                            stroke-width="1"
                        />
                        <text
                            x={layout.cx + 4}
                            y={layout.cy - (ring / maxSpeed) * layout.radius - 3}
                            class="ring-label"
                        >{ring}</text>
                    {/each}

                    <!-- Angle reference lines -->
                    {#each angleLines as deg}
                        {@const outer = polarToSvg(deg, maxSpeed, layout.cx, layout.cy, layout.radius, maxSpeed)}
                        <line
                            x1={layout.cx} y1={layout.cy}
                            x2={outer.x} y2={outer.y}
                            stroke="rgba(255,255,255,0.08)" stroke-width="1"
                        />
                        {@const lbl = polarToSvg(deg, maxSpeed * 1.08, layout.cx, layout.cy, layout.radius, maxSpeed)}
                        <text x={lbl.x} y={lbl.y} class="angle-label">{deg}°</text>
                    {/each}

                    <!-- TWS curves -->
                    {#each twsSpeeds as _tws, ci}
                        {@const color = twsColor(ci, twsSpeeds.length)}
                        {@const speedsForTws = twaAngles.map((_a, ri) => speeds[ri][ci])}
                        <path
                            d={buildCurvePath(twaAngles, speedsForTws, layout.cx, layout.cy, layout.radius, maxSpeed)}
                            fill="none" stroke={color} stroke-width="2"
                        />
                    {/each}

                    <!-- Draggable data points -->
                    {#each twaAngles as twa, ri}
                        {#each twsSpeeds as _tws, ci}
                            {@const color = twsColor(ci, twsSpeeds.length)}
                            {@const pt = polarToSvg(twa, speeds[ri][ci], layout.cx, layout.cy, layout.radius, maxSpeed)}
                            {@const isActive = dragging?.twaIdx === ri && dragging?.twsIdx === ci}
                            {@const isHovered = hovered?.twaIdx === ri && hovered?.twsIdx === ci}
                            <circle
                                cx={pt.x} cy={pt.y}
                                r={isActive || isHovered ? 8 : 6}
                                fill={color}
                                stroke={isActive || isHovered ? '#fff' : 'none'}
                                stroke-width={isActive || isHovered ? 2 : 0}
                                class="drag-point"
                                data-ri={ri}
                                data-ci={ci}
                                on:mouseenter={() => { hovered = { twaIdx: ri, twsIdx: ci }; }}
                                on:mouseleave={() => { hovered = null; }}
                            />
                        {/each}
                    {/each}

                    <!-- Drag tooltip -->
                    {#if dragging && tooltipPos}
                        <text
                            x={tooltipPos.x + 14}
                            y={tooltipPos.y - 10}
                            class="tooltip-text"
                        >{speeds[dragging.twaIdx][dragging.twsIdx].toFixed(1)} kt</text>
                    {/if}
                </svg>
            </div>

            <!-- Controls sidebar -->
            <div class="sidebar">
                <!-- Selected point info -->
                {#if activePoint}
                    <div class="section mb-10">
                        <span class="size-xs label">Selected Point</span>
                        <div class="point-info size-s">
                            <span>TWA: {twaAngles[activePoint.twaIdx]}°</span>
                            <span>TWS: {twsSpeeds[activePoint.twsIdx]} kt</span>
                            <span>Speed: {speeds[activePoint.twaIdx][activePoint.twsIdx].toFixed(1)} kt</span>
                        </div>
                    </div>
                {/if}

                <!-- TWS values -->
                <div class="section mb-10">
                    <span class="size-xs label">TWS (kt)</span>
                    <div class="value-list">
                        {#each twsSpeeds as tws, ci}
                            <div class="value-row">
                                <span class="color-dot" style:background={twsColor(ci, twsSpeeds.length)}></span>
                                <input
                                    type="number"
                                    class="cell-input"
                                    min="0.1" step="1"
                                    value={tws}
                                    on:change={e => updateTws(ci, e)}
                                />
                            </div>
                        {/each}
                        <div class="btn-row">
                            <button class="icon-btn" on:click={addColumn} title="Add TWS">+</button>
                            <button class="icon-btn" on:click={removeColumn} title="Remove TWS" disabled={twsSpeeds.length <= 2}>−</button>
                        </div>
                    </div>
                </div>

                <!-- TWA values -->
                <div class="section mb-10">
                    <span class="size-xs label">TWA (°)</span>
                    <div class="value-list">
                        {#each twaAngles as twa, ri}
                            <div class="value-row">
                                <input
                                    type="number"
                                    class="cell-input"
                                    min="0" max="180" step="1"
                                    value={twa}
                                    on:change={e => updateTwa(ri, e)}
                                />
                            </div>
                        {/each}
                        <div class="btn-row">
                            <button class="icon-btn" on:click={addRow} title="Add TWA">+</button>
                            <button class="icon-btn" on:click={removeRow} title="Remove TWA" disabled={twaAngles.length <= 2}>−</button>
                        </div>
                    </div>
                </div>

                <!-- Table toggle -->
                <button class="icon-btn full-width mb-10" on:click={() => { showTable = !showTable; }}>
                    {showTable ? 'Hide Table' : 'Show Table'}
                </button>

                {#if showTable}
                    <div class="table-wrapper">
                        <table class="polar-table">
                            <thead>
                                <tr>
                                    <th class="size-xs corner-cell">TWA\TWS</th>
                                    {#each twsSpeeds as tws}
                                        <th class="size-xs">{tws}</th>
                                    {/each}
                                </tr>
                            </thead>
                            <tbody>
                                {#each twaAngles as twa, ri}
                                    <tr>
                                        <td class="size-xs twa-label">{twa}°</td>
                                        {#each twsSpeeds as _tws, ci}
                                            <td>
                                                <input
                                                    type="number"
                                                    class="cell-input"
                                                    min="0" step="0.1"
                                                    value={speeds[ri][ci]}
                                                    on:change={e => updateSpeed(ri, ci, e)}
                                                />
                                            </td>
                                        {/each}
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}
            </div>
        </div>

        <!-- Validation error -->
        {#if errorMsg}
            <div class="error-msg size-s">{errorMsg}</div>
        {/if}

        <!-- Footer -->
        <div class="modal-footer">
            <button class="button button--variant-orange size-m" on:click={handleSave}>Save</button>
            <button class="button size-m" on:click={onCancel}>Cancel</button>
        </div>
    </div>
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { saveCustomPolar } from '../data/polarRegistry';
    import type { PolarData } from '../routing/types';
    import {
        twsColor,
        computeMaxSpeed,
        polarLayout,
        polarToSvg,
        svgToPolar,
        speedRingValues,
        arcPath,
        buildCurvePath,
    } from './polarDiagramUtils';

    export let polar: PolarData | null = null;
    export let onSave: () => void = () => {};
    export let onCancel: () => void = () => {};

    // Local editable state
    let name: string = polar?.name ?? '';
    let twaAngles: number[] = polar ? [...polar.twaAngles] : [0, 45, 90, 135, 180];
    let twsSpeeds: number[] = polar ? [...polar.twsSpeeds] : [6, 10, 15, 20];
    let speeds: number[][] = polar
        ? polar.speeds.map(row => [...row])
        : Array.from({ length: 5 }, () => Array(4).fill(0));

    let errorMsg: string = '';
    let showTable = false;

    // Diagram
    const svgWidth = 460;
    const angleLines = [0, 30, 60, 90, 120, 150, 180];
    let svgEl: SVGSVGElement;
    let diagramPane: HTMLDivElement;

    $: layout = polarLayout(svgWidth);
    $: maxSpeed = computeMaxSpeed(speeds);
    $: rings = speedRingValues(maxSpeed);

    // Drag state
    let dragging: { twaIdx: number; twsIdx: number } | null = null;
    let hovered: { twaIdx: number; twsIdx: number } | null = null;
    let tooltipPos: { x: number; y: number } | null = null;

    $: activePoint = dragging ?? hovered;

    // --- Drag handlers ---

    function clientToSvg(clientX: number, clientY: number): { x: number; y: number } {
        const rect = svgEl.getBoundingClientRect();
        const viewBox = svgEl.viewBox.baseVal;
        const scaleX = viewBox.width / rect.width;
        const scaleY = viewBox.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }

    function handleSvgMouseDown(e: MouseEvent): void {
        const target = e.target as SVGElement;
        if (!target.classList.contains('drag-point')) return;
        const ri = parseInt(target.dataset.ri ?? '', 10);
        const ci = parseInt(target.dataset.ci ?? '', 10);
        if (isNaN(ri) || isNaN(ci)) return;

        e.preventDefault();
        dragging = { twaIdx: ri, twsIdx: ci };
        const svgPt = clientToSvg(e.clientX, e.clientY);
        tooltipPos = svgPt;

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e: MouseEvent): void {
        if (!dragging) return;
        const svgPt = clientToSvg(e.clientX, e.clientY);
        tooltipPos = svgPt;
        applyDrag(svgPt, dragging.twaIdx, dragging.twsIdx);
    }

    function onMouseUp(): void {
        dragging = null;
        tooltipPos = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }

    function handleSvgTouchStart(e: TouchEvent): void {
        const target = e.target as SVGElement;
        if (!target.classList.contains('drag-point')) return;
        const ri = parseInt(target.dataset.ri ?? '', 10);
        const ci = parseInt(target.dataset.ci ?? '', 10);
        if (isNaN(ri) || isNaN(ci)) return;

        dragging = { twaIdx: ri, twsIdx: ci };
        const touch = e.touches[0];
        const svgPt = clientToSvg(touch.clientX, touch.clientY);
        tooltipPos = svgPt;

        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
    }

    function onTouchMove(e: TouchEvent): void {
        if (!dragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const svgPt = clientToSvg(touch.clientX, touch.clientY);
        tooltipPos = svgPt;
        applyDrag(svgPt, dragging.twaIdx, dragging.twsIdx);
    }

    function onTouchEnd(): void {
        dragging = null;
        tooltipPos = null;
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
    }

    function applyDrag(svgPt: { x: number; y: number }, ri: number, ci: number): void {
        // Keep TWA fixed, only adjust speed (radial distance)
        const result = svgToPolar(svgPt.x, svgPt.y, layout.cx, layout.cy, layout.radius, maxSpeed);
        const clamped = Math.max(0, Math.min(maxSpeed, Math.round(result.speed * 10) / 10));
        speeds = speeds.map((row, r) =>
            r === ri ? row.map((v, c) => (c === ci ? clamped : v)) : row,
        );
    }

    onDestroy(() => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
    });

    // --- TWS / TWA management ---

    function updateTws(ci: number, e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            twsSpeeds = twsSpeeds.map((v, i) => (i === ci ? val : v));
        }
    }

    function addColumn(): void {
        const last = twsSpeeds[twsSpeeds.length - 1] ?? 0;
        twsSpeeds = [...twsSpeeds, last + 5];
        speeds = speeds.map(row => [...row, 0]);
    }

    function removeColumn(): void {
        if (twsSpeeds.length <= 2) return;
        twsSpeeds = twsSpeeds.slice(0, -1);
        speeds = speeds.map(row => row.slice(0, -1));
    }

    function updateTwa(ri: number, e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            twaAngles = twaAngles.map((v, i) => (i === ri ? val : v));
        }
    }

    function addRow(): void {
        const last = twaAngles[twaAngles.length - 1] ?? 0;
        const next = Math.min(last + 15, 180);
        twaAngles = [...twaAngles, next];
        speeds = [...speeds, Array(twsSpeeds.length).fill(0)];
    }

    function removeRow(): void {
        if (twaAngles.length <= 2) return;
        twaAngles = twaAngles.slice(0, -1);
        speeds = speeds.slice(0, -1);
    }

    function updateSpeed(ri: number, ci: number, e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            speeds = speeds.map((row, r) =>
                r === ri ? row.map((v, c) => (c === ci ? val : v)) : row,
            );
        }
    }

    // --- Validation & Save ---

    function validate(): string {
        if (!name.trim()) return 'Polar name must not be empty.';
        if (twsSpeeds.some(v => v <= 0)) return 'All TWS values must be greater than 0.';
        if (twaAngles.some(v => v < 0 || v > 180)) return 'All TWA values must be between 0 and 180.';
        if (speeds.some(row => row.some(v => v < 0))) return 'Speed values must not be negative.';
        return '';
    }

    function handleSave(): void {
        const err = validate();
        if (err) {
            errorMsg = err;
            return;
        }
        errorMsg = '';
        const polarData: PolarData = {
            name: name.trim(),
            twaAngles: [...twaAngles],
            twsSpeeds: [...twsSpeeds],
            speeds: speeds.map(row => [...row]),
        };
        saveCustomPolar(polarData);
        onSave();
    }
</script>

<style lang="less">
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
        width: 95vw;
        max-width: 960px;
        max-height: 95vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        overflow: hidden;
    }

    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;

        h3 {
            margin: 0;
            opacity: 0.9;
        }
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

    .name-row {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;

        .label {
            opacity: 0.6;
            white-space: nowrap;
        }
    }

    .input {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 5px 7px;
        font-size: 13px;
        box-sizing: border-box;

        &:focus {
            outline: none;
            border-color: rgba(255, 255, 255, 0.35);
        }
    }

    .main-area {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .diagram-pane {
        flex: 3;
        min-width: 0;
        padding: 10px;
        overflow: auto;
        display: flex;
        align-items: flex-start;
        justify-content: center;
    }

    .polar-svg {
        width: 100%;
        max-width: 460px;
        height: auto;
        user-select: none;
    }

    .sidebar {
        flex: 2;
        min-width: 200px;
        max-width: 320px;
        padding: 10px 14px;
        overflow-y: auto;
        border-left: 1px solid rgba(255, 255, 255, 0.08);
    }

    .section {
        padding: 0;
    }

    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 4px;
    }

    .point-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        opacity: 0.85;
    }

    .value-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .value-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .color-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .btn-row {
        display: flex;
        gap: 6px;
        margin-top: 2px;
    }

    .cell-input {
        width: 60px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: inherit;
        padding: 3px 5px;
        font-size: 12px;
        text-align: center;
        box-sizing: border-box;
        -moz-appearance: textfield;

        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }

        &:focus {
            outline: none;
            border-color: rgba(255, 255, 255, 0.4);
        }
    }

    .icon-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        cursor: pointer;
        font-size: 12px;
        padding: 3px 7px;
        line-height: 1.4;

        &:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
        }

        &:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
    }

    .full-width {
        width: 100%;
    }

    .table-wrapper {
        overflow-x: auto;
        margin-bottom: 10px;
    }

    .polar-table {
        border-collapse: collapse;
        min-width: 100%;

        th,
        td {
            padding: 2px 3px;
            text-align: center;
        }
    }

    .corner-cell {
        opacity: 0.55;
        white-space: nowrap;
        padding: 4px 6px;
    }

    .twa-label {
        opacity: 0.55;
        font-size: 11px;
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

    .drag-point {
        cursor: grab;
        transition: r 0.1s ease;

        &:hover {
            filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.6));
        }
    }

    .tooltip-text {
        fill: #fff;
        font-size: 12px;
        font-weight: 600;
        text-anchor: start;
        dominant-baseline: auto;
        pointer-events: none;
    }

    .error-msg {
        color: #e74c3c;
        padding: 0 16px 8px;
        line-height: 1.4;
    }

    .modal-footer {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        flex-shrink: 0;
    }

    .button {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 5px 14px;
        font-size: 14px;
        cursor: pointer;
        opacity: 0.9;
        transition: all 0.2s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
            opacity: 1;
        }

        &:active {
            transform: scale(0.98);
        }
    }

    .button--variant-orange {
        background: rgba(255, 140, 0, 0.2);
        border-color: rgba(255, 140, 0, 0.4);

        &:hover {
            background: rgba(255, 140, 0, 0.3);
            border-color: rgba(255, 140, 0, 0.6);
        }
    }

    .mb-10 {
        margin-bottom: 10px;
    }
</style>
