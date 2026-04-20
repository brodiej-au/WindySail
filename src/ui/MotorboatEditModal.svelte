<script lang="ts">
    import { t, locale } from '../i18n';
    import { settingsStore } from '../stores/SettingsStore';

    let showModal = false;
    let cruiseKt: number = settingsStore.get('motorboatCruiseKt');
    let heavyKt: number = settingsStore.get('motorboatHeavyKt');
    let swellThresholdM: number = settingsStore.get('motorboatSwellThresholdM');

    export function open(): void {
        // Re-sync from store every open so stale local values don't overwrite.
        cruiseKt = settingsStore.get('motorboatCruiseKt');
        heavyKt = settingsStore.get('motorboatHeavyKt');
        swellThresholdM = settingsStore.get('motorboatSwellThresholdM');
        showModal = true;
    }

    function close(): void {
        showModal = false;
    }

    function handleBackdropClick(e: MouseEvent): void {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) close();
    }

    function handleSave(): void {
        settingsStore.set('motorboatCruiseKt', cruiseKt);
        settingsStore.set('motorboatHeavyKt', heavyKt);
        settingsStore.set('motorboatSwellThresholdM', swellThresholdM);
        close();
    }
</script>

{#if showModal}
    <div class="modal-backdrop" on:click={handleBackdropClick}>
        <div class="modal-container">
            <span hidden>{$locale}</span>
            <div class="modal-header">
                <h3 class="size-m">{t('boat.motorboatTitle')}</h3>
                <button class="close-btn" on:click={close}>✕</button>
            </div>

            <div class="modal-body">
                <p class="size-xs hint">{t('boat.motorboatHint')}</p>
                <div class="param-grid">
                    <label class="size-xs param-label" for="mb-cruise">{t('settings.mbCruise')}</label>
                    <input id="mb-cruise" type="number" class="input size-s" min="1" max="50" step="0.5"
                        bind:value={cruiseKt} />
                    <label class="size-xs param-label" for="mb-heavy">{t('settings.mbHeavy')}</label>
                    <input id="mb-heavy" type="number" class="input size-s" min="1" max="50" step="0.5"
                        bind:value={heavyKt} />
                    <label class="size-xs param-label" for="mb-swell">{t('settings.mbSwell')}</label>
                    <input id="mb-swell" type="number" class="input size-s" min="0.5" max="10" step="0.5"
                        bind:value={swellThresholdM} />
                </div>
            </div>

            <div class="modal-footer">
                <button class="button button--variant-orange size-m" on:click={handleSave}>{t('boat.saveButton')}</button>
                <button class="button size-m" on:click={close}>{t('boat.cancelButton')}</button>
            </div>
        </div>
    </div>
{/if}

<style lang="less">
    .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1100;
    }
    .modal-container {
        background: #1b2433;
        color: #e6eef8;
        border: 1px solid #2a3547;
        border-radius: 14px;
        width: min(360px, 94vw);
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid #2a3547;
    }
    .close-btn {
        background: transparent;
        border: none;
        color: #8a9ab0;
        cursor: pointer;
        font-size: 16px;
    }
    .close-btn:hover {
        color: #e6eef8;
    }
    .modal-body {
        padding: 14px 16px;
        overflow-y: auto;
    }
    .hint {
        color: #8a9ab0;
        margin: 0 0 12px 0;
        line-height: 1.45;
    }
    .param-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px 10px;
        align-items: center;
    }
    .param-label {
        opacity: 0.75;
    }
    .input {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 6px 8px;
        font-size: 14px;
        width: 100%;
    }
    .modal-footer {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #2a3547;
    }
    .modal-footer .button {
        flex: 1;
    }
</style>
