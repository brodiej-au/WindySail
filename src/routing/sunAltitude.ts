/**
 * Determines whether the sun is below the horizon at the given location and time.
 * Uses a low-precision NOAA-derived formula (good to ±1° — fine for "is it night").
 * Returns true when solar altitude is below -0.833° (accounts for atmospheric refraction
 * + solar disc radius, so this is "official sunset" boundary).
 */
export function isNight(lat: number, lon: number, unixMs: number): boolean {
    return solarAltitudeDegrees(lat, lon, unixMs) < -0.833;
}

export function solarAltitudeDegrees(lat: number, lon: number, unixMs: number): number {
    const date = new Date(unixMs);
    const dayOfYear = julianDayOfYear(date);
    const declination = solarDeclination(dayOfYear);
    const eqTime = equationOfTime(dayOfYear); // minutes

    const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
    const solarTime = utcMinutes + eqTime + 4 * lon; // minutes
    const hourAngle = (solarTime / 4 - 180); // degrees

    const latRad = toRad(lat);
    const decRad = toRad(declination);
    const haRad = toRad(hourAngle);

    const sinAlt = Math.sin(latRad) * Math.sin(decRad) +
                   Math.cos(latRad) * Math.cos(decRad) * Math.cos(haRad);
    return toDeg(Math.asin(sinAlt));
}

function julianDayOfYear(d: Date): number {
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    return (d.getTime() - start) / 86_400_000;
}

function solarDeclination(n: number): number {
    // Cooper approximation
    return 23.44 * Math.sin(toRad(360 * (n - 81) / 365));
}

function equationOfTime(n: number): number {
    const B = toRad(360 * (n - 81) / 365);
    return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

function toRad(d: number): number { return d * Math.PI / 180; }
function toDeg(r: number): number { return r * 180 / Math.PI; }
