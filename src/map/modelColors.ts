import type {
    GlobalWindModelId,
    RegionalWindModelId,
    WaveModelId,
    WindModelId,
} from '../routing/types';

/**
 * Wind models always available worldwide. Shown flat in the picker so
 * the most common choices are one click away.
 */
export const GLOBAL_WIND_MODELS: GlobalWindModelId[] = ['gfs', 'ecmwf', 'icon', 'mblue'];

/**
 * Regional wind models — shown under a "Regional" expander in the
 * settings UI. Order roughly by region (Europe → Americas → Asia-Pac)
 * for visual grouping.
 */
export const REGIONAL_WIND_MODELS: RegionalWindModelId[] = [
    // Europe
    'iconEu', 'iconD2', 'ukv', 'czeAladin',
    'arome', 'aromeFrance', 'aromeAntilles', 'aromeReunion',
    // Americas
    'namConus', 'namAlaska', 'namHawaii',
    'hrrrConus', 'hrrrAlaska',
    'canHrdps',
    // Asia-Pac
    'bomAccess',
    'jmaMsm',
];

export const ALL_WIND_MODELS: WindModelId[] = [
    ...GLOBAL_WIND_MODELS,
    ...REGIONAL_WIND_MODELS,
];

/**
 * Wind models that require a paid Windy Premium subscription. When sampling
 * returns all-zero values for one of these, we surface a "Requires Premium"
 * message rather than the generic "Sampling failed" so the user understands
 * why their account isn't getting data.
 *
 * Conservative list — we only flag models where the all-zero signal is most
 * likely a paywall rather than a regional coverage gap.
 */
export const PREMIUM_WIND_MODELS: ReadonlySet<WindModelId> = new Set([
    'mblue',
]);

export function isPremiumWindModel(model: WindModelId): boolean {
    return PREMIUM_WIND_MODELS.has(model);
}

/**
 * Wave / swell forecast products. User selects exactly one (single-select)
 * via a dropdown in settings; it drives swell sampling in OceanDataProvider.
 */
export const WAVE_MODELS: WaveModelId[] = [
    'ecmwfWaves', 'gfsWaves', 'iconEuWaves', 'jmaCwmWaves', 'canRdwpsWaves',
];

export const WAVE_MODEL_LABELS: Record<WaveModelId, string> = {
    ecmwfWaves: 'ECMWF WAM',
    gfsWaves: 'GFS Wave',
    iconEuWaves: 'ICON-EU Waves',
    jmaCwmWaves: 'JMA CWM',
    canRdwpsWaves: 'Canadian RDWPS',
};

export const MODEL_COLORS: Record<WindModelId, string> = {
    // Global
    gfs: '#457B9D',
    ecmwf: '#E63946',
    icon: '#2A9D8F',
    mblue: '#9D4EDD',
    // Regional — Europe
    iconEu: '#3DA5D9',
    iconD2: '#E36414',
    ukv: '#264653',
    czeAladin: '#3D5A80',
    arome: '#73AB84',
    aromeFrance: '#5A9367',
    aromeAntilles: '#A4C3B2',
    aromeReunion: '#7BB099',
    // Regional — Americas
    namConus: '#FFB627',
    namAlaska: '#B95F89',
    namHawaii: '#F7B538',
    hrrrConus: '#B5179E',
    hrrrAlaska: '#7209B7',
    canHrdps: '#D62828',
    // Regional — Asia-Pac
    bomAccess: '#E9C46A',
    jmaMsm: '#F4A261',
};

export const MODEL_LABELS: Record<WindModelId, string> = {
    // Global
    gfs: 'GFS',
    ecmwf: 'ECMWF',
    icon: 'ICON',
    mblue: 'Meteoblue',
    // Regional — Europe
    iconEu: 'ICON-EU',
    iconD2: 'ICON-D2',
    ukv: 'UKV',
    czeAladin: 'ALADIN',
    arome: 'AROME',
    aromeFrance: 'AROME France',
    aromeAntilles: 'AROME Antilles',
    aromeReunion: 'AROME Réunion',
    // Regional — Americas
    namConus: 'NAM CONUS',
    namAlaska: 'NAM Alaska',
    namHawaii: 'NAM Hawaii',
    hrrrConus: 'HRRR CONUS',
    hrrrAlaska: 'HRRR Alaska',
    canHrdps: 'CAN HRDPS',
    // Regional — Asia-Pac
    bomAccess: 'ACCESS-G',
    jmaMsm: 'JMA MSM',
};

/**
 * Map a wind model id to the right Windy product string for a given overlay.
 *
 * - For wind: the model id IS the product id.
 * - For currents: a single global product (`cmems`) regardless of wind model.
 * - For waves: this helper used to map wind→wave (e.g. `gfs`→`gfsWaves`); now
 *   that the user explicitly selects a wave product, callers should use
 *   the `selectedWaveModel` setting directly. We retain the function for
 *   non-wave overlays to avoid touching unrelated callers.
 */
export function getWindyProduct(model: WindModelId, overlay: string): string | null {
    if (overlay === 'wind') return model;
    if (overlay === 'currents' || overlay === 'currentsTide') {
        return 'cmems';
    }
    // For other overlays (temp, pressure, etc.), the wind model ID is often valid
    return model;
}
