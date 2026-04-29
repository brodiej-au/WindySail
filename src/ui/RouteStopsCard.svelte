<script lang="ts">
    import { t, locale } from '../i18n';
    import type { LatLon } from '../routing/types';

    export let start: LatLon | null = null;
    export let startName: string | null = null;
    export let end: LatLon | null = null;
    export let endName: string | null = null;
    export let waypoints: LatLon[] = [];
    export let onEditStart: () => void = () => {};
    export let onEditEnd: () => void = () => {};
    export let onEditWaypoint: (index: number) => void = () => {};
    export let onRemoveWaypoint: (index: number) => void = () => {};
    export let readOnly: boolean = false;

    function fmt(p: LatLon | null): string {
        if (!p) return '—';
        return `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}`;
    }
</script>

<div class="stops-card">
    <span hidden>{$locale}</span>
    {#if start}
        <div class="row">
            <div class="badge start">S</div>
            <div class="meta">
                <div class="name">{startName ?? t('routing.startLabel')}</div>
                <div class="sub">{fmt(start)}</div>
            </div>
            {#if !readOnly}
                <button class="edit" on:click={onEditStart} title={t('routing.editStartTitle')}>&#9998;</button>
            {/if}
        </div>
    {/if}
    {#each waypoints as wp, i}
        <div class="row">
            <div class="badge wpt">{i + 1}</div>
            <div class="meta">
                <div class="name">{t('routing.waypointLabel', { n: i + 1 })}</div>
                <div class="sub">{fmt(wp)}</div>
            </div>
            {#if !readOnly}
                <button class="edit" on:click={() => onEditWaypoint(i)} title={t('routing.editWaypointTitle')}>&#9998;</button>
                <button class="remove" on:click={() => onRemoveWaypoint(i)} title={t('routing.removeTitle')}>&#215;</button>
            {/if}
        </div>
    {/each}
    {#if end}
        <div class="row">
            <div class="badge end">F</div>
            <div class="meta">
                <div class="name">{endName ?? t('routing.finishLabel')}</div>
                <div class="sub">{fmt(end)}</div>
            </div>
            {#if !readOnly}
                <button class="edit" on:click={onEditEnd} title={t('routing.editFinishTitle')}>&#9998;</button>
            {/if}
        </div>
    {/if}
</div>

<style>
    .stops-card {
        background: #1b2433;
        border: 1px solid #2a3547;
        border-radius: 14px;
        padding: 10px 12px;
        margin-bottom: 10px;
    }
    .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 0;
        position: relative;
    }
    .row + .row::before {
        content: '';
        position: absolute;
        left: 13px;
        top: -10px;
        width: 2px;
        height: 16px;
        background: #3a4657;
    }
    .badge {
        width: 28px;
        height: 28px;
        flex: none;
        border-radius: 50%;
        color: #fff;
        font-weight: 700;
        font-size: 13px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .badge.start { background: #16a34a; }
    .badge.end   { background: #dc2626; }
    .badge.wpt   { background: #3b82f6; }
    .meta { flex: 1; min-width: 0; }
    .name { font-size: 13px; font-weight: 600; line-height: 1.2; }
    .sub { font-size: 11px; color: #8a9ab0; margin-top: 2px; }
    .edit, .remove {
        background: transparent;
        border: none;
        color: #8a9ab0;
        cursor: pointer;
        font-size: 14px;
        padding: 4px 6px;
    }
    .edit:hover, .remove:hover { color: #e6eef8; }
</style>
