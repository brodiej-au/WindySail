<!-- "View Polar" button + modal overlay showing the read-only polar diagram -->
<button class="button size-s" on:click={openModal}>View Polar</button>

{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="size-m">{polar.name}</h3>
                <button class="close-btn" on:click={closeModal}>✕</button>
            </div>
            <div class="modal-body">
                <PolarDiagram {polar} width={500} />
            </div>
        </div>
    </div>
{/if}

<script lang="ts">
    import type { PolarData } from '../routing/types';
    import PolarDiagram from './PolarDiagram.svelte';

    export let polar: PolarData;

    let showModal = false;

    function openModal(): void {
        showModal = true;
    }

    function closeModal(): void {
        showModal = false;
    }

    function handleBackdropClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
            closeModal();
        }
    }
</script>

<style lang="less">
    .button {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 5px 10px;
        font-size: 13px;
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
        width: 92vw;
        max-width: 550px;
        max-height: 92vh;
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

    .modal-body {
        padding: 16px;
        overflow-y: auto;
    }
</style>
