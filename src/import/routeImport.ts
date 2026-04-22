import type { LatLon } from '../routing/types';

export interface ImportedRoute {
    start: LatLon;
    end: LatLon;
    waypoints: LatLon[];
    name?: string;
    warning?: string;
}

export type RouteImportErrorCode =
    | 'invalid-xml'
    | 'no-points'
    | 'too-few-points'
    | 'out-of-range'
    | 'unknown-format';

export class RouteImportError extends Error {
    constructor(public code: RouteImportErrorCode, message: string) {
        super(message);
        this.name = 'RouteImportError';
    }
}

const WAYPOINT_WARN_THRESHOLD = 5;

/**
 * Extracts lat/lon attribute values from a tag like `<rtept lat=".." lon=".."/>`.
 * Accepts either attribute order and either quote style. Returns null for invalid.
 */
function extractLatLon(tag: string): LatLon | null {
    const latMatch = tag.match(/\blat\s*=\s*["']([^"']+)["']/);
    const lonMatch = tag.match(/\blon\s*=\s*["']([^"']+)["']/);
    if (!latMatch || !lonMatch) return null;
    const lat = parseFloat(latMatch[1]);
    const lon = parseFloat(lonMatch[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    return { lat, lon };
}

/**
 * Extracts text content of the first `<tagName>...</tagName>` match, trimmed.
 * Returns null if not found. `scope` optionally limits the search to a substring.
 */
function extractText(xml: string, tagName: string, scope?: string): string | null {
    const haystack = scope ?? xml;
    const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
    const m = haystack.match(re);
    return m ? decodeEntities(m[1]).trim() : null;
}

function decodeEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function buildRoute(points: LatLon[], name?: string): ImportedRoute {
    if (points.length === 0) {
        throw new RouteImportError('no-points', 'File contains no route points.');
    }
    if (points.length < 2) {
        throw new RouteImportError('too-few-points', 'Route needs at least a start and finish.');
    }
    for (const p of points) {
        if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) {
            throw new RouteImportError('out-of-range', `Coord out of range: ${p.lat},${p.lon}`);
        }
    }
    const waypoints = points.slice(1, -1);
    const route: ImportedRoute = {
        start: points[0],
        end: points[points.length - 1],
        waypoints,
    };
    if (name) route.name = name;
    if (waypoints.length > WAYPOINT_WARN_THRESHOLD) {
        route.warning = `This route has ${waypoints.length} waypoints — more than the usual 5.`;
    }
    return route;
}

export function parseGpx(xml: string): ImportedRoute {
    const rteBlockMatch = xml.match(/<rte\b[\s\S]*?<\/rte>/i);
    const points: LatLon[] = [];
    if (rteBlockMatch) {
        const rteBlock = rteBlockMatch[0];
        const tagRe = /<rtept\b[^>]*?\/?>/gi;
        let m: RegExpExecArray | null;
        while ((m = tagRe.exec(rteBlock)) !== null) {
            const p = extractLatLon(m[0]);
            if (p) points.push(p);
        }
    }
    let name: string | undefined;
    const metaMatch = xml.match(/<metadata\b[\s\S]*?<\/metadata>/i);
    if (metaMatch) {
        const n = extractText(metaMatch[0], 'name');
        if (n) name = n;
    }
    if (!name && rteBlockMatch) {
        const n = extractText(rteBlockMatch[0], 'name');
        if (n) name = n;
    }
    return buildRoute(points, name);
}
