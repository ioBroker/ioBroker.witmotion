import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config';
import pack from './package.json';

/**
 * vis-2 widget set of the WitMotion adapter.
 *
 * The views come from `../src-shared` and are the same as in the tile of the devices app. vis-2 shares
 * React and MUI as singletons; `dedupe` makes the shared views, which have no `node_modules` of their
 * own, resolve `react` from this project.
 */
const dir = (relative: string): string => fileURLToPath(new URL(relative, import.meta.url));

const config = {
    plugins: [
        federation({
            manifest: true,
            name: 'vis2WitMotionWidgets',
            filename: 'customWidgets.js',
            exposes: {
                './WitMotionOrientation': './src/WitMotionOrientation.tsx',
                './translations': './src/translations',
            },
            remotes: {},
            shared: moduleFederationShared(pack),
            dts: false,
        }),
        react(),
    ],
    resolve: {
        dedupe: ['react', 'react-dom', '@mui/material', '@emotion/react', '@emotion/styled'],
    },
    server: {
        fs: {
            allow: [dir('..')],
        },
    },
    base: './',
    build: {
        // Top-level await, emitted by the federation plugin, needs chrome89+
        target: 'chrome89',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
};

export default config;
