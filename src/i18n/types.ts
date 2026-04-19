import type { en } from './en';

/**
 * The canonical shape of a locale dictionary — derived from the English source.
 * Additional locale files use `satisfies Translations` so TypeScript flags any
 * missing key.
 */
export type Translations = typeof en;

type Path<T, P extends string = ''> =
    T extends Record<string, unknown>
        ? { [K in keyof T & string]: Path<T[K], P extends '' ? K : `${P}.${K}`> }[keyof T & string]
        : P;

/**
 * All valid dotted key paths (e.g. 'routing.calculateButton'). Produced by
 * recursive type inspection of Translations.
 */
export type TranslationKey = Path<Translations>;
