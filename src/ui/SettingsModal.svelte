{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="size-m">Settings</h3>
                <button class="close-btn" on:click={close}>&#10005;</button>
            </div>

            <div class="modal-body">
                    <!-- Wind Models -->
                    <div class="section mb-10">
                        <span class="size-xs label">Wind Models:</span>
                        <div class="model-list">
                            {#each ALL_MODELS as model}
                                <label class="model-row size-s">
                                    <input type="checkbox" checked={selectedModels.includes(model)} on:change={() => toggleModel(model)} />
                                    <span class="model-dot" style:background={MODEL_COLORS[model]}></span>
                                    <span>{MODEL_LABELS[model]}</span>
                                </label>
                            {/each}
                        </div>
                    </div>

                    <!-- Routing Parameters -->
                    <div class="section mb-10">
                        <span class="size-xs label">Routing Parameters:</span>
                        <div class="param-grid">
                            <label class="size-xs param-label" for="sm-timeStep">Time Step (h)</label>
                            <input id="sm-timeStep" type="number" class="input size-s" min="0.5" max="3" step="0.5" value={timeStep} on:change={(e) => handleNumberChange('timeStep', e)} />

                            <label class="size-xs param-label" for="sm-maxDuration">Max Duration (h)</label>
                            <input id="sm-maxDuration" type="number" class="input size-s" min="24" max="336" step="24" value={maxDuration} on:change={(e) => handleNumberChange('maxDuration', e)} />

                            <label class="size-xs param-label" for="sm-headingStep">Heading Step (&deg;)</label>
                            <input id="sm-headingStep" type="number" class="input size-s" min="3" max="15" step="1" value={headingStep} on:change={(e) => handleNumberChange('headingStep', e)} />

                            <label class="size-xs param-label" for="sm-numSectors">Sectors</label>
                            <input id="sm-numSectors" type="number" class="input size-s" min="36" max="144" step="12" value={numSectors} on:change={(e) => handleNumberChange('numSectors', e)} />

                            <label class="size-xs param-label" for="sm-arrivalRadius">Arrival Radius (nm)</label>
                            <input id="sm-arrivalRadius" type="number" class="input size-s" min="0.1" max="5" step="0.1" value={arrivalRadius} on:change={(e) => handleNumberChange('arrivalRadius', e)} />

                            <label class="size-xs param-label" for="sm-landMarginNm">Min Land Margin (nm)</label>
                            <input id="sm-landMarginNm" type="number" class="input size-s" min="0" max="5" step="0.5" value={landMarginNm} on:change={(e) => handleNumberChange('landMarginNm', e)} />

                            <label class="size-xs param-label" for="sm-preferredLandMarginNm">Preferred Margin (nm)</label>
                            <input id="sm-preferredLandMarginNm" type="number" class="input size-s" min="0" max="20" step="1" value={preferredLandMarginNm} on:change={(e) => handleNumberChange('preferredLandMarginNm', e)} />

                            <label class="size-xs param-label" for="sm-estimatedVmgKt">Est. VMG (kt)</label>
                            <input id="sm-estimatedVmgKt" type="number" class="input size-s" min="1" max="10" step="0.5" value={estimatedVmgKt} on:change={(e) => handleNumberChange('estimatedVmgKt', e)} />
                        </div>
                    </div>

                    <!-- Motor Settings -->
                    <div class="section mb-10">
                        <label class="model-row size-s">
                            <input type="checkbox" checked={motorEnabled} on:change={toggleMotor} />
                            <span>Motor when wind speed &lt; threshold</span>
                        </label>
                        {#if motorEnabled}
                            <div class="param-grid" style="margin-top: 6px;">
                                <label class="size-xs param-label" for="sm-motorThreshold">Threshold (kt)</label>
                                <input id="sm-motorThreshold" type="number" class="input size-s" min="0.5" max="8" step="0.5" value={motorThreshold} on:change={(e) => handleNumberChange('motorThreshold', e)} />
                                <label class="size-xs param-label" for="sm-motorSpeed">Motor Speed (kt)</label>
                                <input id="sm-motorSpeed" type="number" class="input size-s" min="1" max="10" step="0.5" value={motorSpeed} on:change={(e) => handleNumberChange('motorSpeed', e)} />
                            </div>
                        {/if}
                    </div>

                    <!-- Comfort vs Speed -->
                    <div class="section mb-10">
                        <span class="size-xs label">Optimize for:</span>
                        <div class="slider-row">
                            <span class="size-xs slider-label">Speed</span>
                            <input type="range" class="comfort-slider" min="0" max="1" step="0.1" value={comfortWeight} on:input={(e) => handleComfortChange(e)} />
                            <span class="size-xs slider-label">Comfort</span>
                        </div>
                    </div>

                    <!-- Isochrone visualization -->
                    <div class="section">
                        <label class="model-row size-s">
                            <input type="checkbox" checked={showIsochrones} on:change={toggleIsochrones} />
                            <span>Show isochrone expansion</span>
                        </label>
                    </div>
            </div>
        </div>
    </div>
{/if}

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { settingsStore } from '../stores/SettingsStore';
    import { MODEL_COLORS, MODEL_LABELS } from '../map/modelColors';
    import type { WindModelId, UserSettings } from '../routing/types';

    const ALL_MODELS: WindModelId[] = ['gfs', 'ecmwf', 'icon', 'bomAccess'];

    let showModal = false;

    // Local reactive state — initialised from store
    let selectedModels: WindModelId[] = settingsStore.get('selectedModels');
    let timeStep: number = settingsStore.get('timeStep');
    let maxDuration: number = settingsStore.get('maxDuration');
    let headingStep: number = settingsStore.get('headingStep');
    let numSectors: number = settingsStore.get('numSectors');
    let arrivalRadius: number = settingsStore.get('arrivalRadius');
    let landMarginNm: number = settingsStore.get('landMarginNm');
    let preferredLandMarginNm: number = settingsStore.get('preferredLandMarginNm');
    let estimatedVmgKt: number = settingsStore.get('estimatedVmgKt');
    let motorEnabled: boolean = settingsStore.get('motorEnabled');
    let motorThreshold: number = settingsStore.get('motorThreshold');
    let motorSpeed: number = settingsStore.get('motorSpeed');
    let comfortWeight: number = settingsStore.get('comfortWeight');
    let showIsochrones: boolean = settingsStore.get('showIsochrones');

    export function open(): void {
        showModal = true;
    }

    function close(): void {
        showModal = false;
    }

    function handleBackdropClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
            close();
        }
    }

    function toggleModel(model: WindModelId): void {
        const next = selectedModels.includes(model)
            ? selectedModels.filter(m => m !== model)
            : [...selectedModels, model];
        if (next.length === 0) return;
        selectedModels = next;
        settingsStore.set('selectedModels', next);
    }

    function toggleMotor(): void {
        motorEnabled = !motorEnabled;
        settingsStore.set('motorEnabled', motorEnabled);
    }

    function toggleIsochrones(): void {
        showIsochrones = !showIsochrones;
        settingsStore.set('showIsochrones', showIsochrones);
    }

    function handleNumberChange(
        key: keyof Pick<UserSettings, 'timeStep' | 'maxDuration' | 'headingStep' | 'numSectors' | 'arrivalRadius' | 'landMarginNm' | 'preferredLandMarginNm' | 'estimatedVmgKt' | 'motorThreshold' | 'motorSpeed'>,
        e: Event,
    ): void {
        const raw = (e.target as HTMLInputElement).value;
        const value = parseFloat(raw);
        if (!isNaN(value)) {
            settingsStore.set(key, value);
            switch (key) {
                case 'timeStep': timeStep = value; break;
                case 'maxDuration': maxDuration = value; break;
                case 'headingStep': headingStep = value; break;
                case 'numSectors': numSectors = value; break;
                case 'arrivalRadius': arrivalRadius = value; break;
                case 'landMarginNm': landMarginNm = value; break;
                case 'preferredLandMarginNm': preferredLandMarginNm = value; break;
                case 'estimatedVmgKt': estimatedVmgKt = value; break;
                case 'motorThreshold': motorThreshold = value; break;
                case 'motorSpeed': motorSpeed = value; break;
            }
        }
    }

    function handleComfortChange(e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            comfortWeight = val;
            settingsStore.set('comfortWeight', val);
        }
    }

    function onSettingsChange(settings: UserSettings): void {
        selectedModels = settings.selectedModels;
        timeStep = settings.timeStep;
        maxDuration = settings.maxDuration;
        headingStep = settings.headingStep;
        numSectors = settings.numSectors;
        arrivalRadius = settings.arrivalRadius;
        landMarginNm = settings.landMarginNm;
        preferredLandMarginNm = settings.preferredLandMarginNm;
        estimatedVmgKt = settings.estimatedVmgKt;
        motorEnabled = settings.motorEnabled;
        motorThreshold = settings.motorThreshold;
        motorSpeed = settings.motorSpeed;
        comfortWeight = settings.comfortWeight;
        showIsochrones = settings.showIsochrones;
    }

    settingsStore.subscribe(onSettingsChange);
    onDestroy(() => { settingsStore.unsubscribe(onSettingsChange); });
</script>

<style lang="less">
    .modal-backdrop {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
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
        max-width: 520px;
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

        h3 { margin: 0; opacity: 0.9; }
    }

    .close-btn {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 18px;
        cursor: pointer;
        padding: 4px 8px;
        line-height: 1;
        &:hover { color: rgba(255, 255, 255, 0.9); }
    }

    .modal-body {
        padding: 14px 16px;
        overflow-y: auto;
        min-height: 0;
        flex: 1;
    }

    .section { padding: 0; }

    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 4px;
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
        &:focus { outline: none; border-color: rgba(255, 255, 255, 0.35); }
    }

    select.input { cursor: pointer; }

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
        &:hover { opacity: 1; }
        input[type='checkbox'] { margin: 0; cursor: pointer; }
    }

    .model-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
    }

    .slider-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .slider-label {
        opacity: 0.6;
        white-space: nowrap;
    }

    .comfort-slider {
        flex: 1;
        accent-color: #457b9d;
        cursor: pointer;
    }

    .btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 5px 10px;
        font-size: 13px;
        cursor: pointer;
        opacity: 0.9;
        transition: all 0.2s ease;
        &:hover { background: rgba(255, 255, 255, 0.12); opacity: 1; }
        &:active { transform: scale(0.98); }
    }

    @media (max-width: 600px) {
        .modal-container {
            width: 100vw;
            max-width: none;
            border-radius: 0;
        }
        .close-btn {
            padding: 8px 12px;
            font-size: 22px;
        }
        .param-grid {
            grid-template-columns: 1fr;
        }
        .input {
            padding: 8px 10px;
        }
    }
</style>
