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
        {isRouting}
        {progressPercent}
        {progressStatus}
        {results}
        {failedModels}
        polarName={settingsStore.get('selectedPolarName')}
        {error}
        onCalculate={handleCalculate}
        onCancel={handleCancel}
        onClear={handleClear}
        onTimeChange={handlePlayerTimeChange}
        onModelSwitch={handleModelSwitch}
        bind:this={routingPanel}
    />
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import { onDestroy } from 'svelte';

    import config from './pluginConfig';
    import RoutingPanel from './ui/RoutingPanel.svelte';
    import { WaypointManager } from './map/WaypointManager';
    import { RouteRenderer } from './map/RouteRenderer';
    import { BoatMarkerManager } from './map/BoatMarkerManager';
    import { RoutingOrchestrator } from './adapters/RoutingOrchestrator';
    import { settingsStore } from './stores/SettingsStore';
    import { getPolarByName } from './data/polarRegistry';
    import { interpolateAtTime } from './routing/RouteInterpolator';
    import { distance } from './routing/geo';

    import type { LatLon, ModelRouteResult, WindModelId } from './routing/types';
    import type { WaypointState } from './map/WaypointManager';

    const { title, name } = config;

    let waypointState: WaypointState = 'WAITING_START';
    let start: LatLon | null = null;
    let end: LatLon | null = null;
    let isRouting = false;
    let progressPercent = 0;
    let progressStatus = '';
    let results: ModelRouteResult[] = [];
    let failedModels: { model: WindModelId; reason: string }[] = [];
    let error: string | null = null;

    let routingPanel: RoutingPanel;

    let originalTimestamp: number | null = null;
    let originalProduct: string | null = null;

    const renderer = new RouteRenderer();
    const boatMarkers = new BoatMarkerManager();
    const orchestrator = new RoutingOrchestrator(name);
    let waypointMgr: WaypointManager;

    function handleWaypointChange(
        state: WaypointState,
        newStart: LatLon | null,
        newEnd: LatLon | null,
    ): void {
        waypointState = state;
        start = newStart;
        end = newEnd;
    }

    async function handleCalculate(): Promise<void> {
        if (!start || !end) return;

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

            const distNm = distance(start, end);
            const estimatedHours = Math.max(24, Math.ceil(distNm / settings.estimatedVmgKt) * 2.0);

            progressStatus = `Estimated passage: ~${Math.round(estimatedHours)}h, using ${Math.round(settings.maxDuration)}h forecast window`;

            const options = {
                startTime: departureTime,
                timeStep: settings.timeStep,
                maxDuration: settings.maxDuration,
                headingStep: settings.headingStep,
                numSectors: settings.numSectors,
                arrivalRadius: settings.arrivalRadius,
                motorEnabled: settings.motorEnabled,
                motorThreshold: settings.motorThreshold,
                motorSpeed: settings.motorSpeed,
            };

            const routeResults = await orchestrator.computeRoutes(
                start,
                end,
                polar,
                settings.selectedModels,
                options,
                (status, percent) => {
                    progressStatus = status;
                    progressPercent = percent;
                },
            );

            results = routeResults;
            renderer.renderRoutes(routeResults);

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

    function handleCancel(): void {
        orchestrator.cancel();
        isRouting = false;
        progressStatus = '';
        progressPercent = 0;
    }

    function handleClear(): void {
        results = [];
        failedModels = [];
        error = null;
        renderer.clear();
        boatMarkers.clear();
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

    function handleModelSwitch(model: WindModelId): void {
        store.set('product', model);
    }

    export const onopen = (_params: unknown) => {
        originalTimestamp = store.get('timestamp');
        originalProduct = store.get('product');
        waypointMgr = new WaypointManager(name, handleWaypointChange);
        waypointMgr.activate();
    };

    onDestroy(() => {
        waypointMgr?.destroy();
        renderer.clear();
        boatMarkers.clear();
        orchestrator.destroy();
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
