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

import { t, setLocale, available } from '../../src/i18n';

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
        // Simulate a fr locale with only one translated key
        setLocale('fr');
        // Because no fr.ts exists yet, every key falls through to en
        expect(t('routing.calculateButton')).toBe('Calculate Route');
    });

    it('available() returns the list of registered locale codes', () => {
        expect(available()).toContain('en');
    });
});
