<div class="tabs" role="tablist">
    {#each tabs as tab (tab.id)}
        <button
            class="tab size-xs"
            class:tab--active={tab.id === active}
            role="tab"
            aria-selected={tab.id === active}
            on:click={() => onSelect(tab.id)}
        >
            {tab.label}
        </button>
    {/each}
</div>

<script lang="ts">
    export let tabs: { id: string; label: string }[] = [];
    export let active: string = '';
    export let onSelect: (id: string) => void = () => {};
</script>

<style lang="less">
    .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 10px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        padding-bottom: 0;
    }
    .tab {
        flex: 1;
        background: transparent;
        border: none;
        color: rgba(255, 255, 255, 0.55);
        padding: 8px 6px;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: color 0.15s ease, border-color 0.15s ease;
        font-weight: 500;
        white-space: nowrap;
    }
    .tab:hover {
        color: rgba(255, 255, 255, 0.85);
    }
    .tab--active {
        color: #e9c46a;
        border-bottom-color: #e9c46a;
    }
</style>
