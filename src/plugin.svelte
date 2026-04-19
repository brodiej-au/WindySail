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
        onAddWaypoint={handleAddWaypoint}
        onStopAddingWaypoints={handleStopAddingWaypoints}
        onRemoveWaypoint={handleRemoveWaypoint}
        {savedRoutes}
        {suggestedRouteName}
        {startName}
        {endName}
        onSaveRoute={handleSaveRoute}
        onLoadRoute={handleLoadRoute}
        onDeleteRoute={handleDeleteRoute}
        onEditStart={handleEditStart}
        onEditEnd={handleEditEnd}
        onEditWaypoint={handleEditWaypoint}
        onDepartureScan={handleDepartureScan}
        onDepartureRouteHover={handleDepartureRouteHover}
        onDepartureRouteSelect={handleDepartureRouteSelect}
        onComparisonHover={handleComparisonHover}
        onComparisonSelect={handleComparisonSelect}
        onUseMyLocation={handleUseMyLocation}
        onPlaceMyLocation={handlePlaceMyLocation}
        bind:this={routingPanel}
    />
</section>

<DisclaimerModal
    visible={disclaimerVisible}
    onAccept={onDisclaimerAccept}
/>

<script lang="ts">
    import bcast from '@windy/broadcast';
    import store from '@windy/store';
    import { map } from '@windy/map';
    import { get as reverseName } from '@windy/reverseName';
    import { getGPSlocation } from '@windy/geolocation';
    import { onDestroy, onMount } from 'svelte';

    import config from './pluginConfig';
    import { getOrCreateDeviceId, hasPersistedDeviceId } from './backend/deviceId';
    import { postInstall, postHeartbeat, postDisclaimerAck, shouldSendHeartbeat, flushPendingEvents } from './backend/client';
    import { DISCLAIMER_VERSION } from './backend/config';
    import DisclaimerModal from './ui/DisclaimerModal.svelte';
    import { initAnalytics, trackEvent } from './analytics';
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
    import { MODEL_COLORS, getWindyProduct } from './map/modelColors';
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
    let startName = '';
    let endName = '';

    let mode: 'single' | 'departure' = 'single';
    let departureResults: DepartureResult[] = [];
    let isDepartureScanning = false;
    const departurePlanner = new DeparturePlanner();
    let selectedComparisonModel: WindModelId | null = null;

    let routingPanel: RoutingPanel;

    let originalTimestamp: number | null = null;
    let originalProduct: string | null = null;
    let originalOverlay: string | null = null;

    const DISCLAIMER_ACK_KEY = 'windysail-disclaimer-ack';
    let disclaimerVisible = false;
    let pendingCalculate: (() => void) | null = null;

    function hasAcknowledgedDisclaimer(): boolean {
        try {
            const raw = localStorage.getItem(DISCLAIMER_ACK_KEY);
            if (!raw) return false;
            const parsed = JSON.parse(raw);
            return parsed?.version === DISCLAIMER_VERSION;
        } catch { return false; }
    }

    function markDisclaimerAccepted(): void {
        try {
            localStorage.setItem(DISCLAIMER_ACK_KEY, JSON.stringify({
                version: DISCLAIMER_VERSION,
                acceptedAt: new Date().toISOString(),
            }));
        } catch {}
    }

    function onDisclaimerAccept() {
        markDisclaimerAccepted();
        const deviceId = getOrCreateDeviceId();
        const email = (store.get('user') as any)?.email ?? null;
        postDisclaimerAck({
            deviceId,
            email,
            pluginVersion: config.version,
            disclaimerVersion: DISCLAIMER_VERSION,
            acceptedAt: new Date().toISOString(),
        });
        disclaimerVisible = false;
        pendingCalculate?.();
        pendingCalculate = null;
    }

    const renderer = new RouteRenderer();
    const boatMarkers = new BoatMarkerManager();
    const orchestrator = new RoutingOrchestrator(name);
    let waypointMgr: WaypointManager;

    onMount(() => {
        const freshInstall = !hasPersistedDeviceId();
        const deviceId = getOrCreateDeviceId();
        const email = (store.get('user') as any)?.email ?? null;
        const pluginVersion = config.version;
        const usedLang = (store.get('usedLang') as string) ?? 'en';
        const userAgent = navigator.userAgent;

        // Fire-and-forget, never await. Plugin UX must never block on backend.
        if (freshInstall) {
            postInstall({ deviceId, email, pluginVersion, usedLang, userAgent });
        } else if (shouldSendHeartbeat()) {
            postHeartbeat({ deviceId, email, pluginVersion, usedLang });
        }
        flushPendingEvents();
    });

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
                startName = formatPlaceName(s);
                endName = formatPlaceName(e);
                suggestedRouteName = startName && endName
                    ? `${startName} to ${endName}`
                    : startName || endName || '';
            }).catch(() => {});
        } else {
            startName = '';
            endName = '';
        }
    }

    function handleCalculate(): void {
        if (hasAcknowledgedDisclaimer()) {
            performCalculate();
            return;
        }
        pendingCalculate = () => { performCalculate(); };
        disclaimerVisible = true;
    }

    async function performCalculate(): Promise<void> {
        // Read latest positions directly from WaypointManager to avoid stale state
        const liveStart = waypointMgr?.getStart() ?? start;
        const liveEnd = waypointMgr?.getEnd() ?? end;
        const liveWaypoints = waypointMgr?.getWaypoints() ?? waypoints;

        if (!liveStart || !liveEnd) return;

        // Sync reactive state in case it drifted
        start = liveStart;
        end = liveEnd;
        waypoints = liveWaypoints;

        renderer.clear();
        boatMarkers.clear();
        previewDistanceNm = 0;
        error = null;
        results = [];
        failedModels = [];
        isRouting = true;
        progressPercent = 0;
        progressStatus = 'Starting...';

        const computeStart = Date.now();

        try {
            const departureTime = routingPanel.getDepartureTime();
            const settings = settingsStore.getAll();
            const polar = getPolarByName(settings.selectedPolarName);

            trackEvent('route_calculate', {
                mode,
                models: settings.selectedModels.length,
                polar_name: settings.selectedPolarName,
                distance_nm: Math.round(previewDistanceNm),
            });

            const distNm = distance(liveStart, liveEnd);
            const worstCaseVmg = settings.motorEnabled
                ? Math.min(settings.estimatedVmgKt, settings.motorSpeed)
                : settings.estimatedVmgKt;
            const estimatedHours = Math.max(24, Math.ceil(distNm / worstCaseVmg) * 2.0);
            const effectiveMaxDuration = Math.min(estimatedHours, settings.maxDuration);

            progressStatus = `Fetching ${effectiveMaxDuration}h of forecast data (~${distNm.toFixed(0)}nm)`;

            // Zoom map to route extents so Windy loads the right tiles before sampling
            const allPts: [number, number][] = [liveStart, ...(liveWaypoints ?? []), liveEnd]
                .map(p => [p.lat, p.lon] as [number, number]);
            if (allPts.length >= 2) {
                map.fitBounds(L.latLngBounds(allPts), { padding: [60, 60] });
            }

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

            // Ensure wind overlay is active so product switch shows data
            store.set('overlay', 'wind');

            if (routeResults.length > 1) {
                // Multi-model: render with fitBounds first, then switch to selection mode
                renderer.renderRoutes(routeResults);
                const fastest = routeResults.reduce((a, b) => a.route.durationHours < b.route.durationHours ? a : b);
                selectedComparisonModel = fastest.model;
                // Switch to selection rendering (no fitBounds) after initial fit
                renderer.renderRoutesWithSelection(routeResults, fastest.model);
                store.set('product', fastest.model);
            } else if (routeResults.length === 1) {
                // Single model: render normally with fitBounds
                renderer.renderRoutes(routeResults);
                selectedComparisonModel = routeResults[0].model;
                store.set('product', routeResults[0].model);
            }

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

            if (routeResults.length > 0) {
                const fastest = routeResults.reduce((a, b) =>
                    a.route.durationHours < b.route.durationHours ? a : b,
                );
                trackEvent('route_complete', {
                    mode,
                    models: routeResults.length,
                    polar_name: settings.selectedPolarName,
                    duration_hours: Math.round(fastest.route.durationHours * 10) / 10,
                    distance_nm: Math.round(fastest.route.totalDistanceNm),
                    avg_sog: Math.round(fastest.route.avgSpeedKt * 10) / 10,
                    compute_time_ms: Date.now() - computeStart,
                });
            }

            // Identify models that were selected but didn't return results
            const succeededModels = routeResults.map(r => r.model);
            failedModels = settings.selectedModels
                .filter(m => !succeededModels.includes(m))
                .map(m => ({ model: m, reason: 'No data available or routing failed' }));
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                // User cancelled — not an error
            } else {
                error = err instanceof Error ? err.message : 'Routing computation failed.';
                trackEvent('route_error', {
                    error: (error ?? 'unknown').slice(0, 100),
                });
            }
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

        const scanStart = Date.now();

        try {
            const windowConfig = routingPanel.getDepartureWindowConfig();
            if (!windowConfig) return;
            isDepartureScanning = true;

            const settings = settingsStore.getAll();
            const polar = getPolarByName(settings.selectedPolarName);

            trackEvent('departure_scan', {
                models: settings.selectedModels.length,
                polar_name: settings.selectedPolarName,
            });

            const distNm = distance(liveStart, liveEnd);
            const worstCaseVmg = settings.motorEnabled
                ? Math.min(settings.estimatedVmgKt, settings.motorSpeed)
                : settings.estimatedVmgKt;
            const estimatedHours = Math.max(24, Math.ceil(distNm / worstCaseVmg) * 2.0);
            const effectiveMaxDuration = Math.min(estimatedHours, settings.maxDuration);

            // Zoom map to route extents so Windy loads the right tiles before sampling
            const allPts: [number, number][] = [liveStart, ...(liveWaypoints ?? []), liveEnd]
                .map(p => [p.lat, p.lon] as [number, number]);
            if (allPts.length >= 2) {
                map.fitBounds(L.latLngBounds(allPts), { padding: [60, 60] });
            }

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

            trackEvent('departure_complete', {
                models: settings.selectedModels.length,
                departure_count: departureResults.length,
                compute_time_ms: Date.now() - scanStart,
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') {
                // User cancelled — not an error
            } else {
                error = err instanceof Error ? err.message : 'Departure scan failed.';
            }
        } finally {
            isDepartureScanning = false;
        }
    }

    function handleDepartureRouteHover(result: ModelRouteResult | null, siblings: ModelRouteResult[] = []): void {
        renderer.clearDeparturePreview();
        if (result) {
            const otherModels = siblings.filter(s => s.model !== result.model);
            renderer.renderDeparturePreview(result, otherModels);
        }
    }

    function handleDepartureRouteSelect(result: ModelRouteResult | null): void {
        renderer.clearDeparturePreview();
        renderer.clear();
        boatMarkers.clear();
        if (result) {
            renderer.renderRoutes([result]); // full render with fitBounds on click
            results = [result];
        } else {
            results = [];
        }
    }

    /**
     * Build a readable place name from reverseName result.
     * Combines available fields: "name, region" or "name, country".
     * Avoids duplicates (e.g. "Fiji, Fiji") and empty segments.
     */
    function formatPlaceName(r: { name?: string; region?: string; country?: string }): string {
        const segments = [r.name, r.region, r.country].filter(Boolean) as string[];
        // Deduplicate adjacent segments (e.g. name="NSW", region="NSW")
        const unique: string[] = [];
        for (const s of segments) {
            if (unique.length === 0 || unique[unique.length - 1] !== s) {
                unique.push(s);
            }
        }
        // Keep at most 2 segments for brevity
        return unique.slice(0, 2).join(', ');
    }

    function handleCancel(): void {
        trackEvent('route_cancel');
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
        selectedComparisonModel = null;
        renderer.clear();
        boatMarkers.clear();
        previewDistanceNm = 0;
    }

    // Guard to prevent store.on('timestamp') -> handlePlayerTimeChange -> store.set('timestamp') loop
    let settingTimestamp = false;

    /** Update boat marker visuals for a given time (no store side-effects). */
    function updateBoatMarkers(time: number): void {
        for (const result of results) {
            const point = interpolateAtTime(result.route.path, time);
            if (point) {
                boatMarkers.updateMarker(result.model, point, result.color);
            }
        }
        // Gray out non-selected boat markers in multi-model mode
        if (results.length > 1 && selectedComparisonModel) {
            const colorMap: Record<string, string> = {};
            for (const r of results) colorMap[r.model] = r.color;
            boatMarkers.setActiveModel(selectedComparisonModel, colorMap);
        }
    }

    /** Called by our PlayerControls scrubber/playback — updates markers AND syncs Windy timeline. */
    function handlePlayerTimeChange(time: number): void {
        updateBoatMarkers(time);
        settingTimestamp = true;
        store.set('timestamp', time);
        settingTimestamp = false;
    }

    /** Called when user drags Windy's bottom timeline bar — updates our player & markers. */
    function handleWindyTimestampChange(time: number): void {
        if (settingTimestamp) return; // We caused this change, ignore
        if (isRouting || isDepartureScanning) return; // Ignore during data fetching
        if (results.length === 0) return;
        updateBoatMarkers(time);
        routingPanel?.setPlayerTime(time);
    }

    function handleWarning(msg: string): void {
        warning = msg;
        if (warningTimeout) clearTimeout(warningTimeout);
        warningTimeout = setTimeout(() => { warning = null; }, 3000);
    }

    /** Set the Windy product for a model, mapped to the correct name for the current overlay. */
    function switchWindyProduct(model: WindModelId): void {
        const overlay = store.get('overlay');
        const product = getWindyProduct(model, overlay);
        if (product) {
            store.set('product', product);
        }
        // If null (no equivalent for this overlay), leave the product as-is
    }

    function handleComparisonHover(model: WindModelId | null): void {
        if (results.length <= 1) return;
        const renderModel = model ?? selectedComparisonModel;
        if (renderModel) {
            renderer.renderRoutesWithSelection(results, renderModel);
            switchWindyProduct(renderModel);
        }
    }

    function handleComparisonSelect(model: WindModelId): void {
        selectedComparisonModel = model;
        if (results.length > 1) {
            renderer.renderRoutesWithSelection(results, model);
        }
        switchWindyProduct(model);
    }

    async function handleUseMyLocation(): Promise<{ lat: number; lon: number } | null> {
        trackEvent('use_my_location');
        try {
            const pos = await getGPSlocation({ doNotShowFailureMessage: true });
            if (pos && pos.lat && pos.lon) {
                return { lat: pos.lat, lon: pos.lon };
            }
            handleWarning('Could not get your location');
            return null;
        } catch {
            handleWarning('Could not get your location');
            return null;
        }
    }

    function handlePlaceMyLocation(pos: { lat: number; lon: number }): void {
        waypointMgr?.placePoint(pos, true);
    }

    function handleAddWaypoint(): void {
        trackEvent('waypoint_add', { waypoint_count: waypoints.length + 1 });
        waypointMgr?.startAddingWaypoints();
    }

    function handleStopAddingWaypoints(): void {
        waypointMgr?.stopAddingWaypoints();
    }

    function handleRemoveWaypoint(index: number): void {
        waypointMgr?.removeWaypoint(index);
    }

    function handleSaveRoute(name: string): void {
        trackEvent('route_save');
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
        trackEvent('route_load');
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

    let timestampSubId: number | null = null;
    let lastPolarName: string = settingsStore.get('selectedPolarName');

    function onSettingsChange(settings: { selectedPolarName: string }): void {
        if (settings.selectedPolarName !== lastPolarName) {
            lastPolarName = settings.selectedPolarName;
            trackEvent('polar_select', { polar_name: settings.selectedPolarName });
        }
    }

    export const onopen = (_params: unknown) => {
        initAnalytics();
        trackEvent('plugin_open');
        settingsStore.subscribe(onSettingsChange);
        originalTimestamp = store.get('timestamp');
        originalProduct = store.get('product');
        originalOverlay = store.get('overlay');
        waypointMgr = new WaypointManager(name, handleWaypointChange, handleWarning, handleDrag);
        waypointMgr.activate();

        // Sync with Windy's bottom timeline bar
        timestampSubId = store.on('timestamp', handleWindyTimestampChange);

        // Restore last route if available
        const lastRoute = routeStore.getLastRoute();
        if (lastRoute) {
            waypointMgr.loadRoute(lastRoute.start, lastRoute.end, lastRoute.waypoints);
            if (lastRoute.departureTime) {
                routingPanel?.setDepartureTime(lastRoute.departureTime);
            }
        }
    };

    onDestroy(() => {
        trackEvent('plugin_close');
        if (timestampSubId !== null) {
            store.off(timestampSubId);
        }
        waypointMgr?.destroy();
        renderer.clear();
        boatMarkers.clear();
        orchestrator.destroy();
        departurePlanner.destroy();
        routeStore.unsubscribe(onRoutesChanged);
        settingsStore.unsubscribe(onSettingsChange);
        if (originalTimestamp !== null) {
            store.set('timestamp', originalTimestamp);
        }
        if (originalOverlay !== null) {
            store.set('overlay', originalOverlay);
        }
        if (originalProduct !== null) {
            store.set('product', originalProduct);
        }
    });
</script>

<style lang="less">
</style>
