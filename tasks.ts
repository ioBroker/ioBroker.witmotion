/*!
 * ioBroker tasks
 * Date: 2026-03-2
 *
 * Builds the tile of the devices app (src-devices -> admin/dm-widgets), the vis-2 widget set
 * (src-widgets -> widgets/witmotion) and the web component <iob-witmotion-orientation> for Aura, admin and every
 * other host (src-webcomponents -> admin/webcomponents). All of them use the views in src-shared.
 *
 * `--wc` builds the web component alone (`npm run build:wc`).
 *
 * Executed with `tsx` (see the scripts in package.json).
 */
import { existsSync } from 'node:fs';
import { deleteFoldersRecursive, npmInstall, buildReact, copyFiles } from '@iobroker/build-tools';

const SRC_DEVICES = 'src-devices/';
const SRC_VIS = 'src-widgets/';
const SRC_WC = 'src-webcomponents/';
const srcDevices = `${__dirname}/${SRC_DEVICES}`;
const srcVis = `${__dirname}/${SRC_VIS}`;
const srcWc = `${__dirname}/${SRC_WC}`;
/** Served as `/adapter/witmotion/webcomponents/`; must match `common.webComponents` in io-package.json */
const WC_DEST = 'admin/webcomponents';

function cleanWebComponents(): void {
    deleteFoldersRecursive(`${srcWc}build`);
    deleteFoldersRecursive(`${__dirname}/${WC_DEST}`);
}

function clean(): void {
    deleteFoldersRecursive(`${srcDevices}build`);
    deleteFoldersRecursive(`${__dirname}/admin/dm-widgets`);
    deleteFoldersRecursive(`${srcVis}build`);
    deleteFoldersRecursive(`${__dirname}/widgets`);
    cleanWebComponents();
}

/** The module, its manifest (written and checked by the Vite build) and the pictures it loads */
function copyWebComponents(): void {
    copyFiles([`${SRC_WC}build/*.js`, `${SRC_WC}build/*.json`], WC_DEST);
    copyFiles([`${SRC_WC}build/img/*.png`], `${WC_DEST}/img`);
}

function copyAllFiles(): void {
    copyFiles([`${SRC_DEVICES}build/customDevices.js`], `admin/dm-widgets`);
    copyFiles([`${SRC_DEVICES}build/assets/*.*`], `admin/dm-widgets/assets`);
    copyFiles([`${SRC_DEVICES}build/img/*`], `admin/dm-widgets/img`);
    copyFiles([`${SRC_DEVICES}img/witmotion.png`], `admin/dm-widgets`);

    // vis-2 reads mf-manifest.json next to the remote entry; `img` comes from `public/`
    copyFiles([`${SRC_VIS}build/customWidgets.js`, `${SRC_VIS}build/mf-manifest.json`], `widgets/witmotion`);
    copyFiles([`${SRC_VIS}build/assets/*.*`], `widgets/witmotion/assets`);
    copyFiles([`${SRC_VIS}build/img/*`], `widgets/witmotion/img`);

    copyWebComponents();
}

async function npmInstallAll(): Promise<void> {
    await npmInstall(srcDevices);
    await npmInstall(srcVis);
    await npmInstall(srcWc);
}

/** The Vite build of the web component fails if its manifest does not pass `checkManifest` */
async function buildWebComponents(): Promise<void> {
    await buildReact(srcWc, { rootDir: srcWc, vite: true });
}

async function buildAll(): Promise<void> {
    await buildReact(srcDevices, { rootDir: __dirname, vite: true });
    await buildReact(srcVis, { rootDir: __dirname, vite: true });
    await buildWebComponents();
}

/** The web component alone: clean, install if needed, build, copy */
async function webComponents(): Promise<void> {
    cleanWebComponents();
    if (!existsSync(`${srcWc}node_modules`)) {
        await npmInstall(srcWc);
    }
    await buildWebComponents();
    copyWebComponents();
}

if (process.argv.includes('--wc')) {
    webComponents().catch((e: unknown) => {
        console.error(`Cannot build the web component: ${e as Error}`);
        process.exit(2);
    });
} else if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstallAll().catch((e: unknown) => console.error(`Cannot install npm modules: ${e as Error}`));
} else if (process.argv.includes('--2-build')) {
    buildAll().catch((e: unknown) => console.error(`Cannot build: ${e as Error}`));
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else {
    clean();
    npmInstallAll()
        .then(() => buildAll())
        .then(() => copyAllFiles())
        .catch((e: unknown) => console.error(`Cannot build: ${e as Error}`));
}
