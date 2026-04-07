<div class="settings-panel">
    <!-- Collapsible header -->
    <button class="toggle-header size-s" on:click={toggleOpen}>
        <span>Settings</span>
        <span class="chevron">{isOpen ? '▾' : '▸'}</span>
    </button>

    {#if isOpen}
        {#if showEditor}
            <div class="settings-body">
                <PolarEditor polar={editingPolar} onSave={handleEditorSave} onCancel={handleEditorCancel} />
            </div>
        {:else}
            <div class="settings-body">
                <!-- Wind Models -->
                <div class="section mb-10">
                    <span class="size-xs label">Wind Models:</span>
                    <div class="model-list">
                        {#each ALL_MODELS as model}
                            <label class="model-row size-s">
                                <input
                                    type="checkbox"
                                    checked={selectedModels.includes(model)}
                                    on:change={() => toggleModel(model)}
                                />
                                <span
                                    class="model-dot"
                                    style:background={MODEL_COLORS[model]}
                                ></span>
                                <span>{MODEL_LABELS[model]}</span>
                            </label>
                        {/each}
                    </div>
                </div>

                <!-- Routing Parameters -->
                <div class="section mb-10">
                    <span class="size-xs label">Routing Parameters:</span>

                    <div class="param-grid">
                        <label class="size-xs param-label" for="timeStep">Time Step (h)</label>
                        <input
                            id="timeStep"
                            type="number"
                            class="input size-s"
                            min="0.5"
                            max="3"
                            step="0.5"
                            value={timeStep}
                            on:change={(e) => handleNumberChange('timeStep', e)}
                        />

                        <label class="size-xs param-label" for="maxDuration">Max Duration (h)</label>
                        <input
                            id="maxDuration"
                            type="number"
                            class="input size-s"
                            min="24"
                            max="336"
                            step="24"
                            value={maxDuration}
                            on:change={(e) => handleNumberChange('maxDuration', e)}
                        />

                        <label class="size-xs param-label" for="headingStep">Heading Step (°)</label>
                        <input
                            id="headingStep"
                            type="number"
                            class="input size-s"
                            min="3"
                            max="15"
                            step="1"
                            value={headingStep}
                            on:change={(e) => handleNumberChange('headingStep', e)}
                        />

                        <label class="size-xs param-label" for="numSectors">Sectors</label>
                        <input
                            id="numSectors"
                            type="number"
                            class="input size-s"
                            min="36"
                            max="144"
                            step="12"
                            value={numSectors}
                            on:change={(e) => handleNumberChange('numSectors', e)}
                        />

                        <label class="size-xs param-label" for="arrivalRadius">Arrival Radius (nm)</label>
                        <input
                            id="arrivalRadius"
                            type="number"
                            class="input size-s"
                            min="0.1"
                            max="5"
                            step="0.1"
                            value={arrivalRadius}
                            on:change={(e) => handleNumberChange('arrivalRadius', e)}
                        />

                        <label class="size-xs param-label" for="landMarginNm">Land Margin (nm)</label>
                        <input
                            id="landMarginNm"
                            type="number"
                            class="input size-s"
                            min="0"
                            max="5"
                            step="0.5"
                            value={landMarginNm}
                            on:change={(e) => handleNumberChange('landMarginNm', e)}
                        />
                    </div>
                </div>

                <!-- Polar Selector -->
                <div class="section">
                    <label class="size-xs label" for="polarSelect">Polar:</label>
                    <div class="polar-controls">
                        <select
                            id="polarSelect"
                            class="input size-s"
                            value={selectedPolarName}
                            on:change={handlePolarChange}
                        >
                            {#each allPolars as polar}
                                <option value={polar.name}>{polar.name}</option>
                            {/each}
                        </select>
                        <div class="polar-buttons">
                            <button class="button size-s" on:click={handleNewPolar}>New</button>
                            {#if isCurrentPolarCustom()}
                                <button class="button size-s" on:click={handleEditPolar}>Edit</button>
                                <button class="button size-s" on:click={handleDeletePolar}>Delete</button>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</div>

<script lang="ts">
    import { onDestroy } from 'svelte';

    import { settingsStore } from '../stores/SettingsStore';
    import { MODEL_COLORS, MODEL_LABELS } from '../map/modelColors';
    import { getAllPolars, getCustomPolars, deleteCustomPolar } from '../data/polarRegistry';
    import PolarEditor from './PolarEditor.svelte';
    import type { WindModelId, UserSettings, PolarData } from '../routing/types';

    const ALL_MODELS: WindModelId[] = ['gfs', 'ecmwf', 'icon', 'bomAccess'];

    let isOpen = false;

    // Editor state
    let showEditor = false;
    let editingPolar: PolarData | null = null;

    // Local reactive state — initialised from store
    let selectedModels: WindModelId[] = settingsStore.get('selectedModels');
    let timeStep: number = settingsStore.get('timeStep');
    let maxDuration: number = settingsStore.get('maxDuration');
    let headingStep: number = settingsStore.get('headingStep');
    let numSectors: number = settingsStore.get('numSectors');
    let arrivalRadius: number = settingsStore.get('arrivalRadius');
    let landMarginNm: number = settingsStore.get('landMarginNm');
    let selectedPolarName: string = settingsStore.get('selectedPolarName');

    let allPolars = getAllPolars();

    function toggleOpen(): void {
        isOpen = !isOpen;
    }

    function toggleModel(model: WindModelId): void {
        const next = selectedModels.includes(model)
            ? selectedModels.filter((m) => m !== model)
            : [...selectedModels, model];
        // Prevent deselecting all models
        if (next.length === 0) return;
        selectedModels = next;
        settingsStore.set('selectedModels', next);
    }

    function handleNumberChange(
        key: keyof Pick<
            UserSettings,
            'timeStep' | 'maxDuration' | 'headingStep' | 'numSectors' | 'arrivalRadius' | 'landMarginNm'
        >,
        e: Event,
    ): void {
        const raw = (e.target as HTMLInputElement).value;
        const value = parseFloat(raw);
        if (!isNaN(value)) {
            settingsStore.set(key, value);
            // Keep local state in sync
            switch (key) {
                case 'timeStep':
                    timeStep = value;
                    break;
                case 'maxDuration':
                    maxDuration = value;
                    break;
                case 'headingStep':
                    headingStep = value;
                    break;
                case 'numSectors':
                    numSectors = value;
                    break;
                case 'arrivalRadius':
                    arrivalRadius = value;
                    break;
                case 'landMarginNm':
                    landMarginNm = value;
                    break;
            }
        }
    }

    function handlePolarChange(e: Event): void {
        const value = (e.target as HTMLSelectElement).value;
        selectedPolarName = value;
        settingsStore.set('selectedPolarName', value);
    }

    function isCurrentPolarCustom(): boolean {
        const customPolars = getCustomPolars();
        return customPolars.some(p => p.name === selectedPolarName);
    }

    function handleNewPolar(): void {
        editingPolar = null;
        showEditor = true;
    }

    function handleEditPolar(): void {
        const polar = allPolars.find(p => p.name === selectedPolarName);
        if (polar) {
            editingPolar = polar;
            showEditor = true;
        }
    }

    function handleDeletePolar(): void {
        if (confirm(`Delete polar "${selectedPolarName}"?`)) {
            deleteCustomPolar(selectedPolarName);
            // Refresh polars list
            allPolars = getAllPolars();
            // Reset selection to first polar
            const firstPolar = allPolars[0];
            if (firstPolar) {
                selectedPolarName = firstPolar.name;
                settingsStore.set('selectedPolarName', firstPolar.name);
            }
        }
    }

    function handleEditorSave(): void {
        showEditor = false;
        const previousPolars = allPolars.map(p => p.name);
        allPolars = getAllPolars();
        // Auto-select newly created polar
        const newPolar = allPolars.find(p => !previousPolars.includes(p.name));
        if (newPolar) {
            selectedPolarName = newPolar.name;
            settingsStore.set('selectedPolarName', newPolar.name);
        }
    }

    function handleEditorCancel(): void {
        showEditor = false;
    }

    // Keep local state in sync when store changes externally
    function onSettingsChange(settings: UserSettings): void {
        selectedModels = settings.selectedModels;
        timeStep = settings.timeStep;
        maxDuration = settings.maxDuration;
        headingStep = settings.headingStep;
        numSectors = settings.numSectors;
        arrivalRadius = settings.arrivalRadius;
        landMarginNm = settings.landMarginNm;
        selectedPolarName = settings.selectedPolarName;
    }

    settingsStore.subscribe(onSettingsChange);

    onDestroy(() => {
        settingsStore.unsubscribe(onSettingsChange);
    });
</script>

<style lang="less">
    .settings-panel {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: 10px;
        padding-top: 8px;
    }

    .toggle-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 4px 0;
        opacity: 0.85;

        &:hover {
            opacity: 1;
        }
    }

    .chevron {
        font-size: 11px;
        opacity: 0.7;
    }

    .settings-body {
        padding-top: 10px;
    }

    .section {
        padding: 0;
    }

    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 4px;
    }

    .model-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
    }

    .model-row {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        opacity: 0.9;

        &:hover {
            opacity: 1;
        }

        input[type='checkbox'] {
            margin: 0;
            cursor: pointer;
        }
    }

    .model-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .param-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px 8px;
        align-items: center;
    }

    .param-label {
        opacity: 0.6;
        line-height: 1.3;
    }

    .input {
        width: 100%;
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

    select.input {
        width: 100%;
        cursor: pointer;
    }

    .polar-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .polar-buttons {
        display: flex;
        gap: 6px;
    }

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

    .button--variant-orange {
        background: rgba(255, 140, 0, 0.2);
        border-color: rgba(255, 140, 0, 0.4);

        &:hover {
            background: rgba(255, 140, 0, 0.3);
            border-color: rgba(255, 140, 0, 0.6);
        }
    }
</style>
