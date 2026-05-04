<!-- Unified polar view/edit modal: opens in view mode, toggles to edit -->
{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container" class:editing={isEditing}>
            <span hidden>{$locale}</span>
            <div class="modal-header">
                <h3 class="size-m">{isEditing ? t('boat.editPrefix', { name: editName }) : polar.name}</h3>
                <div class="header-actions">
                    {#if !isEditing}
                        {#if isCustom}
                            <button class="action-btn size-xs" on:click={startEditing}>{t('boat.edit')}</button>
                        {:else}
                            <button class="action-btn size-xs" on:click={duplicateAndEdit}>{t('boat.duplicateAndEdit')}</button>
                        {/if}
                    {/if}
                    <button class="close-btn" on:click={handleClose}>✕</button>
                </div>
            </div>

            {#if isEditing}
                <!-- Edit mode -->
                <div class="name-row">
                    <label class="size-xs label" for="editPolarName">{t('boat.nameLabel')}</label>
                    <input
                        id="editPolarName"
                        type="text"
                        class="input size-s"
                        placeholder={t('boat.namePlaceholder')}
                        bind:value={editName}
                    />
                </div>

                <div class="modal-body">
                    <PolarGraphEditor
                        polar={editingPolar}
                        onSave={handleEditorSave}
                        onCancel={cancelEditing}
                    />
                </div>
            {:else}
                <!-- View mode -->
                <div class="modal-body view-body">
                    <PolarDiagram {polar} width={500} />
                </div>
            {/if}
        </div>
    </div>
{/if}

<button class="button size-s" on:click={openModal}>{t('boat.polarDiagram')}</button>

<script lang="ts">
    import { t, locale } from '../i18n';
    import type { PolarData } from '../routing/types';
    import PolarDiagram from './PolarDiagram.svelte';
    import PolarGraphEditor from './PolarGraphEditor.svelte';
    import { getCustomPolars } from '../data/polarRegistry';

    export let polar: PolarData;
    export let isCustom: boolean = false;
    export let onSave: () => void = () => {};
    export let onCancel: () => void = () => {};

    let showModal = false;
    let isEditing = false;
    let editingPolar: PolarData | null = null;
    let editName = '';

    function openModal(): void {
        showModal = true;
        isEditing = false;
    }

    function handleClose(): void {
        if (isEditing) {
            cancelEditing();
        } else {
            showModal = false;
        }
    }

    function startEditing(): void {
        editingPolar = polar;
        editName = polar.name;
        isEditing = true;
    }

    function duplicateAndEdit(): void {
        editingPolar = {
            ...polar,
            name: `${polar.name} (copy)`,
            twaAngles: [...polar.twaAngles],
            twsSpeeds: [...polar.twsSpeeds],
            speeds: polar.speeds.map(row => [...row]),
        };
        editName = editingPolar.name;
        isEditing = true;
    }

    function cancelEditing(): void {
        isEditing = false;
        editingPolar = null;
    }

    function handleEditorSave(): void {
        isEditing = false;
        editingPolar = null;
        showModal = false;
        onSave();
    }

    function handleBackdropClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
            handleClose();
        }
    }

    export function openInEditMode(p: PolarData): void {
        editingPolar = p;
        editName = p.name;
        isEditing = true;
        showModal = true;
    }

    export function openInViewMode(): void {
        showModal = true;
        isEditing = false;
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
        max-width: 600px;
        max-height: 92vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        overflow: hidden;

        &.editing {
            max-width: 960px;
        }
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

    .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .action-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 4px 10px;
        cursor: pointer;
        opacity: 0.85;

        &:hover {
            background: rgba(255, 255, 255, 0.15);
            opacity: 1;
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

    .name-row {
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;

        .label {
            opacity: 0.6;
            white-space: nowrap;
        }
    }

    .input {
        flex: 1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 5px 7px;
        font-size: 13px;
        box-sizing: border-box;

        &:focus {
            outline: none;
            border-color: rgba(255, 255, 255, 0.35);
        }
    }

    .modal-body {
        overflow-y: auto;
        min-height: 0;
    }

    .view-body {
        padding: 16px;
        background: #1a1a2e;
        color: #e0e0e0;
    }

    @media (max-width: 720px) {
        .modal-container {
            width: 100vw;
            max-width: none;
            max-height: 100vh;
            border-radius: 0;
        }
        .close-btn {
            padding: 10px 14px;
            font-size: 22px;
        }
        .action-btn {
            padding: 8px 14px;
        }
    }
</style>
