const GA_ID = 'G-JJ4VC3LNC0';
let initialized = false;

// Isolated dataLayer to avoid conflicts with Windy's own gtag
(window as Record<string, unknown>).sailDataLayer =
    (window as Record<string, unknown>).sailDataLayer || [];

function sailGtag(): void {
    // Must push the `arguments` object, not a plain array — gtag.js requires this
    ((window as Record<string, unknown>).sailDataLayer as IArguments[]).push(arguments as unknown as IArguments);
}

export function initAnalytics(): void {
    if (initialized) return;
    initialized = true;

    sailGtag('js' as never, new Date() as never);
    sailGtag('config' as never, GA_ID as never);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}&l=sailDataLayer`;
    document.head.appendChild(script);
}

export function trackEvent(name: string, params?: Record<string, string | number>): void {
    sailGtag('event' as never, name as never, params as never);
}
