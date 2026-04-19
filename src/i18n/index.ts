import { readable } from 'svelte/store';
import store from '@windy/store';
import { en } from './en';
import type { Translations, TranslationKey } from './types';

const FALLBACK: Translations = en;

const REGISTERED: Record<string, Translations> = {
    en,
};

let currentLocale: string = 'en';

export function setLocale(code: string): void {
    currentLocale = code;
}

export function available(): string[] {
    return Object.keys(REGISTERED);
}

/**
 * Register a locale dictionary at runtime. Call once per locale at module load.
 */
export function register(code: string, dict: Translations): void {
    REGISTERED[code] = dict;
}

function resolve(dict: Translations, key: string): string | undefined {
    const parts = key.split('.');
    let node: any = dict;
    for (const p of parts) {
        if (node == null || typeof node !== 'object') return undefined;
        node = node[p];
    }
    return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name) => {
        const v = params[name];
        return v == null ? `{${name}}` : String(v);
    });
}

export function t(key: TranslationKey, params?: Record<string, string | number>): string {
    const dict = REGISTERED[currentLocale] ?? FALLBACK;
    const primary = resolve(dict, key as string);
    if (primary != null) return interpolate(primary, params);
    const fallback = resolve(FALLBACK, key as string);
    if (fallback != null) return interpolate(fallback, params);
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn(`[i18n] Unknown key: ${key}`);
    }
    return key as string;
}

/**
 * Reactive store that triggers re-renders in Svelte components on locale change.
 * Subscribes to Windy's store.on('usedLang', ...) to reflect user language changes.
 */
export const locale = readable<string>('en', set => {
    const initial = (store.get('usedLang') as string) ?? 'en';
    currentLocale = initial;
    set(initial);
    const handler = (val: string) => {
        currentLocale = val ?? 'en';
        set(currentLocale);
    };
    try {
        (store as any).on('usedLang', handler);
    } catch {
        // store.on may not be available in tests
    }
    return () => {
        try { (store as any).off?.('usedLang', handler); } catch {}
    };
});
