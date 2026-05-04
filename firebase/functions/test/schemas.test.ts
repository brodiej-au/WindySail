import { describe, it, expect } from 'vitest';
import {
    installSchema,
    disclaimerSchema,
    syncListSchema,
    syncRouteUpsertSchema,
} from '../src/schemas';

const VALID_EMAIL_HASH = 'a1b2c3d4e5f6a7b8c9d0a1b2c3d4e5f6';

describe('installSchema', () => {
    const valid = {
        emailHash: VALID_EMAIL_HASH,
        pluginVersion: '0.14.3',
        usedLang: 'en',
        userAgent: 'Mozilla/5.0',
    };
    it('accepts valid payload', () => {
        expect(installSchema.parse(valid)).toEqual(valid);
    });
    it('accepts null emailHash (anonymous user)', () => {
        const r = installSchema.parse({ ...valid, emailHash: null });
        expect(r.emailHash).toBeNull();
    });
    it('accepts missing emailHash field (defaults to null)', () => {
        const { emailHash: _e, ...rest } = valid;
        const r = installSchema.parse(rest);
        expect(r.emailHash).toBeNull();
    });
    it('rejects raw email field even if present', () => {
        // Legacy clients might send `email`; the new schema simply ignores
        // extra fields by default, so the parse succeeds but the email is
        // dropped. This guarantees the server never persists raw emails
        // even during a stale-client transition.
        const r = installSchema.parse({ ...valid, email: 'user@example.com' } as any);
        expect((r as any).email).toBeUndefined();
    });
    it('rejects malformed emailHash', () => {
        expect(() => installSchema.parse({ ...valid, emailHash: 'not-a-hash' })).toThrow();
    });
    it('truncates userAgent over 200 chars', () => {
        const long = 'x'.repeat(500);
        const r = installSchema.parse({ ...valid, userAgent: long });
        expect(r.userAgent.length).toBeLessThanOrEqual(200);
    });
});

describe('disclaimerSchema', () => {
    it('accepts valid payload with acceptedAt + null emailHash', () => {
        const r = disclaimerSchema.parse({
            emailHash: null,
            pluginVersion: '0.14.3',
            disclaimerVersion: '2026-04',
            acceptedAt: new Date().toISOString(),
        });
        expect(r.acceptedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
        expect(r.emailHash).toBeNull();
    });
});

describe('syncListSchema (sync identity)', () => {
    it('requires emailHash', () => {
        expect(() => syncListSchema.parse({})).toThrow();
    });
    it('rejects null emailHash for sync (sync requires sign-in)', () => {
        expect(() => syncListSchema.parse({ emailHash: null })).toThrow();
    });
    it('accepts a valid hash', () => {
        const r = syncListSchema.parse({ emailHash: VALID_EMAIL_HASH });
        expect(r.emailHash).toBe(VALID_EMAIL_HASH);
    });
});

describe('syncRouteUpsertSchema', () => {
    it('rejects raw email or deviceId fields silently (extra fields stripped)', () => {
        const r = syncRouteUpsertSchema.parse({
            emailHash: VALID_EMAIL_HASH,
            email: 'user@example.com',
            deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
            route: {
                id: 'r1',
                name: 'Test',
                createdAt: 1,
                start: { lat: 0, lon: 0 },
                end: { lat: 1, lon: 1 },
                waypoints: [],
                departureTime: 1,
                polarName: 'Test',
                selectedModels: ['ecmwf'],
                routingOptions: {},
            },
        } as any);
        expect((r as any).email).toBeUndefined();
        expect((r as any).deviceId).toBeUndefined();
    });
});
