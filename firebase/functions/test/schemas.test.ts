import { describe, it, expect } from 'vitest';
import {
    installSchema,
    heartbeatSchema,
    disclaimerSchema,
} from '../src/schemas';

describe('installSchema', () => {
    const valid = {
        deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
        email: 'user@example.com',
        pluginVersion: '0.3.0',
        usedLang: 'en',
        userAgent: 'Mozilla/5.0',
    };
    it('accepts valid payload', () => { expect(installSchema.parse(valid)).toEqual(valid); });
    it('accepts missing email (nullable)', () => {
        const r = installSchema.parse({ ...valid, email: null });
        expect(r.email).toBeNull();
    });
    it('rejects missing deviceId', () => {
        expect(() => installSchema.parse({ ...valid, deviceId: undefined })).toThrow();
    });
    it('rejects non-UUID deviceId', () => {
        expect(() => installSchema.parse({ ...valid, deviceId: 'not-a-uuid' })).toThrow();
    });
    it('truncates userAgent over 200 chars', () => {
        const long = 'x'.repeat(500);
        const r = installSchema.parse({ ...valid, userAgent: long });
        expect(r.userAgent.length).toBeLessThanOrEqual(200);
    });
});

describe('heartbeatSchema', () => {
    it('accepts minimal payload', () => {
        const r = heartbeatSchema.parse({
            deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
            pluginVersion: '0.3.0',
            usedLang: 'en',
        });
        expect(r.email).toBeNull();
    });
});

describe('disclaimerSchema', () => {
    it('accepts valid payload with acceptedAt', () => {
        const r = disclaimerSchema.parse({
            deviceId: '5c8f6b2a-9e1c-4e5a-a9f3-02b4c9d8f7a1',
            pluginVersion: '0.3.0',
            disclaimerVersion: '2026-04',
            acceptedAt: new Date().toISOString(),
        });
        expect(r.acceptedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    });
});
