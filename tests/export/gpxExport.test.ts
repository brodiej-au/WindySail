import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildGpx, escapeXml, suggestedFilename } from '../../src/export/gpxExport';

describe('escapeXml', () => {
    it('escapes all five XML entities', () => {
        expect(escapeXml('A & B <c> "d" \'e\'')).toBe(
            'A &amp; B &lt;c&gt; &quot;d&quot; &apos;e&apos;'
        );
    });
});

describe('buildGpx', () => {
    it('matches the golden 3-waypoint fixture', () => {
        const fixture = readFileSync(
            resolve(__dirname, '../fixtures/route-3wpt.gpx'),
            'utf8'
        );
        const actual = buildGpx({
            startName: 'Pittwater',
            endName: 'Sydney Harbour',
            start: { lat: -33.6012, lon: 151.3098 },
            end: { lat: -33.8523, lon: 151.2108 },
            waypoints: [{ lat: -33.821, lon: 151.44 }],
            version: '0.3.0',
            timestamp: '2026-04-19T09:15:00.000Z',
        });
        expect(actual.trim()).toBe(fixture.trim());
    });

    it('handles routes with no intermediate waypoints', () => {
        const out = buildGpx({
            startName: 'A', endName: 'B',
            start: { lat: 0, lon: 0 }, end: { lat: 1, lon: 1 },
            waypoints: [],
            version: '0.3.0',
            timestamp: '2026-04-19T00:00:00.000Z',
        });
        expect(out).toContain('<rtept lat="0.0000" lon="0.0000"');
        expect(out).toContain('<rtept lat="1.0000" lon="1.0000"');
        expect(out).not.toContain('Waypoint 1');
    });

    it('escapes special characters in names', () => {
        const out = buildGpx({
            startName: 'A & B <test>',
            endName: 'End',
            start: { lat: 0, lon: 0 }, end: { lat: 1, lon: 1 },
            waypoints: [],
            version: '0.3.0',
            timestamp: '2026-04-19T00:00:00.000Z',
        });
        expect(out).toContain('A &amp; B &lt;test&gt;');
        expect(out).not.toContain('A & B <test>');
    });
});

describe('suggestedFilename', () => {
    it('slugifies names and includes ISO date', () => {
        expect(suggestedFilename('Pittwater', 'Sydney Harbour', new Date('2026-04-19T00:00:00Z')))
            .toBe('sail-router-pittwater-sydney-harbour-2026-04-19.gpx');
    });

    it('handles names with accents and punctuation', () => {
        expect(suggestedFilename("St. Jean's", 'Île d\'Or', new Date('2026-01-01T00:00:00Z')))
            .toBe('sail-router-st-jeans-ile-dor-2026-01-01.gpx');
    });

    it('falls back to "route" when both names are empty', () => {
        expect(suggestedFilename('', '', new Date('2026-04-19T00:00:00Z')))
            .toBe('sail-router-route-2026-04-19.gpx');
    });
});
