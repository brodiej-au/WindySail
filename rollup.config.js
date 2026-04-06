import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

import serve from 'rollup-plugin-serve';
import rollupSvelte from 'rollup-plugin-svelte';
import rollupSwc from 'rollup-plugin-swc3';
import rollupCleanup from 'rollup-plugin-cleanup';

import { less } from 'svelte-preprocess-less';
import sveltePreprocess from 'svelte-preprocess';

import { transformCodeToESMPlugin, keyPEM, certificatePEM } from '@windycom/plugin-devtools';

const useSourceMaps = true;

const isServe = process.env.SERVE !== 'false';

// Main plugin bundle
const pluginConfig = {
    input: 'src/plugin.svelte',
    output: [
        {
            file: 'dist/plugin.js',
            format: 'module',
            sourcemap: true,
        },
        {
            file: 'dist/plugin.min.js',
            format: 'module',
            plugins: [rollupCleanup({ comments: 'none', extensions: ['ts'] }), terser()],
        },
    ],
    onwarn: () => {},
    external: id => id.startsWith('@windy/'),
    watch: {
        include: ['src/**'],
        exclude: ['node_modules/**', 'src/worker/**'],
        clearScreen: false,
    },
    plugins: [
        rollupSvelte({
            emitCss: false,
            preprocess: {
                style: less({
                    sourceMap: false,
                    math: 'always',
                }),
                script: data => {
                    const preprocessed = sveltePreprocess({ sourceMap: useSourceMaps });
                    return preprocessed.script(data);
                },
            },
        }),
        rollupSwc({
            include: ['**/*.ts', '**/*.svelte'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            mainFields: ['module', 'jsnext:main', 'main'],
            preferBuiltins: false,
            dedupe: ['svelte'],
        }),
        commonjs(),
        transformCodeToESMPlugin(),
        isServe &&
            serve({
                contentBase: 'dist',
                host: '0.0.0.0',
                port: 9999,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                },
                https: {
                    key: keyPEM,
                    cert: certificatePEM,
                },
            }),
    ],
};

// Worker bundle (IIFE, self-contained, no external deps)
const workerConfig = {
    input: 'src/worker/router.worker.ts',
    output: [
        {
            file: 'dist/router.worker.js',
            format: 'iife',
            sourcemap: true,
        },
    ],
    onwarn: () => {},
    watch: {
        include: ['src/worker/**', 'src/routing/**'],
        clearScreen: false,
    },
    plugins: [
        rollupSwc({
            include: ['**/*.ts'],
            sourceMaps: useSourceMaps,
        }),
        resolve({
            browser: true,
            preferBuiltins: false,
        }),
        commonjs(),
    ],
};

export default [pluginConfig, workerConfig];
