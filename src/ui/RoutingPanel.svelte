<div class="routing-panel">
    <!-- Waypoint instructions -->
    <div class="section mb-15" class:section--disabled={isRouting || isDepartureScanning}>
        {#if waypointState === 'WAITING_START'}
            <p class="size-m instruction">{t('routing.startPrompt', { what: t('routing.startWhat') })}<span hidden>{$locale}</span></p>
            <button class="button size-xs location-btn" on:click={handleUseMyLocationAsStart}>{t('routing.useMyLocation')}</button>
        {:else if waypointState === 'WAITING_END'}
            <p class="size-m instruction">{t('routing.startPrompt', { what: t('routing.endWhat') })}</p>
        {:else if waypointState === 'READY' || waypointState === 'ADDING_WAYPOINTS'}
            <RouteStopsCard
                {start}
                {startName}
                {end}
                {endName}
                {waypoints}
                readOnly={results.length > 0}
                onEditStart={handleEditStartFromCard}
                onEditEnd={handleEditEndFromCard}
                onEditWaypoint={handleEditWaypointFromCard}
                {onRemoveWaypoint}
            />

            {#if results.length === 0}
                {#if editingPoint === 'start'}
                    <div class="coord-edit-row size-xs">
                        <span>{t('routing.startLabel')}:</span>
                        <input class="coord-input" type="number" step="0.0001" min="-90" max="90" bind:value={editLat} placeholder="Lat" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <input class="coord-input" type="number" step="0.0001" min="-180" max="180" bind:value={editLon} placeholder="Lon" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <button class="button size-xs" on:click={confirmEditCoord}>OK</button>
                        <button class="button size-xs" on:click={cancelEditCoord}>&#215;</button>
                        <button class="button size-xs loc-btn" on:click={useMyLocationForEdit} title={t('routing.useMyLocationTitle')}>&#8982;</button>
                    </div>
                {:else if editingPoint === 'end'}
                    <div class="coord-edit-row size-xs">
                        <span>{t('routing.endLabel')}:</span>
                        <input class="coord-input" type="number" step="0.0001" min="-90" max="90" bind:value={editLat} placeholder="Lat" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <input class="coord-input" type="number" step="0.0001" min="-180" max="180" bind:value={editLon} placeholder="Lon" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <button class="button size-xs" on:click={confirmEditCoord}>OK</button>
                        <button class="button size-xs" on:click={cancelEditCoord}>&#215;</button>
                        <button class="button size-xs loc-btn" on:click={useMyLocationForEdit} title={t('routing.useMyLocationTitle')}>&#8982;</button>
                    </div>
                {:else if typeof editingPoint === 'number'}
                    <div class="coord-edit-row size-xs">
                        <span class="wp-dot">{editingPoint + 1}</span>
                        <input class="coord-input" type="number" step="0.0001" min="-90" max="90" bind:value={editLat} placeholder="Lat" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <input class="coord-input" type="number" step="0.0001" min="-180" max="180" bind:value={editLon} placeholder="Lon" on:keydown={(e) => e.key === 'Enter' && confirmEditCoord()} />
                        <button class="button size-xs" on:click={confirmEditCoord}>OK</button>
                        <button class="button size-xs" on:click={cancelEditCoord}>&#215;</button>
                    </div>
                {/if}

                {#if waypointState === 'ADDING_WAYPOINTS'}
                    <p class="size-xs instruction">{t('routing.waypointPrompt')}</p>
                {:else}
                    <button class="button size-xs" on:click={onAddWaypoint}>{t('routing.addWaypoint')}</button>
                {/if}
            {/if}
        {/if}
    </div>

    <!-- Preview distance -->
    {#if previewDistanceNm > 0 && (waypointState === 'READY' || waypointState === 'ADDING_WAYPOINTS')}
        <div class="section mb-10 size-s preview-dist">
            {t('routing.previewDirect', { nm: previewDistanceNm.toFixed(0) })}
        </div>
    {/if}

    <!-- Land warning -->
    {#if warning}
        <div class="section mb-10 warning-text size-s">{warning}</div>
    {/if}

    <!-- Pre-calculation UI (hidden when results exist) -->
    {#if results.length === 0}
        <!-- Boat / Polar selection -->
        <div class="section mb-10 boat-section" class:section--disabled={isRouting || isDepartureScanning}>
            <!-- Row 1: searchable dropdown + polar thumbnail -->
            <div class="boat-row">
                <div class="polar-search-wrap">
                    <input
                        class="input size-s polar-search-input"
                        type="text"
                        bind:value={polarSearchQuery}
                        on:focus={openPolarDropdown}
                        on:input={openPolarDropdown}
                        on:keydown={handlePolarSearchKey}
                        on:blur={closePolarDropdown}
                        placeholder={t('boat.polarSearchPlaceholder')}
                    />
                    {#if polarDropdownOpen}
                        <div class="polar-dropdown">
                            {#each filteredPolars as p}
                                <button
                                    class="polar-option"
                                    class:polar-option--active={p.name === selectedPolarName}
                                    on:mousedown|preventDefault={() => selectPolar(p.name)}
                                >{p.name}</button>
                            {/each}
                            {#if filteredPolars.length === 0}
                                <div class="polar-option polar-option--empty">{t('boat.noMatches')}</div>
                            {/if}
                        </div>
                    {/if}
                </div>
                {#if currentPolar && !motorboatMode}
                    <div class="boat-thumb" on:click={handleViewPolar} title={t('boat.viewPolarTitle')}>
                        <PolarDiagram polar={currentPolar} width={80} mini={true} />
                    </div>
                {/if}
            </div>
            {#if motorboatMode}
                <button
                    class="motor-summary size-xs"
                    on:click={() => motorboatModal.open()}
                    title={t('boat.editMotorSpeedsTitle')}
                >
                    {t('boat.motorSummary', { cruise: motorboatCruiseKt, heavy: motorboatHeavyKt, swell: motorboatSwellThresholdM })}
                    <span class="motor-summary-edit">✎</span>
                </button>
            {/if}
            <!-- Row 2: action buttons -->
            {#if !motorboatMode}
                <div class="boat-buttons">
                    <button class="btn size-xs" on:click={handleEditPolar}>{t('boat.edit')}</button>
                    <button class="btn size-xs" on:click={handleNewPolar}>{t('boat.new')}</button>
                    {#if isCustomPolar}
                        <button class="btn size-xs btn--danger" on:click={handleDeletePolar}>{t('boat.delete')}</button>
                    {/if}
                </div>
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
                            placeholder={t('routing.routeNamePlaceholder')}
                            bind:value={saveRouteName}
                            on:keydown={(e) => e.key === 'Enter' && confirmSaveRoute()}
                        />
                        <button class="button size-xs" on:click={confirmSaveRoute}>{t('routing.saveButton')}</button>
                        <button class="button size-xs" on:click={cancelSaveRoute}>&#215;</button>
                    </div>
                {:else}
                    <button class="button size-xs" on:click={() => { showSaveInput = true; saveRouteName = suggestedRouteName; }}>{t('routing.saveRoute')}</button>
                {/if}
                {#if savedRoutes.length > 0}
                    <button class="button size-xs" on:click={() => showRouteList = !showRouteList}>
                        {showRouteList ? t('routing.hideRoute') : t('routing.loadRoute')} ({savedRoutes.length})
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

        <!-- Mode toggle -->
        <div class="section mb-10 mt-10 mode-toggle" class:section--disabled={isRouting || isDepartureScanning}>
            <button
                class="pill size-xs"
                class:pill--active={mode === 'single'}
                on:click={() => mode = 'single'}
            >
                {t('routing.singleRoute')}
            </button>
            <button
                class="pill size-xs"
                class:pill--active={mode === 'departure'}
                on:click={() => mode = 'departure'}
            >
                {t('routing.departurePlanner')}
            </button>
        </div>

        <!-- Departure time / window -->
        {#if mode === 'single'}
            <div class="section mb-15 departure-row" class:section--disabled={isRouting || isDepartureScanning}>
                <div class="departure-input">
                    <label class="size-xs label" for="departure">{t('routing.departureLabel')}</label>
                    <input
                        id="departure"
                        type="datetime-local"
                        bind:value={departureStr}
                        class="input size-s"
                        disabled={isRouting || isDepartureScanning}
                    />
                </div>
                <button class="gear-btn" on:click={() => settingsModal.open()} title={t('routing.settingsTitle')} disabled={isRouting || isDepartureScanning}>&#9881;</button>
            </div>
            {#if departureInPast}
                <div class="section mb-10 warning-text size-xs">{t('routing.departureInPast')}</div>
            {:else if departureBeyondForecast}
                <div class="section mb-10 caution-text size-xs">{t('routing.departureBeyondForecast')}</div>
            {/if}
        {:else}
            <div class="section mb-15" class:section--disabled={isRouting || isDepartureScanning}>
                <DepartureWindowInput
                    modelCount={settingsStore.get('selectedModels').length}
                    bind:this={departureWindowInput}
                    onWindowInPastChange={handleWindowInPastChange}
                />
                <button class="gear-btn gear-btn--float" on:click={() => settingsModal.open()} title={t('routing.settingsTitle')} disabled={isRouting || isDepartureScanning}>&#9881;</button>
            </div>
        {/if}

        <!-- Calculate / Cancel button -->
        <div class="section mb-15">
            {#if isRouting || isDepartureScanning}
                <button
                    class="button button--variant-orange size-m"
                    style="width:100%"
                    on:click={onCancel}
                >
                    {t('routing.cancelButton')}
                </button>
            {:else}
                <button
                    class="button button--variant-orange size-m"
                    style="width:100%"
                    disabled={!canCalculate}
                    on:click={handleCalculate}
                >
                    {#if mode === 'departure'}
                        {t('routing.scanDepartures')}
                    {:else}
                        {t('routing.calculateButton')}
                    {/if}
                </button>
            {/if}
        </div>
    {/if}

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
    {#if results.length > 0}
        <div class="section results">
            <!-- Compact route reference -->
            <div class="route-ref size-xs mb-10">
                <div>{t('routing.depart', { time: formatEta(results[0].route.path[0]?.time ?? Date.now()) })}</div>
            </div>

            <!-- Comparison table (multi-model only) -->
            {#if results.length > 1}
                <h3 class="size-s mb-5">{t('results.routeComparison')}</h3>
                <table class="comparison-table size-xs">
                    <thead>
                        <tr>
                            <th>{t('results.modelCol')}</th>
                            <th>{t('results.durationCol')}</th>
                            <th>{t('results.sogCol')}</th>
                            <th>{t('results.twsCol')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each results as mr (mr.model)}
                            {@const isSelected = mr.model === selectedComparisonModel}
                            {@const isHovered = mr.model === hoveredComparisonModel}
                            {@const fastest = mr.route.durationHours === fastestDuration}
                            <tr
                                class:selected-row={isSelected}
                                class:hovered-row={isHovered && !isSelected}
                                class:fastest-row={fastest && !isSelected && !isHovered}
                                style:background={isSelected ? mr.color + '1F' : isHovered ? mr.color + '14' : ''}
                                on:mouseenter={() => handleComparisonRowEnter(mr.model)}
                                on:mouseleave={handleComparisonRowLeave}
                                on:click={() => handleComparisonRowClick(mr.model)}
                            >
                                <td class="model-cell">
                                    <span class="model-dot" style:background={mr.color}></span>
                                    <span class={fastest ? 'fastest-label' : ''}>{MODEL_LABELS[mr.model]}</span>
                                </td>
                                <td>{formatDuration(mr.route.durationHours)}</td>
                                <td>{mr.route.avgSpeedKt.toFixed(1)}</td>
                                <td>{mr.route.maxTws.toFixed(0)}</td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}

            <!-- Selected route stats (or single-model stats) -->
            {#if selectedResult}
                {@const sr = selectedResult.route}
                <div class="selected-stats mt-10">
                    {#if results.length > 1}
                        <div class="stats-header size-xs mb-5">{t('results.routeSuffix', { model: MODEL_LABELS[selectedResult.model] })}</div>
                    {/if}
                    <div class="result-grid">
                        <div class="result-item">
                            <span class="size-xs label">{t('results.eta')}</span>
                            <span class="size-s">{formatEta(sr.eta)}</span>
                        </div>
                        <div class="result-item">
                            <span class="size-xs label">{t('results.totalDistance')}</span>
                            <span class="size-s">{sr.totalDistanceNm.toFixed(1)} {t('units.nm')}</span>
                        </div>
                        <div class="result-item">
                            <span class="size-xs label">{t('results.avgSog')}</span>
                            <span class="size-s">{sr.avgSpeedKt.toFixed(1)} {t('units.knots')}</span>
                        </div>
                        <div class="result-item">
                            <span class="size-xs label">{t('results.maxTws')}</span>
                            <span class="size-s">{sr.maxTws.toFixed(0)} {t('units.knots')}</span>
                        </div>
                        <div class="result-item">
                            <span class="size-xs label">{t('results.duration')}</span>
                            <span class="size-s">{formatDuration(sr.durationHours)}</span>
                        </div>
                        {#if selectedResult.modelRunTime}
                        <div class="result-item">
                            <span class="size-xs label">{t('results.forecast')}</span>
                            <span class="size-s">{MODEL_LABELS[selectedResult.model]} {formatModelAge(selectedResult.modelRunTime)}</span>
                        </div>
                        {/if}
                    </div>

                    {#if routeStats}
                        {@const sailLegend = legendItems([
                            [routeStats.sail.upwind, t('results.sailUpwind'), '#E63946'],
                            [routeStats.sail.reaching, t('results.sailReaching'), '#2A9D8F'],
                            [routeStats.sail.downwind, t('results.sailDownwind'), '#457B9D'],
                            [routeStats.sail.motoring, t('results.sailMotoring'), '#888'],
                        ])}
                        {@const windLegend = legendItems([
                            [routeStats.wind.light, t('results.windLight'), '#89CFF0'],
                            [routeStats.wind.moderate, t('results.windModerate'), '#457B9D'],
                            [routeStats.wind.fresh, t('results.windFresh'), '#E9C46A'],
                            [routeStats.wind.strong, t('results.windStrong'), '#E63946'],
                        ])}
                        <div class="route-breakdown mt-10">
                            <div class="breakdown-section">
                                <div class="breakdown-label size-xs">{t('results.pointsOfSail')}</div>
                                <div class="stacked-bar">
                                    {#each sailLegend as s}
                                        <div class="bar-seg" style="width:{s.pct}%;background:{s.color}"></div>
                                    {/each}
                                </div>
                                <div class="breakdown-legend size-xs">
                                    {#each sailLegend as s, i}
                                        {#if i > 0}<span class="legend-sep">&middot;</span>{/if}
                                        <span class="legend-dot" style="background:{s.color}"></span>
                                        <span>{s.pct}% {s.label}</span>
                                    {/each}
                                </div>
                            </div>

                            <div class="breakdown-section">
                                <div class="breakdown-label size-xs">{t('results.windHeading')}</div>
                                <div class="stacked-bar">
                                    {#each windLegend as w}
                                        <div class="bar-seg" style="width:{w.pct}%;background:{w.color}"></div>
                                    {/each}
                                </div>
                                <div class="breakdown-legend size-xs">
                                    {#each windLegend as w, i}
                                        {#if i > 0}<span class="legend-sep">&middot;</span>{/if}
                                        <span class="legend-dot" style="background:{w.color}"></span>
                                        <span>{w.pct}% {w.label}</span>
                                    {/each}
                                </div>
                            </div>

                            {#if routeStats.swell}
                                {@const swellLegend = legendItems([
                                    [routeStats.swell.calm, t('results.swellCalm'), '#2A9D8F'],
                                    [routeStats.swell.moderate, t('results.swellModerate'), '#E9C46A'],
                                    [routeStats.swell.rough, t('results.swellRough'), '#E76F51'],
                                    [routeStats.swell.heavy, t('results.swellHeavy'), '#E63946'],
                                ])}
                                <div class="breakdown-section">
                                    <div class="breakdown-label size-xs">{t('results.swellHeading')}</div>
                                    <div class="stacked-bar">
                                        {#each swellLegend as s}
                                            <div class="bar-seg" style="width:{s.pct}%;background:{s.color}"></div>
                                        {/each}
                                    </div>
                                    <div class="breakdown-legend size-xs">
                                        {#each swellLegend as s, i}
                                            {#if i > 0}<span class="legend-sep">&middot;</span>{/if}
                                            <span class="legend-dot" style="background:{s.color}"></span>
                                            <span>{s.pct}% {s.label}</span>
                                        {/each}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Failed model warnings -->
            {#if failedModels.length > 0}
                <div class="failed-list mt-10">
                    {#each failedModels as fm}
                        <div class="failed-item size-xs">
                            &#9888; {MODEL_LABELS[fm.model]}: {fm.reason}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Departure planner results -->
    {#if mode === 'departure' && (departureResults.length > 0 || isDepartureScanning)}
        <DeparturePlannerResults
            results={departureResults}
            isScanning={isDepartureScanning}
            onRouteHover={onDepartureRouteHover}
            onRouteSelect={onDepartureRouteSelect}
        />
        {#if departureResults.length > 0 && !isDepartureScanning}
            <button class="button size-s mt-15" style="width:100%" on:click={handleClear}>
                {t('routing.clearResults')}
            </button>
        {/if}
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

    <!-- Route Detail Modal button + Player controls (post-calculation) -->
    {#if results.length > 0}
        <RouteDetailModal {results} {waypoints} />

        <PlayerControls
            {results}
            {waypoints}
            {onTimeChange}
            bind:this={playerControls}
        />

        <button class="button size-xs mt-10" style="width:100%" on:click={handleExportGpx}>
            {t('routing.exportGpx')}
        </button>

        <button class="button size-s mt-10 clear-btn" style="width:100%" on:click={handleClear}>
            {t('routing.clearRoute')}
        </button>
    {/if}

    <!-- Footer -->
    <div class="disclaimer size-xs mt-15">
        {t('footer.advisoryNotice')}
    </div>
    <div class="footer size-xs mt-10">
        {t('footer.versionPrefix')}{pkg.version} &mdash; {t('footer.fairWinds')} &mdash; <button class="footer-link" on:click={() => showAboutModal = true}>Appd</button>
    </div>

    {#if showAboutModal}
        <div class="about-overlay" on:click|self={() => showAboutModal = false}>
            <div class="about-modal">
                <button class="about-close" on:click={() => showAboutModal = false}>&times;</button>
                <h3 class="about-title">{t('footer.aboutTitle')}</h3>
                <p class="about-text">
                    {t('footer.aboutIntro')}
                </p>
                <p class="about-text">
                    {t('footer.aboutEmail')} <a href="mailto:hello@appd.com.au" class="about-link">hello@appd.com.au</a>
                </p>
                <p class="about-text">
                    <a href="https://appd.com.au" target="_blank" rel="noopener noreferrer" class="about-link">https://appd.com.au</a>
                </p>
            </div>
        </div>
    {/if}

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
    <SettingsModal bind:this={settingsModal} />
    <MotorboatEditModal bind:this={motorboatModal} />
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { t, locale } from '../i18n';
    import pkg from '../../package.json';
    import { triggerGpxDownload } from '../export/gpxExport';
    import ProgressBar from './ProgressBar.svelte';
    import TaskChecklist from './TaskChecklist.svelte';
    import SettingsModal from './SettingsModal.svelte';
    import MotorboatEditModal from './MotorboatEditModal.svelte';
    import PolarDiagram from './PolarDiagram.svelte';
    import PolarViewEditModal from './PolarViewEditModal.svelte';
    import PlayerControls from './PlayerControls.svelte';
    import RouteDetailModal from './RouteDetailModal.svelte';
    import DepartureWindowInput from './DepartureWindowInput.svelte';
    import DeparturePlannerResults from './DeparturePlannerResults.svelte';
    import RouteStopsCard from './RouteStopsCard.svelte';
    import { getAllPolars, getCustomPolars, deleteCustomPolar } from '../data/polarRegistry';
    import { settingsStore } from '../stores/SettingsStore';

    import type { LatLon, ModelRouteResult, WindModelId, PipelineStep, SavedRoute, PolarData, UserSettings, DepartureResult, RoutePoint } from '../routing/types';
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
    export let onAddWaypoint: () => void = () => {};
    export let onStopAddingWaypoints: () => void = () => {};
    export let onRemoveWaypoint: (index: number) => void = () => {};
    export let savedRoutes: SavedRoute[] = [];
    export let suggestedRouteName: string = '';
    export let startName: string = '';
    export let endName: string = '';
    export let onSaveRoute: (name: string) => void = () => {};
    export let onLoadRoute: (id: string) => void = () => {};
    export let onDeleteRoute: (id: string) => void = () => {};
    export let previewDistanceNm: number = 0;
    export let onEditStart: (latLon: { lat: number; lon: number }) => Promise<boolean> = async () => false;
    export let onEditEnd: (latLon: { lat: number; lon: number }) => Promise<boolean> = async () => false;
    export let onEditWaypoint: (index: number, latLon: { lat: number; lon: number }) => Promise<boolean> = async () => false;

    export let mode: 'single' | 'departure' = 'single';
    export let departureResults: DepartureResult[] = [];
    export let isDepartureScanning: boolean = false;
    export let onDepartureScan: () => void = () => {};
    export let onDepartureRouteHover: (result: ModelRouteResult | null, siblings?: ModelRouteResult[]) => void = () => {};
    export let onDepartureRouteSelect: (result: ModelRouteResult | null) => void = () => {};
    export let onComparisonHover: (model: WindModelId | null) => void = () => {};
    export let onComparisonSelect: (model: WindModelId) => void = () => {};
    export let onUseMyLocation: () => Promise<{ lat: number; lon: number } | null> = async () => null;
    export let onPlaceMyLocation: (pos: { lat: number; lon: number }) => void = () => {};

    let departureWindowInput: DepartureWindowInput;
    let departureWindowInPast = false;
    let showAboutModal = false;

    function handleWindowInPastChange(v: boolean): void {
        departureWindowInPast = v;
    }

    // Selected model in comparison table (auto-set to fastest on results change)
    let selectedComparisonModel: WindModelId | null = null;
    let hoveredComparisonModel: WindModelId | null = null;

    // When results change, auto-select the fastest model
    $: if (results.length > 1) {
        const fastest = results.reduce((a, b) => a.route.durationHours < b.route.durationHours ? a : b);
        if (!selectedComparisonModel || !results.find(r => r.model === selectedComparisonModel)) {
            selectedComparisonModel = fastest.model;
            onComparisonSelect(fastest.model);
        }
    } else if (results.length === 1) {
        selectedComparisonModel = results[0].model;
    } else {
        selectedComparisonModel = null;
    }

    $: displayModel = hoveredComparisonModel ?? selectedComparisonModel;
    $: selectedResult = results.find(r => r.model === displayModel) ?? results[0] ?? null;

    $: routeStats = selectedResult ? computeRouteStats(selectedResult.route.path) : null;

    function computeRouteStats(path: RoutePoint[]) {
        if (path.length < 2) return null;

        let totalTime = 0;
        let sailingTime = 0;
        let motoringTime = 0;
        let sailUpwind = 0, sailReaching = 0, sailDownwind = 0;
        let windLight = 0, windMod = 0, windFresh = 0, windStrong = 0;
        let swCalm = 0, swMod = 0, swRough = 0, swHeavy = 0;
        let hasSwell = false;

        for (let i = 0; i < path.length - 1; i++) {
            const dt = path[i + 1].time - path[i].time;
            if (dt <= 0) continue;
            totalTime += dt;
            const pt = path[i];

            if (pt.isMotoring) {
                motoringTime += dt;
            } else {
                sailingTime += dt;
                const twa = Math.abs(pt.twa);
                if (twa < 60) sailUpwind += dt;
                else if (twa <= 120) sailReaching += dt;
                else sailDownwind += dt;
            }

            if (pt.tws < 10) windLight += dt;
            else if (pt.tws < 20) windMod += dt;
            else if (pt.tws < 30) windFresh += dt;
            else windStrong += dt;

            if (pt.swell?.height != null) {
                hasSwell = true;
                const h = pt.swell.height;
                if (h < 1) swCalm += dt;
                else if (h < 2) swMod += dt;
                else if (h < 3) swRough += dt;
                else swHeavy += dt;
            }
        }

        if (totalTime === 0) return null;

        const pct = (v: number, t: number) => t > 0 ? Math.round((v / t) * 100) : 0;

        return {
            sail: {
                upwind: pct(sailUpwind, totalTime),
                reaching: pct(sailReaching, totalTime),
                downwind: pct(sailDownwind, totalTime),
                motoring: pct(motoringTime, totalTime),
            },
            wind: { light: pct(windLight, totalTime), moderate: pct(windMod, totalTime), fresh: pct(windFresh, totalTime), strong: pct(windStrong, totalTime) },
            swell: hasSwell ? { calm: pct(swCalm, totalTime), moderate: pct(swMod, totalTime), rough: pct(swRough, totalTime), heavy: pct(swHeavy, totalTime) } : null,
        };
    }

    function legendItems(items: [number, string, string][]): { pct: number; label: string; color: string }[] {
        return items.filter(([v]) => v > 0).map(([pct, label, color]) => ({ pct, label, color }));
    }

    function handleComparisonRowEnter(model: WindModelId): void {
        hoveredComparisonModel = model;
        onComparisonHover(model);
    }

    function handleComparisonRowLeave(): void {
        hoveredComparisonModel = null;
        onComparisonHover(null);
    }

    function handleComparisonRowClick(model: WindModelId): void {
        selectedComparisonModel = model;
        onComparisonSelect(model);
    }

    let settingsModal: SettingsModal;
    let motorboatModal: MotorboatEditModal;
    let polarModal: PolarViewEditModal;
    let playerControls: PlayerControls;

    /** Forward external timestamp to PlayerControls scrubber. */
    export function setPlayerTime(time: number): void {
        playerControls?.setTime(time);
    }
    let allPolars = getAllPolars();
    let selectedPolarName: string = settingsStore.get('selectedPolarName');
    let motorboatMode: boolean = settingsStore.get('motorboatMode');
    let motorboatCruiseKt: number = settingsStore.get('motorboatCruiseKt');
    let motorboatHeavyKt: number = settingsStore.get('motorboatHeavyKt');
    let motorboatSwellThresholdM: number = settingsStore.get('motorboatSwellThresholdM');

    $: currentPolar = allPolars.find(p => p.name === selectedPolarName) ?? allPolars[0];
    $: isCustomPolar = getCustomPolars().some(p => p.name === selectedPolarName);

    // Searchable polar dropdown
    let polarSearchQuery = selectedPolarName;
    let polarDropdownOpen = false;

    $: filteredPolars = polarDropdownOpen
        ? allPolars.filter(p => p.name.toLowerCase().includes(polarSearchQuery.toLowerCase()))
        : [];

    // Keep search query in sync when selection changes externally (e.g. settings)
    $: if (!polarDropdownOpen) polarSearchQuery = selectedPolarName;

    function openPolarDropdown(): void {
        polarSearchQuery = '';
        polarDropdownOpen = true;
    }

    function closePolarDropdown(): void {
        // Small delay so mousedown on option fires before blur closes the list
        setTimeout(() => {
            polarDropdownOpen = false;
            polarSearchQuery = selectedPolarName;
        }, 150);
    }

    function selectPolar(name: string): void {
        selectedPolarName = name;
        settingsStore.set('selectedPolarName', name);
        motorboatMode = name === 'Motorboat';
        settingsStore.set('motorboatMode', motorboatMode);
        polarSearchQuery = name;
        polarDropdownOpen = false;
    }

    /** Re-read motorboat fields from store (e.g. after SettingsModal changes). */
    export function refreshFromSettings(): void {
        motorboatMode = settingsStore.get('motorboatMode');
        motorboatCruiseKt = settingsStore.get('motorboatCruiseKt');
        motorboatHeavyKt = settingsStore.get('motorboatHeavyKt');
        motorboatSwellThresholdM = settingsStore.get('motorboatSwellThresholdM');
    }

    function handlePolarSearchKey(e: KeyboardEvent): void {
        if (e.key === 'Escape') {
            polarDropdownOpen = false;
            polarSearchQuery = selectedPolarName;
            (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Enter' && filteredPolars.length > 0) {
            selectPolar(filteredPolars[0].name);
            (e.target as HTMLInputElement).blur();
        }
    }
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

    function handleEditStartFromCard(): void {
        if (isRouting || isDepartureScanning) return;
        if (waypointState === 'ADDING_WAYPOINTS') onStopAddingWaypoints();
        startEditCoord('start');
    }
    function handleEditEndFromCard(): void {
        if (isRouting || isDepartureScanning) return;
        if (waypointState === 'ADDING_WAYPOINTS') onStopAddingWaypoints();
        startEditCoord('end');
    }
    function handleEditWaypointFromCard(i: number): void {
        if (isRouting || isDepartureScanning) return;
        if (waypointState === 'ADDING_WAYPOINTS') onStopAddingWaypoints();
        startEditCoord(i);
    }

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

    async function useMyLocationForEdit(): Promise<void> {
        const pos = await onUseMyLocation();
        if (pos) {
            editLat = pos.lat.toFixed(4);
            editLon = pos.lon.toFixed(4);
        }
    }

    async function handleUseMyLocationAsStart(): Promise<void> {
        const pos = await onUseMyLocation();
        if (pos) {
            onPlaceMyLocation(pos);
        }
    }

    export function getDepartureTime(): number {
        return new Date(departureStr).getTime();
    }

    export function setDepartureTime(ts: number): void {
        departureStr = formatDateForInput(new Date(ts));
    }

    export function getDepartureWindowConfig() {
        return departureWindowInput?.getWindowConfig();
    }

    const FORECAST_HORIZON_MS = 7 * 24 * 3600_000; // 7 days — beyond this, forecast skill degrades

    $: departureMs = new Date(departureStr).getTime();
    $: departureInPast = departureMs < Date.now() - 3600_000; // 1-hour grace
    $: departureBeyondForecast = departureMs > Date.now() + FORECAST_HORIZON_MS;

    $: canCalculate = waypointState === 'READY' && !isRouting && !isDepartureScanning
        && (mode === 'departure' ? !departureWindowInPast : !departureInPast);

    $: fastestDuration =
        results.length > 1 ? Math.min(...results.map((r) => r.route.durationHours)) : Infinity;

    function handleCalculate(): void {
        if (mode === 'departure') {
            onDepartureScan();
        } else {
            onCalculate();
        }
    }

    function handleClear(): void {
        selectedComparisonModel = null;
        onClear();
    }

    function handleExportGpx(): void {
        if (!start || !end) return;
        triggerGpxDownload({
            startName: startName || 'Start',
            endName: endName || 'Finish',
            start,
            end,
            waypoints,
            version: pkg.version,
            timestamp: new Date().toISOString(),
        });
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
        motorboatMode = settings.motorboatMode;
        motorboatCruiseKt = settings.motorboatCruiseKt;
        motorboatHeavyKt = settings.motorboatHeavyKt;
        motorboatSwellThresholdM = settings.motorboatSwellThresholdM;
        allPolars = getAllPolars();
    }

    settingsStore.subscribe(onSettingsChange);
    onDestroy(() => { settingsStore.unsubscribe(onSettingsChange); });
</script>

<style lang="less">
    .routing-panel {
        padding: 5px 0;
        display: flex;
        flex-direction: column;
        min-height: 100%;
    }
    .section {
        padding: 0;
    }
    .section--disabled {
        opacity: 0.4;
        pointer-events: none;
    }
    .instruction {
        line-height: 1.6;
        opacity: 0.9;
    }

    .location-btn {
        margin-top: 6px;
        opacity: 0.7;

        &:hover {
            opacity: 1;
        }
    }

    .loc-btn {
        padding: 2px 5px;
        font-size: 14px;
        line-height: 1;
    }
    .coords {
        opacity: 0.7;
        line-height: 1.6;
    }
    .coords--sub {
        opacity: 0.4;
        margin-top: -4px;
        line-height: 1.3;
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
    .caution-text {
        color: rgba(233, 196, 106, 0.7);
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

    /* Route reference (compact coords) */
    .route-ref {
        opacity: 0.6;
        line-height: 1.5;
    }

    /* Selected route stats */
    .selected-stats {
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        padding-top: 10px;
    }

    .stats-header {
        opacity: 0.6;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    /* Clear route button */
    .clear-btn {
        opacity: 0.8;
        &:hover {
            opacity: 1;
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

        tbody tr {
            cursor: pointer;
            transition: background 0.1s ease;

            &:hover {
                background: rgba(255, 255, 255, 0.06);
            }
        }

        tr.selected-row {
            border-radius: 3px;
            font-weight: 600;
        }

        tr.hovered-row {
            border-radius: 3px;
        }

        tr.fastest-row {
            background: rgba(255, 255, 255, 0.04);
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
        margin-top: auto;
    }

    .footer {
        opacity: 0.3;
        text-align: center;
        line-height: 1.4;
    }

    .footer-link {
        background: none;
        border: none;
        color: inherit;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
        padding: 0;
        font: inherit;

        &:hover {
            opacity: 1;
        }
    }

    .about-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    }

    .about-modal {
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        padding: 24px;
        max-width: 320px;
        width: 90%;
        position: relative;
        color: #e0e0e0;
    }

    .about-close {
        position: absolute;
        top: 8px;
        right: 12px;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;

        &:hover {
            color: white;
        }
    }

    .about-title {
        margin: 0 0 12px;
        font-size: 16px;
        font-weight: 600;
    }

    .about-text {
        margin: 0 0 10px;
        font-size: 13px;
        line-height: 1.5;
        opacity: 0.85;
    }

    .about-link {
        color: #457b9d;
        text-decoration: underline;
        text-underline-offset: 2px;

        &:hover {
            color: #6aa3c4;
        }
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

    .polar-search-wrap {
        position: relative;
        flex: 1;
        min-width: 0;
    }

    .polar-search-input {
        width: 100%;
    }

    .polar-dropdown {
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        max-height: 200px;
        overflow-y: auto;
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-top: none;
        border-radius: 0 0 4px 4px;
        z-index: 100;
        display: flex;
        flex-direction: column;
    }

    .polar-option {
        background: none;
        border: none;
        color: #e0e0e0;
        padding: 6px 8px;
        text-align: left;
        cursor: pointer;
        font-size: 13px;
        line-height: 1.4;

        &:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        &--active {
            background: rgba(78, 205, 196, 0.15);
            color: #4ecdc4;
        }

        &--empty {
            opacity: 0.5;
            cursor: default;
            font-style: italic;
        }
    }

    .boat-buttons {
        display: flex;
        gap: 5px;
    }

    .motor-summary {
        color: #8a9ab0;
        padding: 6px 10px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        line-height: 1.35;
        margin-top: 6px;
        width: 100%;
        text-align: left;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font: inherit;
    }
    .motor-summary:hover {
        background: rgba(255, 255, 255, 0.08);
        color: #e6eef8;
    }
    .motor-summary-edit {
        opacity: 0.6;
        font-size: 12px;
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

    /* Mode toggle */
    .mode-toggle {
        display: flex;
        gap: 4px;
    }

    .pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: inherit;
        padding: 4px 10px;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.15s;

        &:hover {
            opacity: 1;
        }

        &.pill--active {
            background: rgba(78, 205, 196, 0.2);
            border-color: #4ecdc4;
            opacity: 1;
        }
    }

    .gear-btn--float {
        position: absolute;
        right: 0;
        top: 0;
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        line-height: 1;

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

    /* Route breakdown bars */
    .route-breakdown {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .breakdown-section {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .breakdown-label {
        opacity: 0.6;
    }

    .stacked-bar {
        display: flex;
        height: 6px;
        border-radius: 3px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.08);
    }

    .bar-seg {
        min-width: 1px;
    }

    .breakdown-legend {
        opacity: 0.6;
        line-height: 1.6;
    }

    .legend-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        margin-right: 2px;
        vertical-align: middle;
    }

    .legend-sep {
        margin: 0 3px;
        opacity: 0.4;
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

    @media (max-width: 600px) {
        .input {
            padding: 8px 10px;
        }
        .coord-input {
            width: 65px;
        }
        .pill {
            padding: 6px 12px;
        }
        .btn {
            padding: 6px 12px;
        }
        .wp-remove {
            padding: 4px 8px;
            font-size: 18px;
        }
        .gear-btn {
            font-size: 24px;
            padding: 8px;
        }
    }
</style>
