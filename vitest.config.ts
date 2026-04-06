import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@windy/interfaces': './tests/__mocks__/windy.ts',
        },
    },
});
