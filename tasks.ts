/*!
 * ioBroker tasks
 * Date: 2026-03-2
 *
 * Builds the tile of the devices app (src-devices -> admin/dm-widgets) and the vis-2 widget set
 * (src-widgets -> widgets/witmotion). Both use the views in src-shared.
 *
 * Executed with `tsx` (see the scripts in package.json).
 */
import { deleteFoldersRecursive, npmInstall, buildReact, copyFiles } from '@iobroker/build-tools';

const SRC_DEVICES = 'src-devices/';
const SRC_VIS = 'src-widgets/';
const srcDevices = `${__dirname}/${SRC_DEVICES}`;
const srcVis = `${__dirname}/${SRC_VIS}`;

function clean(): void {
    deleteFoldersRecursive(`${srcDevices}build`);
    deleteFoldersRecursive(`${__dirname}/admin/dm-widgets`);
    deleteFoldersRecursive(`${srcVis}build`);
    deleteFoldersRecursive(`${__dirname}/widgets`);
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
}

async function npmInstallAll(): Promise<void> {
    await npmInstall(srcDevices);
    await npmInstall(srcVis);
}

async function buildAll(): Promise<void> {
    await buildReact(srcDevices, { rootDir: __dirname, vite: true });
    await buildReact(srcVis, { rootDir: __dirname, vite: true });
}

if (process.argv.includes('--0-clean')) {
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
