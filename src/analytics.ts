import { settingsStore } from './stores/SettingsStore';

const GA_ID = 'G-JJ4VC3LNC0';
const DISABLE_KEY = `ga-disable-${GA_ID}`;
let initialized = false;

// Isolated dataLayer to avoid conflicts with Windy's own gtag
(window as Record<string, unknown>).sailDataLayer =
    (window as Record<string, unknown>).sailDataLayer || [];

function sailGtag(): void {
    // Must push the `arguments` object, not a plain array — gtag.js requires this
    ((window as Record<string, unknown>).sailDataLayer as IArguments[]).push(arguments as unknown as IArguments);
}

/**
 * Analytics is opt-in. Returns true ONLY if the user has explicitly
 * enabled it. Missing / undefined / store-unavailable all → false, so a
 * fresh install never transmits telemetry until the user opts in.
 */
export function isAnalyticsEnabled(): boolean {
    try {
        return settingsStore.get('analyticsEnabled') === true;
    } catch {
        return false;
    }
}

function isEnabled(): boolean {
    return isAnalyticsEnabled();
}

export function initAnalytics(): void {
    if (initialized) return;
    initialized = true;

    if (!isEnabled()) {
        (window as Record<string, unknown>)[DISABLE_KEY] = true;
        return;
    }

    sailGtag('js' as never, new Date() as never);
    sailGtag('config' as never, GA_ID as never);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}&l=sailDataLayer`;
    document.head.appendChild(script);
}

export function trackEvent(name: string, params?: Record<string, string | number>): void {
    if (!isEnabled()) return;
    sailGtag('event' as never, name as never, params as never);
}

/**
 * Called by the Settings UI when the user toggles analytics off mid-session.
 * Sets the GA kill-switch so any already-loaded gtag script sends nothing more.
 */
export function applyAnalyticsOptOut(): void {
    (window as Record<string, unknown>)[DISABLE_KEY] = true;
}
