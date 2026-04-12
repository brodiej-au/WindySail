import type { WindModelId } from '../routing/types';

export const MODEL_COLORS: Record<WindModelId, string> = {
    gfs: '#457B9D',
    ecmwf: '#E63946',
    icon: '#2A9D8F',
    bomAccess: '#E9C46A',
};

export const MODEL_LABELS: Record<WindModelId, string> = {
    gfs: 'GFS',
    ecmwf: 'ECMWF',
    icon: 'ICON',
    bomAccess: 'ACCESS',
};

/**
 * Map a WindModelId to the correct Windy product name for a given overlay.
 * Wind models and wave/current models use different product strings in Windy.
 * Returns null if the model has no equivalent for that overlay.
 */
const WAVE_PRODUCTS: Record<WindModelId, string> = {
    gfs: 'gfsWaves',
    ecmwf: 'ecmwfWaves',
    icon: 'iconEuWaves',
    bomAccess: 'ecmwfWaves',
};

export function getWindyProduct(model: WindModelId, overlay: string): string | null {
    if (overlay === 'wind') return model;
    if (overlay === 'waves' || overlay === 'wwaves' || overlay === 'swell1' || overlay === 'swell2' || overlay === 'swell3') {
        return WAVE_PRODUCTS[model] ?? null;
    }
    if (overlay === 'currents' || overlay === 'currentsTide') {
        return 'cmems'; // Single global source for all models
    }
    // For other overlays (temp, pressure, etc.), the wind model ID is often valid
    return model;
}
