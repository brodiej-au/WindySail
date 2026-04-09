<div class="plugin__mobile-header">
    {title}
</div>
<section class="plugin__content">
    <div
        class="plugin__title plugin__title--chevron-back"
        on:click={() => bcast.emit('rqstOpen', 'menu')}
    >
        {title}
    </div>
    <RoutingPanel
        {waypointState}
        {start}
        {end}
        {waypoints}
        isRouting={isRouting || isDepartureScanning}
        {previewDistanceNm}
        {progressPercent}
        {progressStatus}
        {results}
        {failedModels}

        {error}
        {warning}
        {pipelineSteps}
        {mode}
        {departureResults}
        {isDepartureScanning}
        onCalculate={handleCalculate}
        onCancel={handleCancel}
        onClear={handleClear}
        onTimeChange={handlePlayerTimeChange}
        onModelSwitch={handleModelSwitch}
        onAddWaypoint={handleAddWaypoint}
        onStopAddingWaypoints={handleStopAddingWaypoints}
        onRemoveWaypoint={handleRemoveWaypoint}
        {savedRoutes}
        {suggestedRouteName}
        onSaveRoute={handleSaveRoute}
        onLoadRoute={handleLoadRoute}
        onDeleteRoute={handleDeleteRoute}
        onEditStart={handleEditStart}
        onEditEnd={handleEditEnd}
        onEditWaypoint={handleEditWaypoint}
        onDepartureScan={handleDepartureScan}
        onDepartureRouteHover={handleDepartureRouteHover}
        onDepartureRouteSelect={handleDepartureRouteSelect}
        bind:this={routingPanel}
    />
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import { get as reverseName } from '@windy/reverseName';
    import { onDestroy } from 'svelte';

    import config from './pluginConfig';
    import RoutingPanel from './ui/RoutingPanel.svelte';
    import { WaypointManager } from './map/WaypointManager';
    import { RouteRenderer } from './map/RouteRenderer';
    import { BoatMarkerManager } from './map/BoatMarkerManager';
    import { RoutingOrchestrator } from './adapters/RoutingOrchestrator';
    import { DeparturePlanner } from './adapters/DeparturePlanner';
    import type { DepartureResult, DepartureWindowConfig } from './routing/types';
    import { settingsStore } from './stores/SettingsStore';
    import { routeStore } from './stores/RouteStore';
    import type { SavedRoute } from './routing/types';
    import { getPolarByName } from './data/polarRegistry';
    import { interpolateAtTime } from './routing/RouteInterpolator';
    import { distance } from './routing/geo';

    import type { LatLon, ModelRouteResult, WindModelId, PipelineStep } from './routing/types';
    import { MODEL_COLORS } from './map/modelColors';
    import type { WaypointState } from './map/WaypointManager';

    const { title, name } = config;

    let waypointState: WaypointState = 'WAITING_START';
    let start: LatLon | null = null;
    let end: LatLon | null = null;
    let waypoints: LatLon[] = [];
    let isRouting = false;
    let progressPercent = 0;
    let progressStatus = '';
    let results: ModelRouteResult[] = [];
    let failedModels: { model: WindModelId; reason: string }[] = [];
    let error: string | null = null;
    let warning: string | null = null;
    let pipelineSteps: PipelineStep[] = [];
    let warningTimeout: ReturnType<typeof setTimeout> | null = null;
    let previewDistanceNm = 0;
    let savedRoutes: SavedRoute[] = routeStore.getAll();
    let suggestedRouteName = '';

    let mode: 'single' | 'departure' = 'single';
    let departureResults: DepartureResult[] = [];
    let isDepartureScanning = false;
    const departurePlanner = new DeparturePlanner();

    let routingPanel: RoutingPanel;

    let originalTimestamp: number | null = null;
    let originalProduct: string | null = null;

    const renderer = new RouteRenderer();
    const boatMarkers = new BoatMarkerManager();
    const orchestrator = new RoutingOrchestrator(name);
    let waypointMgr: WaypointManager;

    function updatePreview(
        liveStart: LatLon | null,
        liveEnd: LatLon | null,
        liveWaypoints: LatLon[],
    ): void {
        if (!liveStart || !liveEnd) {
            renderer.clearPreview();
            previewDistanceNm = 0;
            return;
        }

        const straightPath = [liveStart, ...liveWaypoints, liveEnd];
        let directDist = 0;
        for (let i = 1; i < straightPath.length; i++) {
            directDist += distance(straightPath[i - 1], straightPath[i]);
        }
        renderer.renderPreview(straightPath, directDist);
        previewDistanceNm = directDist;
    }

    function handleDrag(
        _state: WaypointState,
        liveStart: LatLon | null,
        liveEnd: LatLon | null,
        liveWaypoints: LatLon[],
    ): void {
        updatePreview(liveStart, liveEnd, liveWaypoints);
    }

    function handleWaypointChange(
        state: WaypointState,
        newStart: LatLon | null,
        newEnd: LatLon | null,
        newWaypoints: LatLon[],
    ): void {
        waypointState = state;
        start = newStart;
        end = newEnd;
        waypoints = newWaypoints;

        // Update preview when points change via click
        updatePreview(newStart, newEnd, newWaypoints);

        if (newStart && newEnd) {
            Promise.all([reverseName(newStart), reverseName(newEnd)]).then(([s, e]) => {
                suggestedRouteName = `${s.name} to ${e.name}`;
            }).catch(() => {});
        }
    }

    async function handleCalculate(): Promise<void> {
        // Read latest positions directly from WaypointManager to avoid stale state
        const liveStart = waypointMgr?.getStart() ?? start;
        const liveEnd = waypointMgr?.getEnd() ?? end;
        const liveWaypoints = waypointMgr?.getWaypoints() ?? waypoints;

        if (!liveStart || !liveEnd) return;

        // Sync reactive state in case it drifted
        start = liveStart;
        end = liveEnd;
        waypoints = liveWaypoints;

        renderer.clearPreview();
        previewDistanceNm = 0;
        error = null;
        results = [];
        failedModels = [];
        isRouting = true;
        progressPercent = 0;
        progressStatus = 'Starting...';

        try {
            const departureTime = routingPanel.getDepartureTime();
            const settings = settingsStore.getAll();
            const polar = getPolarByName(settings.selectedPolarName);

            const distNm = distance(liveStart, liveEnd);
            const worstCaseVmg = settings.motorEnabled
                ? Math.min(settings.estimatedVmgKt, settings.motorSpeed)
                : settings.estimatedVmgKt;
            const estimatedHours = Math.max(24, Math.ceil(distNm / worstCaseVmg) * 2.0);
            const effectiveMaxDuration = Math.min(estimatedHours, settings.maxDuration);

            progressStatus = `Fetching ${effectiveMaxDuration}h of forecast data (~${distNm.toFixed(0)}nm)`;

            const options = {
                startTime: departureTime,
                timeStep: settings.timeStep,
                maxDuration: effectiveMaxDuration,
                headingStep: settings.headingStep,
                numSectors: settings.numSectors,
                arrivalRadius: settings.arrivalRadius,
                motorEnabled: settings.motorEnabled,
                motorThreshold: settings.motorThreshold,
                motorSpeed: settings.motorSpeed,
                comfortWeight: settings.comfortWeight,
                landMarginNm: settings.landMarginNm,
                preferredLandMarginNm: settings.preferredLandMarginNm,
            };

            // Set up isochrone visualization callback if enabled
            if (settings.showIsochrones) {
                renderer.clearIsochrones();
            }
            const isoCallback = settings.showIsochrones
                ? (model: WindModelId, step: number, points: [number, number][]) => {
                    renderer.renderIsochrone(points, MODEL_COLORS[model] ?? '#457B9D');
                }
                : undefined;

            const routeResults = await orchestrator.computeRoutes(
                liveStart,
                liveEnd,
                polar,
                settings.selectedModels,
                liveWaypoints.length > 0 ? liveWaypoints : undefined,
                options,
                (status, percent, steps) => {
                    progressStatus = status;
                    progressPercent = percent;
                    if (steps) pipelineSteps = steps;
                },
                isoCallback,
            );

            renderer.clearIsochrones();
            results = routeResults;
            renderer.renderRoutes(routeResults);

            // Auto-save last route for restoration on reopen
            routeStore.saveLastRoute({
                start: liveStart,
                end: liveEnd,
                waypoints: liveWaypoints,
                departureTime,
                polarName: settings.selectedPolarName,
                selectedModels: settings.selectedModels,
                routingOptions: {
                    timeStep: settings.timeStep,
                    maxDuration: settings.maxDuration,
                    headingStep: settings.headingStep,
                    numSectors: settings.numSectors,
                    arrivalRadius: settings.arrivalRadius,
                    motorEnabled: settings.motorEnabled,
                    motorThreshold: settings.motorThreshold,
                    motorSpeed: settings.motorSpeed,
                    comfortWeight: settings.comfortWeight,
                },
            });

            // Identify models that were selected but didn't return results
            const succeededModels = routeResults.map(r => r.model);
            failedModels = settings.selectedModels
                .filter(m => !succeededModels.includes(m))
                .map(m => ({ model: m, reason: 'No data available or routing failed' }));
        } catch (err) {
            error = err instanceof Error ? err.message : 'Routing computation failed.';
        } finally {
            isRouting = false;
        }
    }

    async function handleDepartureScan(): Promise<void> {
        const liveStart = waypointMgr?.getStart() ?? start;
        const liveEnd = waypointMgr?.getEnd() ?? end;
        const liveWaypoints = waypointMgr?.getWaypoints() ?? waypoints;

        if (!liveStart || !liveEnd) return;

        start = liveStart;
        end = liveEnd;
        waypoints = liveWaypoints;

        renderer.clearPreview();
        previewDistanceNm = 0;
        error = null;
        departureResults = [];
        progressPercent = 0;
        progressStatus = 'Starting departure scan...';

        try {
            const windowConfig = routingPanel.getDepartureWindowConfig();
            if (!windowConfig) return;
            isDepartureScanning = true;

            const settings = settingsStore.getAll();
            const polar = getPolarByName(settings.selectedPolarName);

            const distNm = distance(liveStart, liveEnd);
            const worstCaseVmg = settings.motorEnabled
                ? Math.min(settings.estimatedVmgKt, settings.motorSpeed)
                : settings.estimatedVmgKt;
            const estimatedHours = Math.max(24, Math.ceil(distNm / worstCaseVmg) * 2.0);
            const effectiveMaxDuration = Math.min(estimatedHours, settings.maxDuration);

            const baseOptions = {
                startTime: 0,
                timeStep: settings.timeStep,
                maxDuration: effectiveMaxDuration,
                headingStep: settings.headingStep,
                numSectors: settings.numSectors,
                arrivalRadius: settings.arrivalRadius,
                motorEnabled: settings.motorEnabled,
                motorThreshold: settings.motorThreshold,
                motorSpeed: settings.motorSpeed,
                comfortWeight: settings.comfortWeight,
                landMarginNm: settings.landMarginNm,
                preferredLandMarginNm: settings.preferredLandMarginNm,
            };

            await departurePlanner.scan(
                liveStart,
                liveEnd,
                polar,
                settings.selectedModels,
                liveWaypoints.length > 0 ? liveWaypoints : undefined,
                baseOptions,
                windowConfig,
                (status, percent) => {
                    progressStatus = status;
                    progressPercent = percent;
                },
                (result) => {
                    departureResults = [...departureResults, result];
                },
            );
        } catch (err) {
            error = err instanceof Error ? err.message : 'Departure scan failed.';
        } finally {
            isDepartureScanning = false;
        }
    }

    function handleDepartureRouteHover(result: ModelRouteResult | null): void {
        renderer.clear();
        if (result) {
            renderer.renderRoutes([result]);
        }
    }

    function handleDepartureRouteSelect(result: ModelRouteResult | null): void {
        renderer.clear();
        boatMarkers.clear();
        if (result) {
            renderer.renderRoutes([result]);
            results = [result];
        } else {
            results = [];
        }
    }

    function handleCancel(): void {
        orchestrator.cancel();
        departurePlanner.cancel();
        isRouting = false;
        isDepartureScanning = false;
        progressStatus = '';
        progressPercent = 0;
    }

    function handleClear(): void {
        results = [];
        departureResults = [];
        failedModels = [];
        error = null;
        renderer.clear();
        boatMarkers.clear();
        previewDistanceNm = 0;
    }

    function handlePlayerTimeChange(time: number): void {
        for (const result of results) {
            const point = interpolateAtTime(result.route.path, time);
            if (point) {
                boatMarkers.updateMarker(result.model, point, result.color);
            }
        }
        store.set('timestamp', time);
    }

    function handleWarning(msg: string): void {
        warning = msg;
        if (warningTimeout) clearTimeout(warningTimeout);
        warningTimeout = setTimeout(() => { warning = null; }, 3000);
    }

    function handleModelSwitch(model: WindModelId): void {
        store.set('product', model);
    }

    function handleAddWaypoint(): void {
        waypointMgr?.startAddingWaypoints();
    }

    function handleStopAddingWaypoints(): void {
        waypointMgr?.stopAddingWaypoints();
    }

    function handleRemoveWaypoint(index: number): void {
        waypointMgr?.removeWaypoint(index);
    }

    function handleSaveRoute(name: string): void {
        if (!start || !end) return;
        const settings = settingsStore.getAll();
        routeStore.createRoute(
            name,
            start,
            end,
            waypoints,
            routingPanel.getDepartureTime(),
            settings.selectedPolarName,
            settings.selectedModels,
            {
                timeStep: settings.timeStep,
                maxDuration: settings.maxDuration,
                headingStep: settings.headingStep,
                numSectors: settings.numSectors,
                arrivalRadius: settings.arrivalRadius,
                motorEnabled: settings.motorEnabled,
                motorThreshold: settings.motorThreshold,
                motorSpeed: settings.motorSpeed,
                comfortWeight: settings.comfortWeight,
            },
        );
    }

    function handleLoadRoute(id: string): void {
        const route = routeStore.get(id);
        if (!route || !waypointMgr) return;
        // Clear existing results
        handleClear();
        // Load waypoints onto map
        waypointMgr.loadRoute(route.start, route.end, route.waypoints);
    }

    function handleDeleteRoute(id: string): void {
        routeStore.delete(id);
    }

    async function handleEditStart(latLon: LatLon): Promise<boolean> {
        if (!waypointMgr) return false;
        return waypointMgr.updateStart(latLon);
    }

    async function handleEditEnd(latLon: LatLon): Promise<boolean> {
        if (!waypointMgr) return false;
        return waypointMgr.updateEnd(latLon);
    }

    async function handleEditWaypoint(index: number, latLon: LatLon): Promise<boolean> {
        if (!waypointMgr) return false;
        return waypointMgr.updateWaypoint(index, latLon);
    }

    function onRoutesChanged(routes: SavedRoute[]): void {
        savedRoutes = routes;
    }
    routeStore.subscribe(onRoutesChanged);

    export const onopen = (_params: unknown) => {
        originalTimestamp = store.get('timestamp');
        originalProduct = store.get('product');
        waypointMgr = new WaypointManager(name, handleWaypointChange, handleWarning, handleDrag);
        waypointMgr.activate();

        // Restore last route if available
        const lastRoute = routeStore.getLastRoute();
        if (lastRoute) {
            waypointMgr.loadRoute(lastRoute.start, lastRoute.end, lastRoute.waypoints);
        }
    };

    onDestroy(() => {
        waypointMgr?.destroy();
        renderer.clear();
        boatMarkers.clear();
        orchestrator.destroy();
        departurePlanner.destroy();
        routeStore.unsubscribe(onRoutesChanged);
        if (originalTimestamp !== null) {
            store.set('timestamp', originalTimestamp);
        }
        if (originalProduct !== null) {
            store.set('product', originalProduct);
        }
    });
</script>

<style lang="less">
</style>
