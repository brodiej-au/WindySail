<div class="departure-results">
    <!-- Metric toggle -->
    <div class="metric-toggle">
        <span class="size-xs toggle-label">Show:</span>
        {#each metrics as m}
            <button
                class="pill size-xs"
                class:pill--active={activeMetric === m}
                on:click={() => activeMetric = m}
            >
                {METRIC_LABELS[m]}
            </button>
        {/each}
    </div>

    <!-- Table header -->
    <div class="dp-header size-xs">
        <div class="col-depart">Depart</div>
        <div class="col-model">Model</div>
        <div class="col-bar">Conditions ({METRIC_LABELS[activeMetric]})</div>
        <div class="col-eta">ETA</div>
        <div class="col-dur">Dur.</div>
        <div class="col-motor">Mtr%</div>
    </div>

    <!-- Grouped rows -->
    {#each results as dep (dep.departureTime)}
        {@const isBest = bestDepartureTime === dep.departureTime}
        <div class="dep-group" class:dep-group--best={isBest}>
            {#each dep.modelResults as mr, modelIdx (mr.model)}
                <div
                    class="dp-row size-xs"
                    class:dp-row--selected={selectedKey === rowKey(dep.departureTime, mr.model)}
                    on:mouseenter={() => onHover(dep.departureTime, mr.model, mr, dep.modelResults)}
                    on:mouseleave={() => onHoverEnd()}
                    on:click={() => onSelect(dep.departureTime, mr.model, mr)}
                >
                    <div class="col-depart">
                        {#if modelIdx === 0}
                            {#if isBest}<span class="best-star">&#9733;</span>{/if}
                            {formatDepartureTime(dep.departureTime)}
                        {/if}
                    </div>
                    <div class="col-model">
                        <span class="model-dot" style:background={mr.color}></span>
                        {MODEL_LABELS[mr.model]}
                    </div>
                    <div class="col-bar">
                        <ConditionBar points={mr.route.path} metric={activeMetric} />
                    </div>
                    <div class="col-eta">{formatEta(mr.route.eta)}</div>
                    <div class="col-dur">{formatDuration(mr.route.durationHours)}</div>
                    <div class="col-motor">{computeMotorPercent(mr.route.path)}%</div>
                </div>
            {/each}
            {#if dep.failedModels && dep.failedModels.length > 0}
                <div class="dp-row dp-row--failed size-xs">
                    <div class="col-depart"></div>
                    <div class="col-rest">
                        &#9888; {dep.failedModels.map(m => MODEL_LABELS[m]).join(', ')} failed
                    </div>
                </div>
            {/if}
        </div>
    {/each}

    {#if results.length === 0 && !isScanning}
        <div class="no-results size-s">No departure results yet.</div>
    {/if}

    <!-- Legend -->
    {#if results.length > 0}
        <div class="dp-footer size-xs">
            Hover row to preview route &middot; Click to select
        </div>
    {/if}
</div>

<script lang="ts">
    import type { DepartureResult, ModelRouteResult, RoutePoint, WindModelId } from '../routing/types';
    import { MODEL_LABELS } from '../map/modelColors';
    import ConditionBar from './ConditionBar.svelte';
    import { METRIC_LABELS } from './conditionBarColors';
    import type { ConditionMetric } from './conditionBarColors';

    export let results: DepartureResult[] = [];
    export let isScanning: boolean = false;
    export let onRouteHover: (result: ModelRouteResult | null, siblings?: ModelRouteResult[]) => void = () => {};
    export let onRouteSelect: (result: ModelRouteResult | null) => void = () => {};

    const metrics: ConditionMetric[] = ['tws', 'sog', 'twa', 'swell'];
    let activeMetric: ConditionMetric = 'tws';
    let selectedKey: string | null = null;

    $: bestDepartureTime = findBestDeparture(results);

    function rowKey(departureTime: number, model: WindModelId): string {
        return `${departureTime}-${model}`;
    }

    function findBestDeparture(deps: DepartureResult[]): number | null {
        let bestTime: number | null = null;
        let bestDuration = Infinity;
        for (const dep of deps) {
            for (const mr of dep.modelResults) {
                if (mr.route.durationHours < bestDuration) {
                    bestDuration = mr.route.durationHours;
                    bestTime = dep.departureTime;
                }
            }
        }
        return bestTime;
    }

    function onHover(_departureTime: number, _model: WindModelId, mr: ModelRouteResult, allModelResults?: ModelRouteResult[]): void {
        if (selectedKey) return;
        onRouteHover(mr, allModelResults);
    }

    function onHoverEnd(): void {
        if (selectedKey) return;
        onRouteHover(null);
    }

    function onSelect(departureTime: number, model: WindModelId, mr: ModelRouteResult): void {
        const key = rowKey(departureTime, model);
        if (selectedKey === key) {
            selectedKey = null;
            onRouteSelect(null);
        } else {
            selectedKey = key;
            onRouteSelect(mr);
        }
    }

    function formatDepartureTime(ts: number): string {
        const d = new Date(ts);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatEta(ts: number): string {
        const d = new Date(ts);
        return d.toLocaleString(undefined, {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function formatDuration(hours: number): string {
        const days = Math.floor(hours / 24);
        const hrs = Math.floor(hours % 24);
        if (days > 0) return `${days}d ${hrs}h`;
        return `${hrs}h`;
    }

    function computeMotorPercent(path: RoutePoint[]): number {
        if (path.length === 0) return 0;
        const motorCount = path.filter(p => p.isMotoring).length;
        return Math.round((motorCount / path.length) * 100);
    }
</script>

<style lang="less">
    .departure-results {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 10px;
    }

    .metric-toggle {
        display: flex;
        gap: 3px;
        align-items: center;
        margin-bottom: 10px;
    }

    .toggle-label {
        opacity: 0.5;
        margin-right: 4px;
    }

    .pill {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: inherit;
        padding: 3px 8px;
        cursor: pointer;
        opacity: 0.7;
        transition: all 0.15s;

        &:hover {
            opacity: 1;
        }

        &.pill--active {
            background: #4ecdc4;
            color: #000;
            opacity: 1;
            font-weight: bold;
            border-color: #4ecdc4;
        }
    }

    .dp-header {
        display: grid;
        grid-template-columns: 72px 44px 1fr 56px 44px 38px;
        gap: 6px;
        padding: 0 4px 6px;
        color: rgba(255, 255, 255, 0.4);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .dep-group {
        border-left: 2px solid transparent;
        margin-top: 2px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);

        &.dep-group--best {
            border-left-color: #4ecdc4;
            background: rgba(78, 205, 196, 0.05);
        }
    }

    .dp-row {
        display: grid;
        grid-template-columns: 72px 44px 1fr 56px 44px 38px;
        gap: 6px;
        padding: 5px 4px;
        align-items: center;
        cursor: pointer;
        transition: background 0.1s;

        &:hover {
            background: rgba(255, 255, 255, 0.06);
        }

        &.dp-row--selected {
            background: rgba(78, 205, 196, 0.12);
        }

        &.dp-row--failed {
            cursor: default;
            opacity: 0.5;

            .col-rest {
                grid-column: 2 / -1;
                color: #e9c46a;
            }
        }
    }

    .col-model {
        display: flex;
        align-items: center;
        gap: 3px;
    }

    .model-dot {
        display: inline-block;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .best-star {
        color: #4ecdc4;
        margin-right: 2px;
    }

    .no-results {
        opacity: 0.5;
        text-align: center;
        padding: 20px 0;
    }

    .dp-footer {
        opacity: 0.4;
        margin-top: 8px;
        font-style: italic;
    }

    @media (max-width: 600px) {
        .departure-results {
            overflow-x: auto;
        }
        .pill {
            padding: 5px 10px;
        }
    }
</style>
