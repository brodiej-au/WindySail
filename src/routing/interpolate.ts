export interface Bracket { lo: number; hi: number; frac: number; }

export function findBracket(arr: number[], value: number): Bracket {
    if (arr.length === 1 || value <= arr[0]) return { lo: 0, hi: 0, frac: 0 };
    if (value >= arr[arr.length - 1]) return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
    for (let i = 0; i < arr.length - 1; i++) {
        if (value >= arr[i] && value <= arr[i + 1]) {
            return { lo: i, hi: i + 1, frac: (value - arr[i]) / (arr[i + 1] - arr[i]) };
        }
    }
    return { lo: arr.length - 1, hi: arr.length - 1, frac: 0 };
}

export function lerp(a: number, b: number, t: number): number { return a + t * (b - a); }

/**
 * Trilinear interpolation of a [latIdx][lonIdx][timeIdx] grid at the given
 * (lat, lon, time) coordinates.
 */
export function trilinearInterpolate(
    grid3d: number[][][],
    lats: number[],
    lons: number[],
    timestamps: number[],
    lat: number,
    lon: number,
    time: number,
): number {
    const latB = findBracket(lats, lat);
    const lonB = findBracket(lons, lon);
    const timeB = findBracket(timestamps, time);

    const v00 = lerp(grid3d[latB.lo][lonB.lo][timeB.lo], grid3d[latB.lo][lonB.lo][timeB.hi], timeB.frac);
    const v01 = lerp(grid3d[latB.lo][lonB.hi][timeB.lo], grid3d[latB.lo][lonB.hi][timeB.hi], timeB.frac);
    const v10 = lerp(grid3d[latB.hi][lonB.lo][timeB.lo], grid3d[latB.hi][lonB.lo][timeB.hi], timeB.frac);
    const v11 = lerp(grid3d[latB.hi][lonB.hi][timeB.lo], grid3d[latB.hi][lonB.hi][timeB.hi], timeB.frac);

    const va = lerp(v00, v01, lonB.frac);
    const vb = lerp(v10, v11, lonB.frac);
    return lerp(va, vb, latB.frac);
}

/**
 * Interpolate an angular (degree) grid correctly across the 0/360 boundary.
 * Decomposes each grid value to sin/cos, interpolates those linearly, then
 * recombines with atan2.
 */
export function interpolateAngle(
    grid3d: number[][][],
    lats: number[],
    lons: number[],
    timestamps: number[],
    lat: number,
    lon: number,
    time: number,
): number {
    const latB = findBracket(lats, lat);
    const lonB = findBracket(lons, lon);
    const timeB = findBracket(timestamps, time);

    // Collect the 8 corner values
    const corners = [
        [latB.lo, lonB.lo, timeB.lo], [latB.lo, lonB.lo, timeB.hi],
        [latB.lo, lonB.hi, timeB.lo], [latB.lo, lonB.hi, timeB.hi],
        [latB.hi, lonB.lo, timeB.lo], [latB.hi, lonB.lo, timeB.hi],
        [latB.hi, lonB.hi, timeB.lo], [latB.hi, lonB.hi, timeB.hi],
    ] as const;

    const toRad = Math.PI / 180;
    const sins = corners.map(([li, lo, ti]) => Math.sin(grid3d[li][lo][ti] * toRad));
    const coss = corners.map(([li, lo, ti]) => Math.cos(grid3d[li][lo][ti] * toRad));

    // Trilinear interpolation on sin and cos separately
    function trilerp(vals: number[]): number {
        const t00 = lerp(vals[0], vals[1], timeB.frac);
        const t01 = lerp(vals[2], vals[3], timeB.frac);
        const t10 = lerp(vals[4], vals[5], timeB.frac);
        const t11 = lerp(vals[6], vals[7], timeB.frac);
        const la = lerp(t00, t01, lonB.frac);
        const lb = lerp(t10, t11, lonB.frac);
        return lerp(la, lb, latB.frac);
    }

    const sinVal = trilerp(sins);
    const cosVal = trilerp(coss);
    return (Math.atan2(sinVal, cosVal) * 180 / Math.PI + 360) % 360;
}
