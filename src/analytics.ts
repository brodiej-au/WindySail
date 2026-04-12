const GA_ID = 'G-JJ4VC3LNC0';
let initialized = false;

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag: (...args: unknown[]) => void;
    }
}

export function initAnalytics(): void {
    if (initialized) return;
    initialized = true;

    // Initialize dataLayer and gtag function
    window.dataLayer = window.dataLayer || [];
    window.gtag = function (...args: unknown[]) {
        window.dataLayer.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);

    // Inject gtag.js script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
}

export function trackEvent(name: string, params?: Record<string, string | number>): void {
    if (typeof window.gtag === 'function') {
        window.gtag('event', name, params);
    }
}
