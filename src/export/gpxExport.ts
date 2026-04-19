import type { LatLon } from '../routing/types';

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export interface BuildGpxArgs {
    startName: string;
    endName: string;
    start: LatLon;
    end: LatLon;
    waypoints: LatLon[];
    version: string;
    timestamp: string; // ISO string
}

// Render em-dash as a numeric character reference so file bytes are stable
// across editors that might otherwise re-encode.
function emdash(s: string): string {
    return s.replace(/\u2014/g, '&#8212;');
}

function formatCoord(n: number): string {
    return n.toFixed(4);
}

export function buildGpx(args: BuildGpxArgs): string {
    const routeName = `${args.startName} to ${args.endName}`;
    const stops: { point: LatLon; name: string }[] = [];
    stops.push({ point: args.start, name: `Start \u2014 ${args.startName}` });
    args.waypoints.forEach((wp, i) => stops.push({ point: wp, name: `Waypoint ${i + 1}` }));
    stops.push({ point: args.end, name: `Finish \u2014 ${args.endName}` });

    const rtepts = stops.map(s =>
        `    <rtept lat="${formatCoord(s.point.lat)}" lon="${formatCoord(s.point.lon)}"><name>${emdash(escapeXml(s.name))}</name></rtept>`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Windy Sail Router v${escapeXml(args.version)}" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(routeName)}</name>
    <time>${escapeXml(args.timestamp)}</time>
  </metadata>
  <rte>
    <name>Sail Router plan</name>
${rtepts}
  </rte>
</gpx>`;
}

function slugify(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/['\u2019]/g, '') // drop straight + curly apostrophes so "St. Jean's" → "st-jeans"
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function suggestedFilename(startName: string, endName: string, now: Date): string {
    const slug1 = slugify(startName) || '';
    const slug2 = slugify(endName) || '';
    const combo = [slug1, slug2].filter(Boolean).join('-') || 'route';
    const date = now.toISOString().slice(0, 10);
    return `sail-router-${combo}-${date}.gpx`;
}

export function triggerGpxDownload(args: BuildGpxArgs): void {
    const xml = buildGpx(args);
    const filename = suggestedFilename(args.startName, args.endName, new Date());
    const blob = new Blob([xml], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
