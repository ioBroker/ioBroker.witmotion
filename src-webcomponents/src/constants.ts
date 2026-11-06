/**
 * What the module, the manifest and the build of `<iob-witmotion-orientation>` share.
 *
 * Imported by `vite.config.ts` too, so it imports nothing but types.
 */
// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import type { AxisType, IconType, OrientationSettings, ValueMode, ViewType } from '../../src-shared/orientation.ts';

/** Tag of the custom element; a host checks that the module defines exactly this one */
export const TAG = 'iob-witmotion-orientation';

/** The built module, next to its manifest */
export const MODULE_FILE = 'witmotion-orientation.js';

/** The manifest the build writes next to the module; `common.webComponents` names this one */
export const MANIFEST_FILE = 'witmotion-orientation.json';

/** Where `tasks.ts` puts the module in the admin folder; the React import is relative to it */
export const MODULE_PATH = `webcomponents/${MODULE_FILE}`;

/** The folder next to the module with the pictures of the boat and the car, see `vite.config.ts` */
export const IMAGE_FOLDER = 'img';

/** How the orientation is drawn: by the size of the box, or one of the views */
export type Layout = 'auto' | 'compact' | 'bar' | 'wide' | 'full';

export const LAYOUTS: readonly Layout[] = ['auto', 'compact', 'bar', 'wide', 'full'];

export const AXES: readonly AxisType[] = ['x', 'y', 'z'];

export const VIEWS: readonly ViewType[] = ['side', 'top', 'back'];

export const ICON_TYPES: readonly IconType[] = ['boat', 'car', 'custom'];

export const VALUE_MODES: readonly ValueMode[] = ['instant', 'average'];

/** The values of the settings of the manifest; a setting without a value is missing */
export type OrientationElementSettings = {
    [name: string]: string | number | boolean | undefined;
    /** The instance of the adapter, e.g. `witmotion.0` */
    instance?: string;
    /** `instant` or `average` (the `...Avg` states) */
    valueMode?: string;
    /** Shown below or next to the values; nothing if empty */
    name?: string;
    layout?: string;
    /** Open the big view in a dialog on a click; true if missing */
    openDialog?: boolean;
    iconType?: string;
    /** URL of the picture of the primary axis, for `iconType` `custom` */
    icon1?: string;
    /** URL of the picture of the secondary axis, for `iconType` `custom` */
    icon2?: string;
    axis1?: string;
    view1?: string;
    multiplier1?: number;
    /** Empty: no secondary axis */
    axis2?: string;
    view2?: string;
    multiplier2?: number;
};

/** The words of `src-shared/i18n` the element shows, without the prefix `wit_` */
export const VIEW_WORDS = ['widget_label'] as const;

export type ViewWord = (typeof VIEW_WORDS)[number];

/**
 * The instance of the adapter for the value of the setting
 *
 * @param value `witmotion.0`, or `system.adapter.witmotion.0`
 * @returns `witmotion.0`, or null if it is no instance of the adapter
 */
export function getInstance(value: string | undefined): string | null {
    const match = value?.trim().match(/^(?:system\.adapter\.)?(witmotion\.\d+)$/);
    return match ? match[1] : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
}

function toMultiplier(value: unknown): number {
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(num) && num > 0 ? num : 1;
}

/**
 * The settings of the shared views for the settings of the element, with the defaults of the native widgets
 *
 * @param settings the settings of the element
 */
export function toOrientationSettings(settings: OrientationElementSettings): Required<OrientationSettings> {
    return {
        iconType: oneOf(settings.iconType, ICON_TYPES, 'boat'),
        axis1: oneOf(settings.axis1, AXES, 'x'),
        view1: oneOf(settings.view1, VIEWS, 'side'),
        multiplier1: toMultiplier(settings.multiplier1),
        icon1: settings.icon1 || '',
        axis2: oneOf<AxisType | ''>(settings.axis2, AXES, ''),
        view2: oneOf(settings.view2, VIEWS, 'back'),
        multiplier2: toMultiplier(settings.multiplier2),
        icon2: settings.icon2 || '',
    };
}

/**
 * Instant values or averages
 *
 * @param value the setting
 */
export function toValueMode(value: string | undefined): ValueMode {
    return oneOf(value, VALUE_MODES, 'instant');
}
