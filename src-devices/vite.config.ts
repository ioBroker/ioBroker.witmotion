import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/dm-widgets/modulefederation.devices.config';
import pack from './package.json';

/**
 * The tile of the devices app.
 *
 * The views come from `../src-shared` and are the same as in the vis-2 widget. They resolve `react` from
 * this project (see `dedupe`), as they have no `node_modules` of their own.
 */
const dir = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const config = {
    plugins: [
        federation({
            manifest: true,
            name: 'DevicesWidgetWitMotionSet',
            filename: 'customDevices.js',
            exposes: {
                './Components': './src/Components.tsx',
                './translations': './src/translations',
            },
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
        commonjs(),
    ],
    resolve: {
        tsconfigPaths: true,
        dedupe: ['react', 'react-dom'],
    },
    server: {
        port: 3000,
        fs: {
            allow: [dir('..')],
        },
        proxy: {
            '/files': 'http://localhost:8081',
            '/adapter': 'http://localhost:8081',
            '/session': 'http://localhost:8081',
            '/log': 'http://localhost:8081',
            '/lib': 'http://localhost:8081',
        },
    },
    base: './',
    build: {
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                // Suppress "Module level directives cause errors when bundled" warnings
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
