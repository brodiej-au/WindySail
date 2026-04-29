import { readable } from 'svelte/store';

const MOBILE_QUERY = '(max-width: 600px)';

export const isMobile = readable<boolean>(false, set => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    set(mql.matches);
    const handler = (e: MediaQueryListEvent) => set(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
});
