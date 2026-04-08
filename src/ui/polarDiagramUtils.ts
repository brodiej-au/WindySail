/**
 * Shared utilities for polar diagram rendering (viewer + editor).
 *
 * Coordinate convention (classical sailing polar, right half):
 *  - 0° TWA at top (into the wind), 180° at bottom (downwind)
 *  - Only the right half of the diagram is shown (0° → 180° clockwise)
 *  - Origin (cx, cy) is the center of the polar circle
 *  - x = cx + r·sin(TWA), y = cy − r·cos(TWA) in SVG coordinates
 */

/** HSL gradient from blue (light wind) to red (heavy wind). */
export function twsColor(index: number, total: number): string {
    const hue = total <= 1 ? 240 : 240 - (index / (total - 1)) * 240;
    return `hsl(${hue}, 75%, 55%)`;
}

/** Maximum speed rounded up to a nice increment. */
export function computeMaxSpeed(speeds: number[][]): number {
    const flat: number[] = ([] as number[]).concat(...speeds);
    const max = flat.length > 0 ? Math.max(...flat) : 0;
    if (max <= 0) return 8;
    const step = max > 10 ? 2 : 1;
    return Math.ceil(max / step) * step;
}

/**
 * Compute layout dimensions for a polar diagram.
 * Returns cx, cy, radius, and viewBox height.
 */
export function polarLayout(width: number): {
    cx: number;
    cy: number;
    radius: number;
    height: number;
} {
    const padding = 25;
    const radius = width / 2 - padding;
    const cy = radius + padding;
    const height = cy + radius + 40;
    return { cx: width / 2, cy, radius, height };
}

/** Convert polar coordinates (TWA in degrees, speed in knots) to SVG x/y. */
export function polarToSvg(
    twa: number,
    speed: number,
    cx: number,
    cy: number,
    radius: number,
    maxSpeed: number,
): { x: number; y: number } {
    const r = maxSpeed > 0 ? (speed / maxSpeed) * radius : 0;
    const rad = (twa * Math.PI) / 180;
    return {
        x: cx + r * Math.sin(rad),
        y: cy - r * Math.cos(rad),
    };
}

/** Inverse of polarToSvg — convert SVG position back to TWA/speed. TWA clamped to [0, 180]. */
export function svgToPolar(
    x: number,
    y: number,
    cx: number,
    cy: number,
    radius: number,
    maxSpeed: number,
): { twa: number; speed: number } {
    const dx = x - cx;
    const dy = -(y - cy); // flip y back
    const r = Math.sqrt(dx * dx + dy * dy);
    const speed = radius > 0 ? (r / radius) * maxSpeed : 0;

    // atan2(sin_component, cos_component) = atan2(dx, dy)
    let twa = (Math.atan2(dx, dy) * 180) / Math.PI;
    twa = Math.max(0, Math.min(180, twa));

    return { twa, speed };
}

/** Array of speed ring values (e.g. [2, 4, 6, 8] for maxSpeed=8). */
export function speedRingValues(maxSpeed: number): number[] {
    const step = maxSpeed > 10 ? 2 : 1;
    const values: number[] = [];
    for (let v = step; v <= maxSpeed; v += step) {
        values.push(v);
    }
    return values;
}

/** SVG arc path `d` string for a half-circle (0° → 180°) at given radius. */
export function arcPath(cx: number, cy: number, r: number): string {
    // 0° TWA: top of arc → (cx, cy - r)
    // 180° TWA: bottom of arc → (cx, cy + r)
    // Sweep clockwise (right side only)
    const startX = cx;
    const startY = cy - r;
    const endX = cx;
    const endY = cy + r;
    return `M ${startX} ${startY} A ${r} ${r} 0 0 1 ${endX} ${endY}`;
}

/** SVG path `d` string connecting data points for one TWS curve. */
export function buildCurvePath(
    twaAngles: number[],
    speedsForTws: number[],
    cx: number,
    cy: number,
    radius: number,
    maxSpeed: number,
): string {
    const parts: string[] = [];
    for (let i = 0; i < twaAngles.length; i++) {
        const pt = polarToSvg(twaAngles[i], speedsForTws[i], cx, cy, radius, maxSpeed);
        parts.push(`${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`);
    }
    return parts.join(' ');
}
