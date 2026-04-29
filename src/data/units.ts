/**
 * Unit conversion + display formatting.
 *
 * Internally the plugin stores distance in nautical miles, speed in knots, and
 * height in metres. These helpers convert those canonical values to the user's
 * preferred display unit. Internal calculations should NOT call these — they
 * operate on raw stored values.
 */
import type { DistanceUnit, SpeedUnit, HeightUnit } from '../routing/types';

const NM_TO_KM = 1.852;
const NM_TO_MI = 1.15078;
const KT_TO_KMH = 1.852;
const KT_TO_MPH = 1.15078;
const M_TO_FT = 3.28084;

export function convertDistance(nm: number, unit: DistanceUnit): number {
    switch (unit) {
        case 'km': return nm * NM_TO_KM;
        case 'mi': return nm * NM_TO_MI;
        case 'nm':
        default:   return nm;
    }
}

export function convertSpeed(kt: number, unit: SpeedUnit): number {
    switch (unit) {
        case 'kmh': return kt * KT_TO_KMH;
        case 'mph': return kt * KT_TO_MPH;
        case 'kt':
        default:    return kt;
    }
}

export function convertHeight(m: number, unit: HeightUnit): number {
    return unit === 'ft' ? m * M_TO_FT : m;
}

export function distanceLabel(unit: DistanceUnit): string {
    switch (unit) {
        case 'km': return 'km';
        case 'mi': return 'mi';
        case 'nm':
        default:   return 'nm';
    }
}

export function speedLabel(unit: SpeedUnit): string {
    switch (unit) {
        case 'kmh': return 'km/h';
        case 'mph': return 'mph';
        case 'kt':
        default:    return 'kt';
    }
}

export function heightLabel(unit: HeightUnit): string {
    return unit === 'ft' ? 'ft' : 'm';
}

export function formatDistance(nm: number, unit: DistanceUnit, decimals = 1): string {
    return `${convertDistance(nm, unit).toFixed(decimals)} ${distanceLabel(unit)}`;
}

export function formatSpeed(kt: number, unit: SpeedUnit, decimals = 1): string {
    return `${convertSpeed(kt, unit).toFixed(decimals)} ${speedLabel(unit)}`;
}

export function formatHeight(m: number, unit: HeightUnit, decimals = 1): string {
    return `${convertHeight(m, unit).toFixed(decimals)} ${heightLabel(unit)}`;
}

// --- Inverse conversions (display unit -> canonical) ---
// Used by settings inputs that store canonical units but accept user-unit input.

export function distanceToNm(value: number, unit: DistanceUnit): number {
    switch (unit) {
        case 'km': return value / NM_TO_KM;
        case 'mi': return value / NM_TO_MI;
        case 'nm':
        default:   return value;
    }
}

export function speedToKt(value: number, unit: SpeedUnit): number {
    switch (unit) {
        case 'kmh': return value / KT_TO_KMH;
        case 'mph': return value / KT_TO_MPH;
        case 'kt':
        default:    return value;
    }
}

export function heightToM(value: number, unit: HeightUnit): number {
    return unit === 'ft' ? value / M_TO_FT : value;
}
