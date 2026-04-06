import type { PolarData } from './types';

export function getSpeed(polar: PolarData, twa: number, tws: number): number {
    if (tws <= 0) return 0;
    twa = Math.abs(((twa % 360) + 360) % 360);
    if (twa > 180) twa = 360 - twa;
    const { twaAngles, twsSpeeds, speeds } = polar;
    const { lo: twaLo, hi: twaHi, frac: twaFrac } = findBracket(twaAngles, twa);
    const { lo: twsLo, hi: twsHi, frac: twsFrac } = findBracket(twsSpeeds, tws);
    const s00 = speeds[twaLo][twsLo], s01 = speeds[twaLo][twsHi];
    const s10 = speeds[twaHi][twsLo], s11 = speeds[twaHi][twsHi];
    const s0 = s00 + twsFrac * (s01 - s00);
    const s1 = s10 + twsFrac * (s11 - s10);
    return s0 + twaFrac * (s1 - s0);
}

function findBracket(arr: number[], value: number): { lo: number; hi: number; frac: number } {
    if (value <= arr[0]) return { lo: 0, hi: 0, frac: 0 };
    if (value >= arr[arr.length - 1]) return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
    for (let i = 0; i < arr.length - 1; i++) {
        if (value >= arr[i] && value <= arr[i + 1]) {
            return { lo: i, hi: i + 1, frac: (value - arr[i]) / (arr[i + 1] - arr[i]) };
        }
    }
    return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
}
