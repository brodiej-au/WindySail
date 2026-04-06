import type { ExternalPluginConfig } from '@windy/interfaces';

const config: ExternalPluginConfig = {
    name: 'windy-plugin-sail-router',
    version: '0.1.0',
    icon: '⛵',
    title: 'Sail Router',
    description:
        'Weather routing for sailing with multi-model comparison. ' +
        'Computes optimal routes using boat polars, wind forecasts, ' +
        'ocean currents, and land avoidance.',
    author: 'Brodie (appd.com.au)',
    repository: '',
    desktopUI: 'rhpane',
    mobileUI: 'fullscreen',
    routerPath: '/sail-router/:lat?/:lon?',
    listenToSingleclick: true,
    private: true,
};

export default config;
