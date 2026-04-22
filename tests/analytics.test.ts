/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the settings store BEFORE importing analytics, so analytics picks up the mock.
vi.mock('../src/stores/SettingsStore', () => {
    const mockSettings: Record<string, unknown> = { analyticsEnabled: true };
    return {
        settingsStore: {
            get: (k: string) => mockSettings[k],
            set: (k: string, v: unknown) => { mockSettings[k] = v; },
        },
    };
});

import { settingsStore } from '../src/stores/SettingsStore';

const GA_ID = 'G-JJ4VC3LNC0';
const DISABLE_KEY = `ga-disable-${GA_ID}`;

beforeEach(() => {
    document.head.querySelectorAll('script[src*="googletagmanager"]').forEach(s => s.remove());
    (window as any)[DISABLE_KEY] = false;
    (window as any).sailDataLayer = [];
    vi.resetModules();
});

describe('analytics opt-out', () => {
    it('skips loading GA when analyticsEnabled is false and sets the disable flag', async () => {
        settingsStore.set('analyticsEnabled', false);
        const mod = await import('../src/analytics');
        mod.initAnalytics();
        const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]');
        expect(scripts.length).toBe(0);
        expect((window as any)[DISABLE_KEY]).toBe(true);
    });

    it('loads GA when analyticsEnabled is true', async () => {
        settingsStore.set('analyticsEnabled', true);
        const mod = await import('../src/analytics');
        mod.initAnalytics();
        const scripts = document.head.querySelectorAll('script[src*="googletagmanager"]');
        expect(scripts.length).toBe(1);
    });

    it('trackEvent is a no-op when opted out', async () => {
        settingsStore.set('analyticsEnabled', false);
        const mod = await import('../src/analytics');
        const before = (window as any).sailDataLayer.length;
        mod.trackEvent('x', { a: 1 });
        expect((window as any).sailDataLayer.length).toBe(before);
    });

    it('trackEvent pushes when opted in', async () => {
        settingsStore.set('analyticsEnabled', true);
        const mod = await import('../src/analytics');
        mod.initAnalytics();
        const before = (window as any).sailDataLayer.length;
        mod.trackEvent('x', { a: 1 });
        expect((window as any).sailDataLayer.length).toBeGreaterThan(before);
    });
});
