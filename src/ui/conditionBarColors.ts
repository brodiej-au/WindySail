function lerp(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function rgb(r: number, g: number, b: number): string {
    return `rgb(${r}, ${g}, ${b})`;
}

function scaleColor(value: number, stops: [number, number, number, number][]): string {
    if (stops.length === 0) return rgb(128, 128, 128);
    if (value <= stops[0][0]) return rgb(stops[0][1], stops[0][2], stops[0][3]);
    if (value >= stops[stops.length - 1][0]) {
        const s = stops[stops.length - 1];
        return rgb(s[1], s[2], s[3]);
    }

    for (let i = 0; i < stops.length - 1; i++) {
        const [v0, r0, g0, b0] = stops[i];
        const [v1, r1, g1, b1] = stops[i + 1];
        if (value >= v0 && value <= v1) {
            const t = (value - v0) / (v1 - v0);
            return rgb(lerp(r0, r1, t), lerp(g0, g1, t), lerp(b0, b1, t));
        }
    }

    const s = stops[stops.length - 1];
    return rgb(s[1], s[2], s[3]);
}

/** TWS: Blue (calm) → Green (8-12kt) → Yellow (15-20kt) → Red (25kt+) */
export function twsColor(tws: number): string {
    if (tws < 4) return rgb(52, 152, 219);
    return scaleColor(tws, [
        [4,   52, 152, 219],
        [8,   46, 204, 113],
        [14,  46, 204, 113],
        [20, 243, 156,  18],
        [25, 231,  76,  60],
        [35, 192,  57,  43],
    ]);
}

/** SOG: Red (stalled) → Yellow (slow) → Green (good VMG) */
export function sogColor(sog: number): string {
    return scaleColor(sog, [
        [0,  231,  76,  60],
        [2,  243, 156,  18],
        [4,  168, 224, 106],
        [6,   46, 204, 113],
        [10,  39, 174,  96],
    ]);
}

/** TWA: Green (broad reach/run 90-180°) → Yellow (close hauled) → Red (hard on wind <40°) */
export function twaColor(twa: number): string {
    const offWind = 180 - twa;
    return scaleColor(offWind, [
        [0,    39, 174,  96],
        [60,   46, 204, 113],
        [90,  168, 224, 106],
        [120, 243, 156,  18],
        [140, 231,  76,  60],
        [180, 192,  57,  43],
    ]);
}

/** Swell: Green (<1m) → Yellow (1-2m) → Red (3m+) */
export function swellColor(height: number): string {
    return scaleColor(height, [
        [0,    39, 174,  96],
        [0.5,  46, 204, 113],
        [1.5, 243, 156,  18],
        [2.5, 231,  76,  60],
        [4,   220,  50,  40],
    ]);
}

export type ConditionMetric = 'tws' | 'sog' | 'twa' | 'swell';

export const METRIC_LABELS: Record<ConditionMetric, string> = {
    tws: 'TWS',
    sog: 'SOG',
    twa: 'TWA',
    swell: 'Swell',
};
