<!-- Interactive polar graph editor: full-screen modal with draggable SVG points + sidebar controls -->
<div class="modal-backdrop">
    <div class="modal-container">
        <span hidden>{$locale}</span>
        <!-- Header -->
        <div class="modal-header">
            <h3 class="size-m">{polar ? t('boat.editPrefix', { name }) : t('boat.newPolarTitle')}</h3>
            <button class="close-btn" on:click={onCancel}>✕</button>
        </div>

        <!-- Name input -->
        <div class="name-row">
            <label class="size-xs label" for="editorPolarName">{t('boat.nameLabel')}</label>
            <input
                id="editorPolarName"
                type="text"
                class="input size-s"
                placeholder={t('boat.namePlaceholder')}
                bind:value={name}
            />
        </div>

        <!-- Main area: editable table (primary) + diagram preview -->
        <div class="main-area">
            <!-- Inputs pane: TWA × TWS table (always visible, scrollable) -->
            <div class="inputs-pane">
                <div class="table-wrapper">
                    <table class="polar-table">
                        <thead>
                            <tr>
                                <th class="corner-cell size-xs" scope="col">TWA \ TWS</th>
                                {#each twsSpeeds as tws, ci}
                                    <th class="tws-header-cell" scope="col">
                                        <div class="tws-header">
                                            <span class="color-dot" style:background={twsColor(ci, twsSpeeds.length)}></span>
                                            <input
                                                type="number"
                                                class="cell-input tws-input"
                                                min="0.1" step="1"
                                                value={tws}
                                                on:change={e => updateTws(ci, e)}
                                                aria-label={t('boat.twsColAria', { n: ci + 1 })}
                                            />
                                            <span class="tws-suffix size-xs">kt</span>
                                        </div>
                                    </th>
                                {/each}
                                <th class="col-actions-cell">
                                    <div class="col-actions">
                                        <button
                                            class="icon-btn"
                                            on:click={addColumn}
                                            title={t('boat.addTws')}
                                            aria-label={t('boat.addTws')}
                                        >+</button>
                                        <button
                                            class="icon-btn"
                                            on:click={removeColumn}
                                            title={t('boat.removeTws')}
                                            aria-label={t('boat.removeTws')}
                                            disabled={twsSpeeds.length <= 2}
                                        >−</button>
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each twaAngles as twa, ri}
                                <tr>
                                    <th class="twa-label size-s" scope="row">{twa}°</th>
                                    {#each twsSpeeds as _tws, ci}
                                        <td>
                                            <input
                                                type="number"
                                                class="cell-input speed-input"
                                                class:cell-active={activePoint?.twaIdx === ri && activePoint?.twsIdx === ci}
                                                min="0" step="0.1"
                                                value={speeds[ri][ci]}
                                                on:focus={() => { hovered = { twaIdx: ri, twsIdx: ci }; }}
                                                on:blur={() => { if (hovered?.twaIdx === ri && hovered?.twsIdx === ci) hovered = null; }}
                                                on:change={e => updateSpeed(ri, ci, e)}
                                                aria-label={t('boat.speedCellAria', { r: ri + 1, c: ci + 1 })}
                                            />
                                        </td>
                                    {/each}
                                    <td class="row-spacer"></td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Preview pane: live polar diagram (drag-to-edit on desktop) -->
            <div class="preview-pane">
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

                {#if activePoint}
                    <div class="point-info size-xs">
                        <span>{t('boat.pointTwa', { value: twaAngles[activePoint.twaIdx] })}</span>
                        <span>·</span>
                        <span>{t('boat.pointTws', { value: twsSpeeds[activePoint.twsIdx] })}</span>
                        <span>·</span>
                        <span>{t('boat.pointSpeed', { value: speeds[activePoint.twaIdx][activePoint.twsIdx].toFixed(1) })}</span>
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
            <button class="button button--variant-orange size-m" on:click={handleSave}>{t('boat.saveButton')}</button>
            <button class="button size-m" on:click={onCancel}>{t('boat.cancelButton')}</button>
        </div>
    </div>
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { t, locale } from '../i18n';
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

    .inputs-pane {
        flex: 1 1 60%;
        min-width: 0;
        padding: 12px 14px;
        overflow: auto;
    }

    .preview-pane {
        flex: 1 1 40%;
        min-width: 0;
        padding: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        border-left: 1px solid rgba(255, 255, 255, 0.08);
        overflow: auto;
    }

    .diagram-pane {
        width: 100%;
        max-width: 460px;
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

    .point-info {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 4px 8px;
        opacity: 0.85;
        text-align: center;
    }

    .color-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .cell-input {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 6px 6px;
        font-size: 14px;
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
            border-color: rgba(233, 196, 106, 0.7);
            background: rgba(233, 196, 106, 0.08);
        }
    }

    .speed-input {
        width: 100%;
        min-width: 56px;

        &.cell-active {
            border-color: rgba(255, 255, 255, 0.5);
        }
    }

    .tws-input {
        width: 50px;
    }

    .tws-suffix {
        opacity: 0.5;
    }

    .icon-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        cursor: pointer;
        font-size: 14px;
        padding: 4px 9px;
        line-height: 1.4;
        min-width: 28px;

        &:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
        }

        &:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
    }

    .table-wrapper {
        overflow-x: auto;
    }

    .polar-table {
        border-collapse: separate;
        border-spacing: 4px 4px;
        width: 100%;

        th,
        td {
            padding: 0;
            text-align: center;
        }
    }

    .corner-cell {
        opacity: 0.5;
        white-space: nowrap;
        padding: 4px 6px;
        font-weight: 500;
    }

    .tws-header-cell {
        white-space: nowrap;
    }

    .tws-header {
        background: rgba(255, 255, 255, 0.04);
        border-radius: 4px;
        padding: 4px 6px;
        display: inline-flex;
        align-items: center;
        gap: 4px;
    }

    .col-actions-cell {
        padding-left: 6px;
    }

    .col-actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .twa-label {
        opacity: 0.7;
        white-space: nowrap;
        padding: 4px 8px 4px 0;
        text-align: right;
        font-weight: 500;
    }

    .row-spacer {
        width: 1px;
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

    @media (max-width: 720px) {
        .modal-container {
            width: 100vw;
            max-width: none;
            max-height: 100vh;
            border-radius: 0;
        }
        .main-area {
            flex-direction: column;
        }
        .inputs-pane {
            flex: 1 1 auto;
            padding: 10px 8px;
        }
        .preview-pane {
            flex: 0 0 auto;
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            padding: 8px;
        }
        .diagram-pane {
            max-width: 320px;
        }
        .polar-svg {
            max-width: 320px;
        }
        /* Larger touch targets on mobile + 16px font to suppress iOS zoom-on-focus */
        .cell-input {
            font-size: 16px;
            padding: 8px 6px;
            min-height: 40px;
        }
        .speed-input {
            min-width: 60px;
        }
        .tws-input {
            width: 56px;
        }
        .icon-btn {
            font-size: 16px;
            padding: 8px 12px;
            min-height: 40px;
            min-width: 40px;
        }
        .twa-label {
            font-size: 14px;
            padding: 4px 6px 4px 0;
        }
        .close-btn {
            padding: 8px 12px;
            font-size: 22px;
        }
    }
</style>
