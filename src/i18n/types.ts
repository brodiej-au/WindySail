import type { en } from './en';

/**
 * Widen a const-asserted dictionary so string literals become plain `string`
 * while the key structure is preserved. Lets non-English locales satisfy the
 * same shape without being forced to reuse the English literal values.
 */
type DeepStringify<T> = T extends object
    ? { [K in keyof T]: DeepStringify<T[K]> }
    : string;

/**
 * The canonical shape of a locale dictionary — derived from the English source.
 * Additional locale files use `satisfies Translations` so TypeScript flags any
 * missing key.
 */
export type Translations = DeepStringify<typeof en>;

type Path<T, P extends string = ''> =
    T extends Record<string, unknown>
        ? { [K in keyof T & string]: Path<T[K], P extends '' ? K : `${P}.${K}`> }[keyof T & string]
        : P;

/**
 * All valid dotted key paths (e.g. 'routing.calculateButton'). Produced by
 * recursive type inspection of Translations.
 */
export type TranslationKey = Path<Translations>;
