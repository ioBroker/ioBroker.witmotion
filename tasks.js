/*!
 * ioBroker tasks
 * Date: 2026-03-2
 */
'use strict';

const { deleteFoldersRecursive, npmInstall, buildReact, copyFiles } = require('@iobroker/build-tools');

const SRC = 'src-devices/';
const src = `${__dirname}/${SRC}`;

function clean() {
    deleteFoldersRecursive(`${src}build`);
    deleteFoldersRecursive(`${__dirname}/www`);
    deleteFoldersRecursive(`${__dirname}/admin/dm-widgets`);
}

function copyAllFiles() {
    copyFiles([`${SRC}build/customDevices.js`], `www`);
    copyFiles([`${SRC}build/assets/*.*`], `www/assets`);
    copyFiles([`${SRC}build/img/*`], `www/img`);
    copyFiles([`${SRC}img/witmotion.png`], `www`);
    copyFiles([`${SRC}build/customDevices.js`], `admin/dm-widgets`);
    copyFiles([`${SRC}build/assets/*.*`], `admin/dm-widgets/assets`);
    copyFiles([`${SRC}build/img/*`], `admin/dm-widgets/img`);
    copyFiles([`${SRC}img/witmotion.png`], `admin/dm-widgets`);
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(src).catch(e => console.error(`Cannot install npm modules: ${e}`));
} else if (process.argv.includes('--2-build')) {
    buildReact(src, { rootDir: __dirname, vite: true }).catch(e => console.error(`Cannot build: ${e}`));
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else {
    clean();
    npmInstall(src)
        .then(() => buildReact(src, { rootDir: __dirname, vite: true }))
        .then(() => copyAllFiles())
        .catch(e => console.error(`Cannot build: ${e}`));
}
