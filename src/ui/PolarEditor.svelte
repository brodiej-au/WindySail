<div class="polar-editor">
    <span hidden>{$locale}</span>
    <h3 class="size-m mb-10">{polar ? t('boat.editPolarTitle') : t('boat.newPolarTitle')}</h3>

    <!-- Name input -->
    <div class="section mb-10">
        <label class="size-xs label" for="polarName">{t('boat.nameLabel')}</label>
        <input
            id="polarName"
            type="text"
            class="input size-s name-input"
            placeholder={t('boat.namePlaceholder')}
            bind:value={name}
        />
    </div>

    <!-- Table -->
    <div class="table-wrapper mb-10">
        <table class="polar-table">
            <thead>
                <tr>
                    <th class="size-xs corner-cell">TWA \ TWS</th>
                    {#each twsSpeeds as tws, ci}
                        <th class="tws-cell">
                            <input
                                type="number"
                                class="cell-input"
                                min="0.1"
                                step="1"
                                value={tws}
                                on:change={e => updateTws(ci, e)}
                                aria-label={t('boat.twsColAria', { n: ci + 1 })}
                            />
                        </th>
                    {/each}
                    <th class="col-btns">
                        <button
                            class="icon-btn"
                            title={t('boat.addTwsColumn')}
                            on:click={addColumn}
                        >+</button>
                        <button
                            class="icon-btn"
                            title={t('boat.removeTwsColumn')}
                            disabled={twsSpeeds.length <= 2}
                            on:click={removeColumn}
                        >−</button>
                    </th>
                </tr>
            </thead>
            <tbody>
                {#each twaAngles as twa, ri}
                    <tr>
                        <td class="twa-cell">
                            <input
                                type="number"
                                class="cell-input"
                                min="0"
                                max="180"
                                step="1"
                                value={twa}
                                on:change={e => updateTwa(ri, e)}
                                aria-label={t('boat.twaRowAria', { n: ri + 1 })}
                            />
                        </td>
                        {#each speeds[ri] as spd, ci}
                            <td class="speed-cell">
                                <input
                                    type="number"
                                    class="cell-input"
                                    min="0"
                                    step="0.1"
                                    value={spd}
                                    on:change={e => updateSpeed(ri, ci, e)}
                                    aria-label={t('boat.speedCellAria', { r: ri + 1, c: ci + 1 })}
                                />
                            </td>
                        {/each}
                        <td></td>
                    </tr>
                {/each}
            </tbody>
        </table>
    </div>

    <!-- Row add/remove buttons -->
    <div class="row-btns mb-15">
        <button class="icon-btn" title={t('boat.addTwaRow')} on:click={addRow}>{t('boat.addRow')}</button>
        <button
            class="icon-btn"
            title={t('boat.removeTwaRow')}
            disabled={twaAngles.length <= 2}
            on:click={removeRow}
        >{t('boat.removeRow')}</button>
    </div>

    <!-- Validation error -->
    {#if errorMsg}
        <div class="error-msg size-s mb-10">{errorMsg}</div>
    {/if}

    <!-- Action buttons -->
    <div class="actions">
        <button class="button button--variant-orange size-m" on:click={handleSave}>{t('boat.saveButton')}</button>
        <button class="button size-m" on:click={onCancel}>{t('boat.cancelButton')}</button>
    </div>
</div>

<script lang="ts">
    import { t, locale } from '../i18n';
    import { saveCustomPolar } from '../data/polarRegistry';
    import type { PolarData } from '../routing/types';

    export let polar: PolarData | null = null;
    export let onSave: () => void = () => {};
    export let onCancel: () => void = () => {};

    // Local state — initialised from polar prop or defaults
    let name: string = polar?.name ?? '';
    let twaAngles: number[] = polar ? [...polar.twaAngles] : [0, 45, 90, 135, 180];
    let twsSpeeds: number[] = polar ? [...polar.twsSpeeds] : [6, 10, 15, 20];
    let speeds: number[][] = polar
        ? polar.speeds.map(row => [...row])
        : Array.from({ length: 5 }, () => Array(4).fill(0));

    let errorMsg: string = '';

    // --- TWS column handlers ---

    function updateTws(ci: number, e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            twsSpeeds = twsSpeeds.map((v, i) => (i === ci ? val : v));
        }
    }

    function addColumn(): void {
        const last = twsSpeeds[twsSpeeds.length - 1] ?? 0;
        twsSpeeds = [...twsSpeeds, last + 5];
        speeds = speeds.map(row => [...row, 0]);
    }

    function removeColumn(): void {
        if (twsSpeeds.length <= 2) return;
        twsSpeeds = twsSpeeds.slice(0, -1);
        speeds = speeds.map(row => row.slice(0, -1));
    }

    // --- TWA row handlers ---

    function updateTwa(ri: number, e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            twaAngles = twaAngles.map((v, i) => (i === ri ? val : v));
        }
    }

    function addRow(): void {
        const last = twaAngles[twaAngles.length - 1] ?? 0;
        const next = Math.min(last + 15, 180);
        twaAngles = [...twaAngles, next];
        speeds = [...speeds, Array(twsSpeeds.length).fill(0)];
    }

    function removeRow(): void {
        if (twaAngles.length <= 2) return;
        twaAngles = twaAngles.slice(0, -1);
        speeds = speeds.slice(0, -1);
    }

    // --- Speed cell handler ---

    function updateSpeed(ri: number, ci: number, e: Event): void {
        const val = parseFloat((e.target as HTMLInputElement).value);
        if (!isNaN(val)) {
            speeds = speeds.map((row, r) =>
                r === ri ? row.map((v, c) => (c === ci ? val : v)) : row,
            );
        }
    }

    // --- Validation ---

    function validate(): string {
        if (!name.trim()) return 'Polar name must not be empty.';
        if (twsSpeeds.some(v => v <= 0)) return 'All TWS values must be greater than 0.';
        if (twaAngles.some(v => v < 0 || v > 180)) return 'All TWA values must be between 0 and 180.';
        if (speeds.some(row => row.some(v => v < 0))) return 'Speed values must not be negative.';
        return '';
    }

    // --- Save ---

    function handleSave(): void {
        const err = validate();
        if (err) {
            errorMsg = err;
            return;
        }
        errorMsg = '';
        const polarData: PolarData = {
            name: name.trim(),
            twaAngles: [...twaAngles],
            twsSpeeds: [...twsSpeeds],
            speeds: speeds.map(row => [...row]),
        };
        saveCustomPolar(polarData);
        onSave();
    }
</script>

<style lang="less">
    .polar-editor {
        padding: 5px 0;
    }

    .section {
        padding: 0;
    }

    .label {
        display: block;
        opacity: 0.6;
        margin-bottom: 4px;
    }

    .input {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        padding: 6px 8px;
        box-sizing: border-box;

        &:focus {
            outline: none;
            border-color: rgba(255, 255, 255, 0.35);
        }
    }

    .name-input {
        width: 100%;
    }

    .table-wrapper {
        overflow-x: auto;
        border-radius: 4px;
    }

    .polar-table {
        border-collapse: collapse;
        min-width: 100%;

        th,
        td {
            padding: 2px 3px;
            text-align: center;
        }
    }

    .corner-cell {
        opacity: 0.55;
        white-space: nowrap;
        padding: 4px 6px;
        min-width: 60px;
    }

    .cell-input {
        width: 52px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 3px;
        color: inherit;
        padding: 3px 4px;
        font-size: 12px;
        text-align: center;
        box-sizing: border-box;

        /* hide spinner arrows for cleaner look */
        -moz-appearance: textfield;
        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }

        &:focus {
            outline: none;
            border-color: rgba(255, 255, 255, 0.4);
        }
    }

    .tws-cell,
    .twa-cell,
    .speed-cell {
        padding: 2px 3px;
    }

    .col-btns {
        white-space: nowrap;
        padding: 2px 4px;
    }

    .row-btns {
        display: flex;
        gap: 8px;
    }

    .icon-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 4px;
        color: inherit;
        cursor: pointer;
        font-size: 12px;
        padding: 3px 7px;
        line-height: 1.4;

        &:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.15);
        }

        &:disabled {
            opacity: 0.35;
            cursor: not-allowed;
        }
    }

    .error-msg {
        color: #e74c3c;
        line-height: 1.4;
    }

    .actions {
        display: flex;
        gap: 8px;
    }
</style>
