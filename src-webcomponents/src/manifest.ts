/**
 * The manifest of `<iob-witmotion-orientation>`.
 *
 * Run by the build only (`vite.config.ts`), which writes it as `witmotion-orientation.json` next to the module - a
 * host reads that file for its palette and its settings without loading the module. The words come from the files
 * of the adapter, so they are the same as in the native widgets:
 *
 * - `name` is the label of the tile of the devices app (`common.deviceWidgets` in io-package.json). devices hides a
 *   web component whose adapter brings a native widget of the same name, so it shows its own tile and Aura the web
 *   component.
 * - The description and the labels of the settings are those of the vis-2 widget (`src-shared/i18n`).
 */
import type { WebComponentManifest, WebComponentText } from '@iobroker/web-components';

// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import { AXES, ICON_TYPES, LAYOUTS, MODULE_FILE, TAG, VALUE_MODES, VIEWS } from './constants.ts';

export { MANIFEST_FILE, MODULE_PATH, TAG } from './constants.ts';

/** The labels of the options in `src-shared/i18n`, without the prefix `wit_` */
const AXIS_WORDS: Record<(typeof AXES)[number], string> = { x: 'X (Roll)', y: 'Y (Pitch)', z: 'Z (Yaw)' };
const VIEW_LABELS: Record<(typeof VIEWS)[number], string> = { side: 'Side', top: 'Top', back: 'Back' };
const ICON_WORDS: Record<(typeof ICON_TYPES)[number], string> = { boat: 'Boat', car: 'Car', custom: 'Custom' };
const VALUE_MODE_WORDS: Record<(typeof VALUE_MODES)[number], string> = { instant: 'Instant', average: 'Average' };

/** The words of `src-shared/i18n` the manifest uses, without the prefix `wit_` */
export const MANIFEST_WORDS = [
    'widget_help',
    'Instance',
    'Instance help',
    'Value mode',
    'Name',
    'Layout',
    'Open dialog',
    'Icon',
    'Icon top',
    'Icon side',
    'Primary axis',
    'Primary view',
    'Visual multiplier',
    'Multiplier help',
    'Secondary axis',
    'Secondary view',
    'Visual multiplier 2',
    'None',
    ...LAYOUTS.map(layout => `layout_${layout}`),
    ...Object.values(AXIS_WORDS),
    ...Object.values(VIEW_LABELS),
    ...Object.values(ICON_WORDS),
    ...Object.values(VALUE_MODE_WORDS),
];

/** A word the vis-2 widget does not have: the help of the custom pictures */
const ICON_URL_HELP: WebComponentText = {
    en: 'Address of the picture, e.g. /vis-2.0/main/img/boat.png or https://...',
    de: 'Adresse des Bildes, z. B. /vis-2.0/main/img/boat.png oder https://...',
    ru: 'Адрес изображения, например /vis-2.0/main/img/boat.png или https://...',
    pt: 'Endereço da imagem, p. ex. /vis-2.0/main/img/boat.png ou https://...',
    nl: 'Adres van de afbeelding, bijv. /vis-2.0/main/img/boat.png of https://...',
    fr: "Adresse de l'image, p. ex. /vis-2.0/main/img/boat.png ou https://...",
    it: "Indirizzo dell'immagine, ad es. /vis-2.0/main/img/boat.png o https://...",
    es: 'Dirección de la imagen, p. ej. /vis-2.0/main/img/boat.png o https://...',
    pl: 'Adres obrazu, np. /vis-2.0/main/img/boat.png lub https://...',
    uk: 'Адреса зображення, наприклад /vis-2.0/main/img/boat.png або https://...',
    'zh-cn': '图片地址，例如 /vis-2.0/main/img/boat.png 或 https://...',
};

/** What the manifest takes over from the tile of the devices app */
export interface NativeWidget {
    label: WebComponentText;
}

/**
 * The manifest with the words of the adapter
 *
 * @param word a word of `MANIFEST_WORDS` in all languages
 * @param native the tile of the devices app
 */
export function buildManifest(word: (key: string) => WebComponentText, native: NativeWidget): WebComponentManifest {
    const axisOptions = AXES.map(axis => ({ value: axis, label: word(AXIS_WORDS[axis]) }));
    const viewOptions = VIEWS.map(view => ({ value: view, label: word(VIEW_LABELS[view]) }));

    return {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1,
        tag: TAG,
        name: native.label,
        description: word('widget_help'),
        // relative to this file: /adapter/witmotion/witmotion.png
        icon: '../witmotion.png',
        module: MODULE_FILE,
        // a 2x1 tile: one axis with its value, or both axes side by side
        size: { width: 300, height: 150 },
        settings: {
            type: 'panel',
            items: {
                instance: {
                    type: 'instance',
                    adapter: 'witmotion',
                    label: word('Instance'),
                    help: word('Instance help'),
                    default: 'witmotion.0',
                },
                valueMode: {
                    type: 'select',
                    label: word('Value mode'),
                    options: VALUE_MODES.map(mode => ({ value: mode, label: word(VALUE_MODE_WORDS[mode]) })),
                    default: 'instant',
                },
                name: {
                    type: 'text',
                    label: word('Name'),
                },
                layout: {
                    type: 'select',
                    label: word('Layout'),
                    options: LAYOUTS.map(layout => ({ value: layout, label: word(`layout_${layout}`) })),
                    default: 'auto',
                },
                openDialog: {
                    type: 'checkbox',
                    label: word('Open dialog'),
                    default: true,
                },
                dividerIcon: {
                    type: 'divider',
                },
                iconType: {
                    type: 'select',
                    label: word('Icon'),
                    options: ICON_TYPES.map(icon => ({ value: icon, label: word(ICON_WORDS[icon]) })),
                    default: 'boat',
                },
                icon1: {
                    type: 'text',
                    label: word('Icon top'),
                    help: ICON_URL_HELP,
                    hidden: "data.iconType !== 'custom'",
                },
                icon2: {
                    type: 'text',
                    label: word('Icon side'),
                    help: ICON_URL_HELP,
                    hidden: "data.iconType !== 'custom' || !data.axis2",
                },
                dividerAxes: {
                    type: 'divider',
                },
                axis1: {
                    type: 'select',
                    label: word('Primary axis'),
                    options: axisOptions,
                    default: 'x',
                },
                view1: {
                    type: 'select',
                    label: word('Primary view'),
                    options: viewOptions,
                    default: 'side',
                },
                multiplier1: {
                    type: 'number',
                    label: word('Visual multiplier'),
                    help: word('Multiplier help'),
                    min: 0.1,
                    max: 50,
                    step: 0.1,
                    default: 1,
                },
                axis2: {
                    type: 'select',
                    label: word('Secondary axis'),
                    options: [{ value: '', label: word('None') }, ...axisOptions],
                    default: '',
                },
                view2: {
                    type: 'select',
                    label: word('Secondary view'),
                    options: viewOptions,
                    default: 'back',
                    hidden: '!data.axis2',
                },
                multiplier2: {
                    type: 'number',
                    label: word('Visual multiplier 2'),
                    help: word('Multiplier help'),
                    min: 0.1,
                    max: 50,
                    step: 0.1,
                    default: 1,
                    hidden: '!data.axis2',
                },
            },
        },
    };
}
