import type { ExternalPluginConfig } from '@windy/interfaces';

// Title/description are read by Windy before Svelte initialises — they use the
// English strings by necessity. Runtime UI (headers etc.) reads `t('plugin.title')`.
//
// NOTE: Windy's devtools parse this file with regex + eval, so imports aren't
// resolved here — `version` must be a literal. Keep it in sync with package.json.
// The runtime footer reads package.json directly (via pluginConfig consumers).
const config: ExternalPluginConfig = {
    name: 'windy-plugin-sail-router',
    version: '0.4.0',
    icon: '⛵',
    title: 'Sail Router',
    description:
        'Weather routing for sailing with multi-model comparison. ' +
        'Computes optimal routes using boat polars, wind forecasts, ' +
        'ocean currents, and land avoidance.',
    author: 'Brodie (appd.com.au)',
    repository: 'https://github.com/brodiej-au/WindySail',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/sail-router/:lat?/:lon?',
    listenToSingleclick: true,
    addToContextmenu: true,
    private: false,
};

export default config;
