import react from '@vitejs/plugin-react';
import { checkManifest, getReactImportPath, REACT_SPECIFIERS, type WebComponentText } from '@iobroker/web-components';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import type { Plugin } from 'vite';

// with the extension: Vite may load its config natively, without a bundler that would add it
import { IMAGE_FOLDER, MODULE_FILE, VIEW_WORDS } from './src/constants.ts';
import { buildManifest, MANIFEST_FILE, MANIFEST_WORDS, MODULE_PATH, type NativeWidget } from './src/manifest.ts';

/**
 * The web component `<iob-witmotion-orientation>`: one ES module, `admin/webcomponents/witmotion-orientation.js`, and
 * its manifest `witmotion-orientation.json` next to it (`common.webComponents`). Every host - vis-2, devices, Aura,
 * admin - reads them from `/adapter/witmotion/webcomponents/`. No module federation: the host shares nothing but the
 * socket.
 *
 * React is not bundled: the four React imports - also those of the shared views in `../src-shared` - point at
 * `lib/esm/react-19.js`, which web and admin serve beside `adapter/`. The path is relative to the module, so a path
 * prefix of a reverse proxy stays.
 *
 * The pictures of the boat and the car (`src-shared/assets`, about 1 MB) are not inlined either: they are copied
 * into `img/` next to the module and loaded from there, relative to the module - only the one that is shown.
 *
 * The words come from the files of the adapter: the labels of the settings and the words of the views from
 * `src-shared/i18n`, the name from the tile of the devices app in `io-package.json`.
 */

const LANGUAGES = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'];

/** The prefix of the keys in `src-shared/i18n` */
const PREFIX = 'wit_';

/**
 * Some words of `src-shared/i18n` in every language, without the prefix
 *
 * @param keys the words without the prefix
 */
function pickWords(keys: readonly string[]): Record<string, Record<string, string>> {
    const picked: Record<string, Record<string, string>> = {};
    for (const lang of LANGUAGES) {
        const dictionary = JSON.parse(
            readFileSync(new URL(`../src-shared/i18n/${lang}.json`, import.meta.url), 'utf8'),
        ) as Record<string, string>;
        picked[lang] = {};
        for (const key of keys) {
            if (dictionary[`${PREFIX}${key}`]) {
                picked[lang][key] = dictionary[`${PREFIX}${key}`];
            }
        }
    }
    return picked;
}

/** The tile of the devices app: the web component has its name, so devices offers the tile only */
function readNativeWidget(): NativeWidget {
    const ioPackage = JSON.parse(readFileSync(new URL('../io-package.json', import.meta.url), 'utf8')) as {
        common: {
            deviceWidgets?: { components?: { name: string; label: WebComponentText }[] };
        };
    };
    const tile = ioPackage.common.deviceWidgets?.components?.find(c => c.name === 'WitMotionComponent');
    if (!tile?.label) {
        throw new Error('io-package.json has no tile WitMotionComponent in common.deviceWidgets');
    }
    return { label: tile.label };
}

/** Writes `witmotion-orientation.json` next to the module, checked like a host checks it */
function manifestFile(): Plugin {
    return {
        name: 'witmotion-web-component-manifest',
        generateBundle() {
            const picked = pickWords(MANIFEST_WORDS);
            const manifest = buildManifest(key => {
                const all: Record<string, string> = {};
                for (const lang of LANGUAGES) {
                    if (picked[lang][key]) {
                        all[lang] = picked[lang][key];
                    }
                }
                if (!all.en) {
                    this.error(`The word "${key}" of the manifest has no English text`);
                }
                return all as WebComponentText;
            }, readNativeWidget());
            const problem = checkManifest(manifest);
            if (problem) {
                this.error(`${MANIFEST_FILE}: ${problem}`);
            }
            this.emitFile({
                type: 'asset',
                fileName: MANIFEST_FILE,
                source: `${JSON.stringify(manifest, null, 4)}\n`,
            });
        },
    };
}

/**
 * The pictures of `src-shared/assets`: copied into `img/` next to the module, and imported as their URL relative to
 * the module. Library mode would inline them as `data:` URLs - a module of 1.5 MB, loaded even for the compass.
 *
 * `import.meta.url` is taken through a variable, so the `new URL(..., import.meta.url)` of Vite does not look for
 * the file at build time.
 */
function sharedPictures(): Plugin {
    return {
        name: 'witmotion-shared-pictures',
        enforce: 'pre',
        load(id) {
            const file = id.split('?')[0];
            if (!/[\\/]src-shared[\\/]assets[\\/][^\\/]+\.png$/.test(file)) {
                return null;
            }
            const fileName = `${IMAGE_FOLDER}/${basename(file)}`;
            this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
            return `const moduleUrl = import.meta.url;\nexport default new URL(${JSON.stringify(fileName)}, moduleUrl).href;\n`;
        },
    };
}

const reactImport = getReactImportPath(MODULE_PATH);

export default {
    plugins: [sharedPictures(), react(), manifestFile()],
    define: {
        __WIT_WORDS__: JSON.stringify(pickWords(VIEW_WORDS)),
        'process.env.NODE_ENV': JSON.stringify('production'),
    },
    build: {
        target: 'es2022',
        outDir: './build',
        emptyOutDir: true,
        lib: {
            entry: './src/index.tsx',
            formats: ['es'],
            fileName: (): string => MODULE_FILE,
        },
        rollupOptions: {
            external: [...REACT_SPECIFIERS],
            output: {
                paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
                // one file: a host imports exactly one URL
                codeSplitting: false,
                // library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
                minify: true,
            },
        },
    },
};
