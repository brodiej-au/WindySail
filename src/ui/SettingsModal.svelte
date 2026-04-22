{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container">
            <div class="modal-header">
                <h3 class="size-m">{t('settings.title')}<span hidden>{$locale}</span></h3>
                <button class="close-btn" on:click={close}>&#10005;</button>
            </div>

            <div class="modal-body">
                    <!-- Wind Models -->
                    <div class="section mb-10">
                        <span class="size-xs label">
                            {t('settings.windModels')}
                            <InfoTooltip text={t('settings.infoWindModels')} />
                        </span>
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

                    <!-- Voyage: basic cruising parameters -->
                    <div class="section mb-10">
                        <span class="size-xs label">{t('settings.sectionVoyage')}</span>
                        <div class="param-grid">
                            <label class="size-xs param-label" for="sm-maxDuration">
                                {t('settings.maxDuration')}
                                <InfoTooltip text={t('settings.infoMaxDuration')} />
                            </label>
                            <input id="sm-maxDuration" type="number" class="input size-s" min="24" max="336" step="24" value={maxDuration} on:change={(e) => handleNumberChange('maxDuration', e)} />

                            <label class="size-xs param-label" for="sm-arrivalRadius">
                                {t('settings.arrivalRadius')}
                                <InfoTooltip text={t('settings.infoArrivalRadius')} />
                            </label>
                            <input id="sm-arrivalRadius" type="number" class="input size-s" min="0.1" max="5" step="0.1" value={arrivalRadius} on:change={(e) => handleNumberChange('arrivalRadius', e)} />
                        </div>
                    </div>

                    <!-- Motor: all motor-related controls grouped -->
                    <div class="section mb-10">
                        <span class="size-xs label">{t('settings.sectionMotor')}</span>
                        <label class="model-row size-s">
                            <input type="checkbox" checked={motorEnabled} on:change={toggleMotor} />
                            <span>{t('settings.motorEnabled')}</span>
                            <InfoTooltip text={t('settings.infoMotorEnabled')} />
                        </label>
                        {#if motorEnabled}
                            <div class="param-grid" style="margin-top: 6px;">
                                <label class="size-xs param-label" for="sm-motorThreshold">
                                    {t('settings.thresholdShort')}
                                    <InfoTooltip text={t('settings.infoMotorThreshold')} />
                                </label>
                                <input id="sm-motorThreshold" type="number" class="input size-s" min="0.5" max="8" step="0.5" value={motorThreshold} on:change={(e) => handleNumberChange('motorThreshold', e)} />
                                <label class="size-xs param-label" for="sm-motorSpeed">
                                    {t('settings.motorSpeed')}
                                    <InfoTooltip text={t('settings.infoMotorSpeed')} />
                                </label>
                                <input id="sm-motorSpeed" type="number" class="input size-s" min="1" max="10" step="0.5" value={motorSpeed} on:change={(e) => handleNumberChange('motorSpeed', e)} />

                                <label class="size-xs param-label" for="sm-motorAbove">
                                    {t('settings.motorAboveTws')}
                                    <InfoTooltip text={t('settings.infoMotorAboveTws')} />
                                </label>
                                <input id="sm-motorAbove" type="number" class="input size-s" min="0" max="80" step="1"
                                    value={advanced.motorAboveTws ?? ''} on:change={(e) => handleAdvancedNumberChange('motorAboveTws', e, true)} placeholder="off" />
                                <label class="size-xs param-label" for="sm-motorBelow">
                                    {t('settings.motorBelowTws')}
                                    <InfoTooltip text={t('settings.infoMotorBelowTws')} />
                                </label>
                                <input id="sm-motorBelow" type="number" class="input size-s" min="0" max="20" step="1"
                                    value={advanced.motorBelowTws ?? ''} on:change={(e) => handleAdvancedNumberChange('motorBelowTws', e, true)} placeholder="off" />
                            </div>
                        {/if}
                    </div>

                    <!-- Feel: comfort + display -->
                    <div class="section mb-10">
                        <span class="size-xs label">
                            {t('settings.sectionFeel')}
                            <InfoTooltip text={t('settings.infoComfortWeight')} />
                        </span>
                        <div class="slider-row">
                            <span class="size-xs slider-label">{t('settings.sliderSpeed')}</span>
                            <input type="range" class="comfort-slider" min="0" max="1" step="0.1" value={comfortWeight} on:input={(e) => handleComfortChange(e)} />
                            <span class="size-xs slider-label">{t('settings.sliderComfort')}</span>
                        </div>
                        <label class="model-row size-s" style="margin-top: 6px;">
                            <input type="checkbox" checked={showIsochrones} on:change={toggleIsochrones} />
                            <span>{t('settings.showIsochronesShort')}</span>
                            <InfoTooltip text={t('settings.infoShowIsochrones')} />
                        </label>
                    </div>

                    <!-- Advanced: algorithmic tuning + sail trim penalties -->
                    <div class="section mb-10 advanced-section">
                        <button class="advanced-header" on:click={() => advancedOpen = !advancedOpen}>
                            <span class="size-xs label">{t('settings.advanced')}</span>
                            <span class="chev">{advancedOpen ? '▾' : '▸'}</span>
                        </button>
                        {#if !advancedOpen}
                            <div class="size-xs advanced-summary">{t('settings.advancedSummary')}</div>
                        {/if}
                        {#if advancedOpen}
                            <div class="param-grid">
                                <label class="size-xs param-label" for="adv-timeStep">
                                    {t('settings.timeStep')}
                                    <InfoTooltip text={t('settings.infoTimeStep')} />
                                </label>
                                <input id="adv-timeStep" type="number" class="input size-s" min="0.5" max="3" step="0.5" value={timeStep} on:change={(e) => handleNumberChange('timeStep', e)} />

                                <label class="size-xs param-label" for="adv-headingStep">
                                    {t('settings.headingStep')}
                                    <InfoTooltip text={t('settings.infoHeadingStep')} />
                                </label>
                                <input id="adv-headingStep" type="number" class="input size-s" min="3" max="15" step="1" value={headingStep} on:change={(e) => handleNumberChange('headingStep', e)} />

                                <label class="size-xs param-label" for="adv-numSectors">
                                    {t('settings.sectors')}
                                    <InfoTooltip text={t('settings.infoSectors')} />
                                </label>
                                <input id="adv-numSectors" type="number" class="input size-s" min="36" max="144" step="12" value={numSectors} on:change={(e) => handleNumberChange('numSectors', e)} />

                                <label class="size-xs param-label" for="adv-landMarginNm">
                                    {t('settings.landMargin')}
                                    <InfoTooltip text={t('settings.infoLandMargin')} />
                                </label>
                                <input id="adv-landMarginNm" type="number" class="input size-s" min="0" max="5" step="0.5" value={landMarginNm} on:change={(e) => handleNumberChange('landMarginNm', e)} />

                                <label class="size-xs param-label" for="adv-preferredLandMarginNm">
                                    {t('settings.preferredLandMargin')}
                                    <InfoTooltip text={t('settings.infoPreferredLandMargin')} />
                                </label>
                                <input id="adv-preferredLandMarginNm" type="number" class="input size-s" min="0" max="20" step="1" value={preferredLandMarginNm} on:change={(e) => handleNumberChange('preferredLandMarginNm', e)} />

                                <label class="size-xs param-label" for="adv-estimatedVmgKt">
                                    {t('settings.estimatedVmg')}
                                    <InfoTooltip text={t('settings.infoEstimatedVmg')} />
                                </label>
                                <input id="adv-estimatedVmgKt" type="number" class="input size-s" min="1" max="10" step="0.5" value={estimatedVmgKt} on:change={(e) => handleNumberChange('estimatedVmgKt', e)} />

                                <label class="size-xs param-label" for="adv-tack">
                                    {t('settings.tackPenaltyS')}
                                    <InfoTooltip text={t('settings.infoTackPenalty')} />
                                </label>
                                <input id="adv-tack" type="number" class="input size-s" min="0" max="300" step="1"
                                    value={advanced.tackPenaltyS} on:change={(e) => handleAdvancedNumberChange('tackPenaltyS', e, false)} />

                                <label class="size-xs param-label" for="adv-gybe">
                                    {t('settings.gybePenaltyS')}
                                    <InfoTooltip text={t('settings.infoGybePenalty')} />
                                </label>
                                <input id="adv-gybe" type="number" class="input size-s" min="0" max="300" step="1"
                                    value={advanced.gybePenaltyS} on:change={(e) => handleAdvancedNumberChange('gybePenaltyS', e, false)} />

                                <label class="size-xs param-label" for="adv-night">
                                    {t('settings.nightSpeedFactor')}
                                    <InfoTooltip text={t('settings.infoNightFactor')} />
                                </label>
                                <div class="slider-cell">
                                    <input id="adv-night" type="range" min="0.5" max="1" step="0.05"
                                        value={advanced.nightSpeedFactor} on:change={(e) => handleAdvancedNumberChange('nightSpeedFactor', e, false)} />
                                    <span class="size-xs slider-pct">{(advanced.nightSpeedFactor * 100).toFixed(0)}%</span>
                                </div>

                                <label class="size-xs param-label" for="adv-reef-tws">
                                    {t('settings.reefAboveTws')}
                                    <InfoTooltip text={t('settings.infoReefAboveTws')} />
                                </label>
                                <input id="adv-reef-tws" type="number" class="input size-s" min="0" max="80" step="1"
                                    value={advanced.reefAboveTws ?? ''} on:change={(e) => handleAdvancedNumberChange('reefAboveTws', e, true)} placeholder="off" />

                                <label class="size-xs param-label" for="adv-reef-factor">
                                    {t('settings.reefFactor')}
                                    <InfoTooltip text={t('settings.infoReefFactor')} />
                                </label>
                                <div class="slider-cell">
                                    <input id="adv-reef-factor" type="range" min="0.5" max="1" step="0.05"
                                        value={advanced.reefFactor} on:change={(e) => handleAdvancedNumberChange('reefFactor', e, false)} />
                                    <span class="size-xs slider-pct">{(advanced.reefFactor * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        {/if}
                    </div>

                    <!-- Privacy -->
                    <div class="section mb-10">
                        <span class="size-xs label">{t('settings.sectionPrivacy')}</span>
                        <label class="model-row size-s">
                            <input type="checkbox" checked={analyticsEnabled} on:change={toggleAnalytics} />
                            <span>{t('settings.analyticsEnabled')}</span>
                            <InfoTooltip text={t('settings.infoAnalyticsEnabled')} />
                        </label>
                    </div>
            </div>
        </div>
    </div>
{/if}

<script lang="ts">
    import { onDestroy } from 'svelte';
    import { t, locale } from '../i18n';
    import { settingsStore } from '../stores/SettingsStore';
    import InfoTooltip from './InfoTooltip.svelte';
    import { MODEL_COLORS, MODEL_LABELS } from '../map/modelColors';
    import { applyAnalyticsOptOut } from '../analytics';
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
    let analyticsEnabled: boolean = settingsStore.get('analyticsEnabled');
    let advanced: import('../routing/types').AdvancedSettings = settingsStore.get('advanced');
    let advancedOpen = false;

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

    function toggleAnalytics(): void {
        analyticsEnabled = !analyticsEnabled;
        settingsStore.set('analyticsEnabled', analyticsEnabled);
        if (!analyticsEnabled) {
            applyAnalyticsOptOut();
        }
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

    function handleAdvancedNumberChange(
        key: keyof import('../routing/types').AdvancedSettings,
        e: Event,
        nullable: boolean,
    ): void {
        const raw = (e.target as HTMLInputElement).value.trim();
        let value: number | null;
        if (nullable && raw === '') {
            value = null;
        } else {
            const parsed = parseFloat(raw);
            if (isNaN(parsed)) return;
            value = parsed;
        }
        const next = { ...advanced, [key]: value } as import('../routing/types').AdvancedSettings;
        advanced = next;
        settingsStore.set('advanced', next);
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
        analyticsEnabled = settings.analyticsEnabled;
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

    .advanced-section {
        border-top: 1px solid #2a3547;
        padding-top: 10px;
    }
    .advanced-header {
        background: transparent;
        border: none;
        color: #e6eef8;
        cursor: pointer;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 0;
    }
    .advanced-summary {
        color: #8a9ab0;
        font-style: italic;
        margin-top: 4px;
    }
    .slider-cell {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
    }
    .slider-cell input[type="range"] {
        flex: 1;
        min-width: 0;
    }
    .slider-pct {
        flex: none;
        min-width: 40px;
        text-align: right;
        color: #8a9ab0;
    }
    .info-icon {
        display: inline-block;
        margin-left: 4px;
        color: #6b7a90;
        cursor: help;
        font-size: 11px;
        user-select: none;
    }
    .info-icon:hover {
        color: #e6eef8;
    }
</style>
