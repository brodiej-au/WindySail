import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parseGpx, RouteImportError } from '../../src/import/routeImport';

describe('parseGpx — <rte> routes', () => {
    it('parses the exporter round-trip fixture', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/route-3wpt.gpx'), 'utf8');
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: -33.6012, lon: 151.3098 });
        expect(r.end).toEqual({ lat: -33.8523, lon: 151.2108 });
        expect(r.waypoints).toEqual([{ lat: -33.8210, lon: 151.4400 }]);
        expect(r.name).toBe('Pittwater to Sydney Harbour');
    });

    it('accepts lon/lat order reversed in attribute list', () => {
        const xml = `<?xml version="1.0"?><gpx><rte>
            <rtept lon="10.5" lat="45.1"/>
            <rtept lat="46.2" lon="11.6"/>
        </rte></gpx>`;
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: 45.1, lon: 10.5 });
        expect(r.end).toEqual({ lat: 46.2, lon: 11.6 });
        expect(r.waypoints).toEqual([]);
    });

    it('prefers <metadata><name> over <rte><name> for route name', () => {
        const xml = `<?xml version="1.0"?><gpx>
            <metadata><name>My Plan</name></metadata>
            <rte><name>Sail Router plan</name>
                <rtept lat="0" lon="0"/><rtept lat="1" lon="1"/>
            </rte></gpx>`;
        expect(parseGpx(xml).name).toBe('My Plan');
    });

    it('falls back to <rte><name> when no metadata name', () => {
        const xml = `<?xml version="1.0"?><gpx>
            <rte><name>Leg 1</name>
                <rtept lat="0" lon="0"/><rtept lat="1" lon="1"/>
            </rte></gpx>`;
        expect(parseGpx(xml).name).toBe('Leg 1');
    });

    it('throws too-few-points for a single rtept', () => {
        const xml = `<?xml version="1.0"?><gpx><rte><rtept lat="0" lon="0"/></rte></gpx>`;
        expect(() => parseGpx(xml)).toThrow(RouteImportError);
        try { parseGpx(xml); } catch (e) {
            expect((e as RouteImportError).code).toBe('too-few-points');
        }
    });

    it('throws out-of-range for lat > 90', () => {
        const xml = `<?xml version="1.0"?><gpx><rte>
            <rtept lat="91" lon="0"/><rtept lat="0" lon="0"/>
        </rte></gpx>`;
        try { parseGpx(xml); } catch (e) {
            expect((e as RouteImportError).code).toBe('out-of-range');
        }
    });

    it('populates warning for more than 5 waypoints (6+ intermediates = 8+ total)', () => {
        const pts = Array.from({ length: 8 }, (_, i) => `<rtept lat="${i}" lon="${i}"/>`).join('');
        const xml = `<?xml version="1.0"?><gpx><rte>${pts}</rte></gpx>`;
        const r = parseGpx(xml);
        expect(r.waypoints.length).toBe(6);
        expect(r.warning).toBeTruthy();
    });
});

describe('parseGpx — <wpt>-only fallback', () => {
    it('parses waypoints in document order when no <rte>', () => {
        const xml = readFileSync(resolve(__dirname, '../fixtures/import-wpt-only.gpx'), 'utf8');
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: -33.6012, lon: 151.3098 });
        expect(r.end).toEqual({ lat: -33.8523, lon: 151.2108 });
        expect(r.waypoints).toEqual([{ lat: -33.8210, lon: 151.4400 }]);
    });

    it('prefers <rte> over <wpt> when both are present', () => {
        const xml = `<?xml version="1.0"?><gpx>
            <wpt lat="10" lon="10"/><wpt lat="11" lon="11"/>
            <rte><rtept lat="0" lon="0"/><rtept lat="1" lon="1"/></rte>
        </gpx>`;
        const r = parseGpx(xml);
        expect(r.start).toEqual({ lat: 0, lon: 0 });
        expect(r.end).toEqual({ lat: 1, lon: 1 });
    });
});
