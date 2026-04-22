import { describe, it, expect, beforeEach, vi } from 'vitest';

// NOTE: the index module reads a Svelte store lazily; we mock @windy/store with a
// mutable "usedLang" value so tests can switch locales.
let usedLang = 'en';
vi.mock('@windy/store', () => ({
    default: {
        get: (k: string) => (k === 'usedLang' ? usedLang : null),
        on: (_k: string, _cb: any) => {},
    },
}));

import { t, setLocale, available, register } from '../../src/i18n';
import { en } from '../../src/i18n/en';

describe('t()', () => {
    beforeEach(() => { usedLang = 'en'; setLocale('en'); });

    it('returns the English value for a known key', () => {
        expect(t('routing.calculateButton')).toBe('Calculate Route');
    });

    it('substitutes placeholders', () => {
        expect(t('errors.windUnavailable', { model: 'GFS' }))
            .toBe('Wind data unavailable for GFS.');
    });

    it('substitutes numeric placeholders via toString', () => {
        expect(t('routing.previewDirect', { nm: 42 }))
            .toBe('> 42 nm direct');
    });

    it('returns the raw key when the key is unknown', () => {
        // @ts-expect-error — deliberately invalid key
        expect(t('does.not.exist')).toBe('does.not.exist');
    });

    it('returns the raw key for a partial path that resolves to an object', () => {
        // @ts-expect-error — partial path is not a string value
        expect(t('routing')).toBe('routing');
    });

    it('falls back to English when the selected locale is missing a key', () => {
        // Register a partial locale — only one key defined. Missing keys must fall through to en.
        register('xx', { routing: { calculateButton: 'Calcular' } } as any);
        setLocale('xx');
        expect(t('routing.calculateButton')).toBe('Calcular');
        expect(t('routing.cancelButton')).toBe('Cancel'); // falls through to en
    });

    it('available() returns the list of registered locale codes', () => {
        const codes = available();
        for (const c of ['en', 'fr', 'de', 'es', 'it', 'nl', 'pt', 'cs', 'pl', 'sv', 'ru']) {
            expect(codes).toContain(c);
        }
    });
});

describe('locale key parity', () => {
    /** Collect every dotted leaf key from a nested object. */
    function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
        const keys: string[] = [];
        for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            if (v !== null && typeof v === 'object') {
                keys.push(...collectKeys(v as Record<string, unknown>, path));
            } else {
                keys.push(path);
            }
        }
        return keys.sort();
    }

    const expected = collectKeys(en as unknown as Record<string, unknown>);

    // Build fixture list lazily so the async imports resolve in test context
    const locales: [string, Record<string, unknown>][] = [];
    beforeEach(async () => {
        if (locales.length > 0) return;
        const mods = await Promise.all([
            import('../../src/i18n/fr').then(m => ['fr', m.fr]),
            import('../../src/i18n/de').then(m => ['de', m.de]),
            import('../../src/i18n/es').then(m => ['es', m.es]),
            import('../../src/i18n/it').then(m => ['it', m.it]),
            import('../../src/i18n/nl').then(m => ['nl', m.nl]),
            import('../../src/i18n/pt').then(m => ['pt', m.pt]),
            import('../../src/i18n/cs').then(m => ['cs', m.cs]),
            import('../../src/i18n/pl').then(m => ['pl', m.pl]),
            import('../../src/i18n/sv').then(m => ['sv', m.sv]),
            import('../../src/i18n/ru').then(m => ['ru', m.ru]),
        ]);
        for (const [code, dict] of mods as [string, Record<string, unknown>][]) {
            locales.push([code, dict]);
        }
    });

    it('every locale has the same key set as en', () => {
        for (const [code, dict] of locales) {
            const actual = collectKeys(dict);
            expect(actual, `${code} key parity`).toEqual(expected);
        }
    });

    it('every translation is a non-empty string', () => {
        for (const [code, dict] of locales) {
            const keys = collectKeys(dict);
            for (const path of keys) {
                const parts = path.split('.');
                let node: any = dict;
                for (const p of parts) node = node[p];
                expect(typeof node, `${code}:${path} type`).toBe('string');
                expect((node as string).length, `${code}:${path} non-empty`).toBeGreaterThan(0);
            }
        }
    });
});
