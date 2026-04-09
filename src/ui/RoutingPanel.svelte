<div class="routing-panel">
    <!-- Waypoint instructions -->
    <div class="section mb-15">
        {#if waypointState === 'WAITING_START'}
            <p class="size-m instruction">Click the map to set your <strong>start point</strong>.</p>
        {:else if waypointState === 'WAITING_END'}
            <p class="size-m instruction">Click the map to set your <strong>end point</strong>.</p>
        {:else if waypointState === 'READY' || waypointState === 'ADDING_WAYPOINTS'}
            {#if editingPoint === 'start'}
                <div class="coord-edit-row size-xs">
                    <span>Start:</span>
                    <input class="coord-input" type="number" step="0.0001" min="-90" max="90" bind:value={editLat} placeholder="Lat" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                    <input class="coord-input" type="number" step="0.0001" min="-180" max="180" bind:value={editLon} placeholder="Lon" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                    <button class="button size-xs" on:click={confirmEditCoord}>OK</button>
                    <button class="button size-xs" on:click={cancelEditCoord}>&#215;</button>
                </div>
            {:else}
                <p class="size-xs coords clickable" on:click={() => !isRouting && startEditCoord('start')}>Start: {formatLatLon(start)}</p>
            {/if}
            {#each waypoints as wp, i}
                {#if editingPoint === i}
                    <div class="coord-edit-row size-xs">
                        <span class="wp-dot">{i + 1}</span>
                        <input class="coord-input" type="number" step="0.0001" min="-90" max="90" bind:value={editLat} placeholder="Lat" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <input class="coord-input" type="number" step="0.0001" min="-180" max="180" bind:value={editLon} placeholder="Lon" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <button class="button size-xs" on:click={confirmEditCoord}>OK</button>
                        <button class="button size-xs" on:click={cancelEditCoord}>&#215;</button>
                    </div>
                {:else}
                    <div class="waypoint-row size-xs">
                        <span class="wp-dot">{i + 1}</span>
                        <span class="coords clickable" on:click={() => !isRouting && startEditCoord(i)}>{formatLatLon(wp)}</span>
                        <button class="wp-remove" on:click={() => onRemoveWaypoint(i)}>&#215;</button>
                    </div>
                {/if}
            {/each}
            {#if editingPoint === 'end'}
                <div class="coord-edit-row size-xs">
                    <span>End:</span>
                    <input class="coord-input" type="number" step="0.0001" min="-90" max="90" bind:value={editLat} placeholder="Lat" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                    <input class="coord-input" type="number" step="0.0001" min="-180" max="180" bind:value={editLon} placeholder="Lon" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                    <button class="button size-xs" on:click={confirmEditCoord}>OK</button>
                    <button class="button size-xs" on:click={cancelEditCoord}>&#215;</button>
                </div>
            {:else}
                <p class="size-xs coords clickable" on:click={() => !isRouting && startEditCoord('end')}>End: {formatLatLon(end)}</p>
            {/if}
            {#if waypointState === 'ADDING_WAYPOINTS'}
                <p class="size-xs instruction">Click the map to add a waypoint.</p>
                <button class="button size-xs" on:click={onStopAddingWaypoints}>Done</button>
            {:else}
                <button class="button size-xs" on:click={onAddWaypoint}>+ Add Waypoint</button>
            {/if}
        {/if}
    </div>

    <!-- Preview distance -->
    {#if previewDistanceNm > 0 && (waypointState === 'READY' || waypointState === 'ADDING_WAYPOINTS')}
        <div class="section mb-10 size-s preview-dist">
            &gt; {previewDistanceNm.toFixed(0)} nm direct
        </div>
    {/if}

    <!-- Land warning -->
    {#if warning}
        <div class="section mb-10 warning-text size-s">{warning}</div>
    {/if}

    <!-- Boat / Polar selection -->
    <div class="section mb-10 boat-section">
        <!-- Row 1: dropdown + polar thumbnail -->
        <div class="boat-row">
            <select class="input size-s" value={selectedPolarName} on:change={handlePolarChange}>
                {#each allPolars as p}
                    <option value={p.name}>{p.name}</option>
                {/each}
            </select>
            {#if currentPolar}
                <div class="boat-thumb" on:click={handleViewPolar} title="View polar diagram">
                    <PolarDiagram polar={currentPolar} width={80} mini={true} />
                </div>
            {/if}
        </div>
        <!-- Row 2: action buttons -->
        <div class="boat-buttons">
            <button class="btn size-xs" on:click={handleEditPolar}>Edit</button>
            <button class="btn size-xs" on:click={handleNewPolar}>New</button>
            {#if isCustomPolar}
                <button class="btn size-xs btn--danger" on:click={handleDeletePolar}>Delete</button>
            {/if}
        </div>
    </div>
    <div class="polar-modal-wrap">
        {#if currentPolar}
            <PolarViewEditModal
                polar={currentPolar}
                isCustom={isCustomPolar}
                onSave={handlePolarSave}
                bind:this={polarModal}
            />
        {/if}
    </div>

    <!-- Route management -->
    {#if waypointState === 'READY' && !isRouting}
        <div class="section mb-10 route-mgmt">
            {#if showSaveInput}
                <div class="save-row">
                    <input
                        class="input size-xs save-name-input"
                        type="text"
                        placeholder="Route name"
                        bind:value={saveRouteName}
                        on:keydown={(e) => e.key === 'Enter' && confirmSaveRoute()}
                    />
                    <button class="button size-xs" on:click={confirmSaveRoute}>Save</button>
                    <button class="button size-xs" on:click={cancelSaveRoute}>&#215;</button>
                </div>
            {:else}
                <button class="button size-xs" on:click={() => { showSaveInput = true; saveRouteName = suggestedRouteName; }}>Save Route</button>
            {/if}
            {#if savedRoutes.length > 0}
                <button class="button size-xs" on:click={() => showRouteList = !showRouteList}>
                    {showRouteList ? 'Hide' : 'Load'} ({savedRoutes.length})
                </button>
            {/if}
        </div>
        {#if showRouteList && savedRoutes.length > 0}
            <div class="section mb-10 route-list">
                {#each savedRoutes as sr (sr.id)}
                    <div class="route-list-item size-xs">
                        <button class="route-load-btn" on:click={() => { onLoadRoute(sr.id); showRouteList = false; }}>
                            {sr.name}
                        </button>
                        <button class="wp-remove" on:click={() => onDeleteRoute(sr.id)}>&#215;</button>
                    </div>
                {/each}
            </div>
        {/if}
    {/if}

    <!-- Departure time -->
    <div class="section mb-15 mt-10 departure-row">
        <div class="departure-input">
            <label class="size-xs label" for="departure">Departure:</label>
            <input
                id="departure"
                type="datetime-local"
                bind:value={departureStr}
                class="input size-s"
            />
        </div>
        <button class="gear-btn" on:click={() => settingsModal.open()} title="Settings">&#9881;</button>
    </div>

    <!-- Calculate button -->
    <div class="section mb-15">
        <button
            class="button button--variant-orange size-m"
            style="width:100%"
            disabled={!canCalculate}
            on:click={handleCalculate}
        >
            {isRouting ? 'Cancel' : 'Calculate Route'}
        </button>
    </div>

    <!-- Progress -->
    {#if isRouting}
        {#if pipelineSteps.length > 0}
            <TaskChecklist steps={pipelineSteps} percent={progressPercent} />
        {:else}
            <ProgressBar percent={progressPercent} statusText={progressStatus} />
        {/if}
    {/if}

    <!-- Error -->
    {#if error}
        <div class="section mb-10 error-text size-s">{error}</div>
    {/if}

    <!-- Results -->
    {#if results.length === 1}
        {@const r = results[0].route}
        <div class="section results">
            <h3 class="size-m mb-10">Route Summary</h3>
            <div class="result-grid">
                <div class="result-item">
                    <span class="size-xs label">ETA</span>
                    <span class="size-s">{formatEta(r.eta)}</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Distance</span>
                    <span class="size-s">{r.totalDistanceNm.toFixed(1)} nm</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Avg SOG</span>
                    <span class="size-s">{r.avgSpeedKt.toFixed(1)} kt</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Max TWS</span>
                    <span class="size-s">{r.maxTws.toFixed(0)} kt</span>
                </div>
                <div class="result-item">
                    <span class="size-xs label">Duration</span>
                    <span class="size-s">{formatDuration(r.durationHours)}</span>
                </div>
                {#if results[0].modelRunTime}
                <div class="result-item">
                    <span class="size-xs label">Forecast</span>
                    <span class="size-s">{MODEL_LABELS[results[0].model]} run {formatModelAge(results[0].modelRunTime)}</span>
                </div>
                {/if}
            </div>

            <button class="button size-s mt-15" style="width:100%" on:click={handleClear}>
                Clear Route
            </button>
        </div>
    {:else if results.length > 1}
        <div class="section results">
            <h3 class="size-m mb-10">Route Comparison</h3>
            <table class="comparison-table size-xs">
                <thead>
                    <tr>
                        <th>Model</th>
                        <th>ETA</th>
                        <th>Dist</th>
                        <th>SOG</th>
                        <th>TWS</th>
                        <th>Duration</th>
                        <th>Forecast</th>
                    </tr>
                </thead>
                <tbody>
                    {#each results as mr (mr.model)}
                        {@const fastest = mr.route.durationHours === fastestDuration}
                        <tr class:fastest-row={fastest}>
                            <td class="model-cell">
                                <span class="model-dot" style:background={mr.color}></span>
                                <span class={fastest ? 'fastest-label' : ''}
                                    >{MODEL_LABELS[mr.model]}</span
                                >
                            </td>
                            <td>{formatEta(mr.route.eta)}</td>
                            <td>{mr.route.totalDistanceNm.toFixed(0)} nm</td>
                            <td>{mr.route.avgSpeedKt.toFixed(1)}</td>
                            <td>{mr.route.maxTws.toFixed(0)}</td>
                            <td>{formatDuration(mr.route.durationHours)}</td>
                            <td>{formatModelAge(mr.modelRunTime)}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>

            <!-- Failed model warnings -->
            {#if failedModels.length > 0}
                <div class="failed-list mt-10">
                    {#each failedModels as fm}
                        <div class="failed-item size-xs">
                            ⚠ {MODEL_LABELS[fm.model]}: {fm.reason}
                        </div>
                    {/each}
                </div>
            {/if}

            <button class="button size-s mt-15" style="width:100%" on:click={handleClear}>
                Clear Route
            </button>
        </div>
    {/if}

    <!-- Data advisories -->
    {#if advisories.length > 0}
        <div class="section mb-10 advisories">
            {#each advisories as adv}
                <div class="advisory-card size-xs">
                    <span class="advisory-icon">&#9432;</span>
                    <span>{adv}</span>
                </div>
            {/each}
        </div>
    {/if}

    <!-- Route Detail Modal -->
    {#if results.length > 0}
        <RouteDetailModal {results} />
    {/if}

    <!-- Player controls -->
    {#if results.length > 0}
        <PlayerControls
            {results}
            {onTimeChange}
            {onModelSwitch}
        />
    {/if}

    <!-- Disclaimer -->
    <div class="disclaimer size-xs mt-15">
        Routes are advisory only. Not a substitute for proper passage planning and seamanship.
    </div>

    <SettingsModal bind:this={settingsModal} />
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import ProgressBar from './ProgressBar.svelte';
    import TaskChecklist from './TaskChecklist.svelte';
    import SettingsModal from './SettingsModal.svelte';
    import PolarDiagram from './PolarDiagram.svelte';
    import PolarViewEditModal from './PolarViewEditModal.svelte';
    import PlayerControls from './PlayerControls.svelte';
    import RouteDetailModal from './RouteDetailModal.svelte';
    import { getAllPolars, getCustomPolars, deleteCustomPolar } from '../data/polarRegistry';
    import { settingsStore } from '../stores/SettingsStore';

    import type { LatLon, ModelRouteResult, WindModelId, PipelineStep, SavedRoute, PolarData, UserSettings } from '../routing/types';
    import type { WaypointState } from '../map/WaypointManager';
    import { MODEL_LABELS } from '../map/modelColors';

    export let waypointState: WaypointState = 'WAITING_START';
    export let start: LatLon | null = null;
    export let end: LatLon | null = null;
    export let waypoints: LatLon[] = [];
    export let isRouting: boolean = false;
    export let progressPercent: number = 0;
    export let progressStatus: string = '';
    export let results: ModelRouteResult[] = [];
    export let failedModels: { model: WindModelId; reason: string }[] = [];
    export let error: string | null = null;
    export let warning: string | null = null;
    export let pipelineSteps: PipelineStep[] = [];

    export let onCalculate: () => void = () => {};
    export let onCancel: () => void = () => {};
    export let onClear: () => void = () => {};
    export let onTimeChange: (time: number) => void = () => {};
    export let onModelSwitch: (model: WindModelId) => void = () => {};
    export let onAddWaypoint: () => void = () => {};
    export let onStopAddingWaypoints: () => void = () => {};
    export let onRemoveWaypoint: (index: number) => void = () => {};
    export let savedRoutes: SavedRoute[] = [];
    export let suggestedRouteName: string = '';
    export let onSaveRoute: (name: string) => void = () => {};
    export let onLoadRoute: (id: string) => void = () => {};
    export let onDeleteRoute: (id: string) => void = () => {};
    export let previewDistanceNm: number = 0;
    export let onEditStart: (latLon: { lat: number; lon: number }) => Promise<boolean> = async () => false;
    export let onEditEnd: (latLon: { lat: number; lon: number }) => Promise<boolean> = async () => false;
    export let onEditWaypoint: (index: number, latLon: { lat: number; lon: number }) => Promise<boolean> = async () => false;

    let settingsModal: SettingsModal;
    let polarModal: PolarViewEditModal;
    let allPolars = getAllPolars();
    let selectedPolarName: string = settingsStore.get('selectedPolarName');

    $: currentPolar = allPolars.find(p => p.name === selectedPolarName) ?? allPolars[0];
    $: isCustomPolar = getCustomPolars().some(p => p.name === selectedPolarName);
    $: advisories = results.flatMap(r => r.dataAdvisories ?? []).filter((v, i, a) => a.indexOf(v) === i);

    // Default departure to now, formatted for datetime-local input
    let departureStr = formatDateForInput(new Date());

    // Route management state
    let showSaveInput = false;
    let saveRouteName = '';
    let showRouteList = false;

    function confirmSaveRoute(): void {
        const name = saveRouteName.trim();
        if (!name) return;
        onSaveRoute(name);
        saveRouteName = '';
        showSaveInput = false;
    }

    function cancelSaveRoute(): void {
        showSaveInput = false;
        saveRouteName = '';
    }

    // Coordinate editing state
    let editingPoint: 'start' | 'end' | number | null = null;
    let editLat = '';
    let editLon = '';

    function startEditCoord(point: 'start' | 'end' | number): void {
        editingPoint = point;
        let pos: LatLon | null = null;
        if (point === 'start') pos = start;
        else if (point === 'end') pos = end;
        else if (typeof point === 'number') pos = waypoints[point] ?? null;
        editLat = pos ? pos.lat.toFixed(4) : '';
        editLon = pos ? pos.lon.toFixed(4) : '';
    }

    async function confirmEditCoord(): Promise<void> {
        const lat = parseFloat(editLat);
        const lon = parseFloat(editLon);
        if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return; // Invalid input — keep editing
        }
        let accepted = false;
        if (editingPoint === 'start') {
            accepted = await onEditStart({ lat, lon });
        } else if (editingPoint === 'end') {
            accepted = await onEditEnd({ lat, lon });
        } else if (typeof editingPoint === 'number') {
            accepted = await onEditWaypoint(editingPoint, { lat, lon });
        }
        if (accepted) {
            editingPoint = null;
        }
    }

    function cancelEditCoord(): void {
        editingPoint = null;
    }

    export function getDepartureTime(): number {
        return new Date(departureStr).getTime();
    }

    $: canCalculate = waypointState === 'READY' && !isRouting;

    $: fastestDuration =
        results.length > 1 ? Math.min(...results.map((r) => r.route.durationHours)) : Infinity;

    function handleCalculate(): void {
        if (isRouting) {
            onCancel();
        } else {
            onCalculate();
        }
    }

    function handleClear(): void {
        onClear();
    }

    function formatLatLon(pos: LatLon | null): string {
        if (!pos) {
            return '\u2014';
        }
        return `${pos.lat.toFixed(3)}\u00B0, ${pos.lon.toFixed(3)}\u00B0`;
    }

    function formatEta(timestamp: number): string {
        const d = new Date(timestamp);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatDuration(hours: number): string {
        const days = Math.floor(hours / 24);
        const hrs = Math.floor(hours % 24);
        if (days > 0) {
            return `${days}d ${hrs}h`;
        }
        return `${hrs}h`;
    }

    function formatModelAge(ts: number | undefined): string {
        if (!ts) return '';
        const ageMs = Date.now() - ts;
        const ageH = Math.floor(ageMs / 3600_000);
        if (ageH < 1) return '<1h ago';
        if (ageH < 48) return `${ageH}h ago`;
        const ageD = Math.floor(ageH / 24);
        return `${ageD}d ago`;
    }

    function formatDateForInput(date: Date): string {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}-${m}-${d}T${h}:${min}`;
    }

    // --- Polar management ---

    function handlePolarChange(e: Event): void {
        const value = (e.target as HTMLSelectElement).value;
        selectedPolarName = value;
        settingsStore.set('selectedPolarName', value);
    }

    function handleViewPolar(): void {
        if (polarModal) {
            polarModal.openInViewMode();
        }
    }

    function handleEditPolar(): void {
        if (!currentPolar || !polarModal) return;
        if (isCustomPolar) {
            polarModal.openInEditMode(currentPolar);
        } else {
            const cloned: PolarData = {
                ...currentPolar,
                name: `${currentPolar.name} (copy)`,
                twaAngles: [...currentPolar.twaAngles],
                twsSpeeds: [...currentPolar.twsSpeeds],
                speeds: currentPolar.speeds.map(row => [...row]),
            };
            polarModal.openInEditMode(cloned);
        }
    }

    function handleNewPolar(): void {
        if (!currentPolar || !polarModal) return;
        const cloned: PolarData = {
            ...currentPolar,
            name: '',
            twaAngles: [...currentPolar.twaAngles],
            twsSpeeds: [...currentPolar.twsSpeeds],
            speeds: currentPolar.speeds.map(row => [...row]),
        };
        polarModal.openInEditMode(cloned);
    }

    function handleDeletePolar(): void {
        if (confirm(`Delete polar "${selectedPolarName}"?`)) {
            deleteCustomPolar(selectedPolarName);
            allPolars = getAllPolars();
            const firstPolar = allPolars[0];
            if (firstPolar) {
                selectedPolarName = firstPolar.name;
                settingsStore.set('selectedPolarName', firstPolar.name);
            }
        }
    }

    function handlePolarSave(): void {
        const previousPolars = allPolars.map(p => p.name);
        allPolars = getAllPolars();
        const newPolar = allPolars.find(p => !previousPolars.includes(p.name));
        if (newPolar) {
            selectedPolarName = newPolar.name;
            settingsStore.set('selectedPolarName', newPolar.name);
        }
    }

    function onSettingsChange(settings: UserSettings): void {
        selectedPolarName = settings.selectedPolarName;
        allPolars = getAllPolars();
    }

    settingsStore.subscribe(onSettingsChange);
    onDestroy(() => { settingsStore.unsubscribe(onSettingsChange); });
</script>

<style lang="less">
    .routing-panel {
        padding: 5px 0;
    }
    .section {
        padding: 0;
    }
    .instruction {
        line-height: 1.6;
        opacity: 0.9;
    }
    .coords {
        opacity: 0.7;
        line-height: 1.6;
    }
    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 2px;
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
    .error-text {
        color: #e74c3c;
        line-height: 1.4;
    }
    .preview-dist {
        color: rgba(255, 255, 255, 0.6);
        line-height: 1.4;
    }
    .warning-text {
        color: #e9c46a;
        line-height: 1.4;
    }
    .results {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 12px;
    }
    .result-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
    }
    .result-item {
        .label {
            margin-bottom: 0;
        }
    }

    /* Comparison table */
    .comparison-table {
        width: 100%;
        border-collapse: collapse;
        line-height: 1.5;

        th {
            opacity: 0.5;
            font-weight: normal;
            text-align: left;
            padding: 0 4px 4px 0;
            white-space: nowrap;
        }

        td {
            padding: 3px 4px 3px 0;
            white-space: nowrap;
        }

        tr.fastest-row {
            background: rgba(255, 255, 255, 0.06);
            border-radius: 3px;
            font-weight: 600;
        }
    }

    .model-cell {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .model-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .fastest-label {
        font-weight: 600;
    }

    /* Failed models */
    .failed-list {
        display: flex;
        flex-direction: column;
        gap: 3px;
    }

    .failed-item {
        color: #e9c46a;
        opacity: 0.85;
        line-height: 1.4;
    }

    .disclaimer {
        opacity: 0.4;
        line-height: 1.4;
        font-style: italic;
    }

    .waypoint-row {
        display: flex;
        align-items: center;
        gap: 6px;
        line-height: 1.6;
        opacity: 0.7;
    }

    .wp-dot {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #3498db;
        color: #fff;
        font-size: 10px;
        flex-shrink: 0;
    }

    .wp-remove {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        font-size: 14px;
        padding: 0 4px;
        line-height: 1;
    }

    .wp-remove:hover {
        color: #e74c3c;
    }

    /* Route management */
    .route-mgmt {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
    }

    .save-row {
        display: flex;
        gap: 4px;
        align-items: center;
        flex: 1;
    }

    .save-name-input {
        flex: 1;
        min-width: 80px;
    }

    .route-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .route-list-item {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    /* Coordinate editing */
    .clickable {
        cursor: pointer;
        border-bottom: 1px dashed rgba(255, 255, 255, 0.2);
        display: inline;

        &:hover {
            opacity: 1;
            border-bottom-color: rgba(255, 255, 255, 0.5);
        }
    }

    .coord-edit-row {
        display: flex;
        align-items: center;
        gap: 4px;
        line-height: 1.6;
    }

    .coord-input {
        width: 75px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 3px;
        color: inherit;
        padding: 2px 4px;
        font-size: 11px;
    }

    /* Boat / Polar section */
    .boat-section {
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 8px 10px;
    }

    .boat-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .boat-thumb {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        overflow: hidden;
        flex-shrink: 0;
        cursor: pointer;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color 0.15s ease;

        &:hover {
            border-color: rgba(255, 255, 255, 0.3);
        }
    }

    .boat-buttons {
        display: flex;
        gap: 5px;
    }

    .btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 3px 10px;
        cursor: pointer;
        opacity: 0.85;
        transition: all 0.15s ease;

        &:hover {
            background: rgba(255, 255, 255, 0.14);
            opacity: 1;
        }

        &--danger:hover {
            background: rgba(231, 76, 60, 0.2);
            border-color: rgba(231, 76, 60, 0.4);
        }
    }

    .polar-modal-wrap {
        height: 0;
        overflow: hidden;
    }

    /* Departure row */
    .departure-row {
        display: flex;
        align-items: flex-end;
        gap: 8px;
    }

    .departure-input {
        flex: 1;
    }

    .gear-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
        margin-bottom: 2px;

        &:hover {
            color: rgba(255, 255, 255, 0.9);
        }
    }

    /* Advisories */
    .advisories {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .advisory-card {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        background: rgba(233, 196, 106, 0.1);
        border: 1px solid rgba(233, 196, 106, 0.25);
        border-radius: 4px;
        padding: 8px 10px;
        color: #e9c46a;
        line-height: 1.4;
    }

    .advisory-icon {
        font-size: 14px;
        flex-shrink: 0;
        margin-top: 1px;
    }

    .route-load-btn {
        flex: 1;
        text-align: left;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        color: inherit;
        padding: 4px 8px;
        cursor: pointer;
        opacity: 0.8;

        &:hover {
            background: rgba(255, 255, 255, 0.12);
            opacity: 1;
        }
    }
</style>
