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
        {result}
        {error}
        onCalculate={handleCalculate}
        onCancel={handleCancel}
        onClear={handleClear}
        bind:this={routingPanel}
    />
</section>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';
    import RoutingPanel from './ui/RoutingPanel.svelte';
    import { WaypointManager } from './map/WaypointManager';
    import { RouteRenderer } from './map/RouteRenderer';
    import { RoutingOrchestrator } from './adapters/RoutingOrchestrator';
    import bavaria38Polar from './data/polars/bavaria38.json';

    import type { LatLon, RouteResult } from './routing/types';
    import type { WaypointState } from './map/WaypointManager';

    const { title, name } = config;

    let waypointState: WaypointState = 'WAITING_START';
    let start: LatLon | null = null;
    let end: LatLon | null = null;
    let isRouting = false;
    let progressPercent = 0;
    let progressStatus = '';
    let result: RouteResult | null = null;
    let error: string | null = null;

    let routingPanel: RoutingPanel;

    const renderer = new RouteRenderer();
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
        if (!start || !end) {
            return;
        }

        error = null;
        result = null;
        isRouting = true;
        progressPercent = 0;
        progressStatus = 'Starting...';

        try {
            const departureTime = routingPanel.getDepartureTime();

            const options = {
                startTime: departureTime,
                timeStep: 1.0,
                maxDuration: 168,
                headingStep: 5,
                numSectors: 72,
                arrivalRadius: 1.0,
            };

            const routeResult = await orchestrator.computeRoute(
                start,
                end,
                bavaria38Polar,
                options,
                (status, percent) => {
                    progressStatus = status;
                    progressPercent = percent;
                },
            );

            result = routeResult;
            renderer.renderRoute(routeResult);
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
        result = null;
        error = null;
        renderer.clear();
    }

    export const onopen = (_params: unknown) => {
        waypointMgr = new WaypointManager(name, handleWaypointChange);
        waypointMgr.activate();
    };

    onMount(() => {});

    onDestroy(() => {
        waypointMgr?.destroy();
        renderer.clear();
        orchestrator.destroy();
    });
</script>

<style lang="less">
</style>
