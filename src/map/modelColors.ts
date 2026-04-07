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
