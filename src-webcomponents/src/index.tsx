/**
 * The orientation of a WitMotion sensor as a web component: `<iob-witmotion-orientation>`.
 *
 * One module for every host - vis-2, devices, Aura, admin (`@iobroker/web-components`). Its manifest is a file of
 * its own (`witmotion-orientation.json`, written by the build from `manifest.ts`), so a host loads this module only
 * when it shows the element. The host sets `socket` and `settings`, and if it has them `theme`, `editMode` and
 * `dialogs`.
 *
 * The element shows what the vis-2 widget and the tile of the devices app show, with the same pictures
 * (`src-shared/OrientationView.tsx`): a boat, a car or a custom picture tilted by the angle of one or two axes, or a
 * compass for the top view. It reads the states `witmotion.<n>.angle.<axis>` (or `...Avg`) and writes nothing. A
 * click on the smaller views opens the big view in a dialog the host frames.
 *
 * React is not in the module: it comes from `lib/esm/react-19.js` beside `adapter/`, see `vite.config.ts`.
 */
import { createRoot, type Root } from 'react-dom/client';

import { DIALOG_CLOSE_EVENT } from '@iobroker/web-components';
import { defineWebComponent, getThemeCssVariables, IobWebComponent } from '@iobroker/web-components/element';

import { getAngleStateId, toAngle } from '../../src-shared/orientation';
import {
    getInstance,
    LAYOUTS,
    TAG,
    toOrientationSettings,
    toValueMode,
    type Layout,
    type OrientationElementSettings,
} from './constants';
import { getHint, getWord } from './i18n';
import { getViewClass, Hint, OrientationViewOf, OrientationWidget, type OrientationData } from './OrientationWidget';
import { DIALOG_STYLES, STYLES } from './styles';

/** Its `isFloatComma` is the decimal separator of the system */
const SYSTEM_CONFIG = 'system.config';

/** The open dialog with the big view */
interface Details {
    content: HTMLElement;
    root: Root;
}

/** The states of the primary and, if chosen, the secondary axis */
interface AngleIds {
    id1: string;
    id2: string | null;
}

/**
 * The states the element shows for its settings
 *
 * @param settings the settings of the element
 * @returns null while no instance of the adapter is chosen
 */
function getAngleIds(settings: OrientationElementSettings): AngleIds | null {
    const instance = getInstance(settings.instance);
    if (!instance) {
        return null;
    }
    const { axis1, axis2 } = toOrientationSettings(settings);
    const mode = toValueMode(settings.valueMode);
    return {
        id1: getAngleStateId(instance, axis1, mode),
        id2: axis2 ? getAngleStateId(instance, axis2, mode) : null,
    };
}

class WitMotionOrientationElement extends IobWebComponent<OrientationElementSettings> {
    readonly #mount: HTMLDivElement;

    #root: Root | null = null;

    #details: Details | null = null;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = STYLES;
        this.#mount = document.createElement('div');
        this.#mount.className = 'mount';
        shadow.append(style, this.#mount);
    }

    override disconnectedCallback(): void {
        super.disconnectedCallback();
        // a host that only moves the element connects it again in the same task: keep React and the dialog then
        queueMicrotask(() => {
            if (!this.isConnected) {
                this.#closeDetails();
                this.#root?.unmount();
                this.#root = null;
            }
        });
    }

    protected override getStateIds(settings: OrientationElementSettings): (string | null)[] {
        const ids = getAngleIds(settings);
        return ids ? [ids.id1, ids.id2] : [];
    }

    protected override getObjectIds(settings: OrientationElementSettings): string[] {
        // the system for its decimal separator
        return getInstance(settings.instance) ? [SYSTEM_CONFIG] : [];
    }

    /** What the views show, from the subscribed states */
    #getData(ids: AngleIds): OrientationData {
        const config = this.objects[SYSTEM_CONFIG] as ioBroker.SystemConfigObject | null | undefined;
        return {
            settings: toOrientationSettings(this.settings),
            values: {
                angle1: toAngle(this.states[ids.id1]?.val),
                angle2: ids.id2 ? toAngle(this.states[ids.id2]?.val) : null,
            },
            name: this.settings.name || '',
            isFloatComma: !!config?.common?.isFloatComma,
        };
    }

    protected override render(): void {
        this.#root ||= createRoot(this.#mount);
        const settings = this.settings;
        const ids = getAngleIds(settings);
        if (!ids) {
            this.#closeDetails();
            this.#root.render(<Hint text={getHint(this.systemLang, 'chooseInstance')} />);
            return;
        }
        // `null`: the object was read and is not there - the instance writes no angles
        if (this.objects[ids.id1] === null) {
            this.#closeDetails();
            this.#root.render(
                <Hint
                    text={getHint(this.systemLang, 'noAngles')}
                    warning
                />,
            );
            return;
        }

        const data = this.#getData(ids);
        const layout = LAYOUTS.includes(settings.layout as Layout) ? (settings.layout as Layout) : 'auto';
        const clickable = !this.editMode && settings.openDialog !== false;
        this.#root.render(
            <OrientationWidget
                layout={layout}
                data={data}
                onDetails={clickable ? () => void this.#openDetails(ids) : undefined}
            />,
        );
        if (this.#details) {
            this.#drawDetails(this.#details, data);
        }
    }

    #drawDetails(details: Details, data: OrientationData): void {
        // the dialog lies outside of the element: it gets the theme of the host as CSS variables too
        for (const [name, value] of Object.entries(getThemeCssVariables(this.theme))) {
            details.content.style.setProperty(name, value);
        }
        details.root.render(
            <div className={getViewClass('full', data)}>
                <OrientationViewOf
                    view="full"
                    data={data}
                />
            </div>,
        );
    }

    /** The big view in a dialog of the host, kept up to date while it is open */
    async #openDetails(ids: AngleIds): Promise<void> {
        if (this.#details || this.editMode) {
            return;
        }
        const content = document.createElement('div');
        const shadow = content.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = DIALOG_STYLES;
        const mount = document.createElement('div');
        mount.className = 'details';
        shadow.append(style, mount);

        const details: Details = { content, root: createRoot(mount) };
        const data = this.#getData(ids);
        this.#details = details;
        this.#drawDetails(details, data);
        try {
            await this.openDialog({
                title: data.name || getWord(this.systemLang, 'widget_label'),
                element: content,
                width: 900,
            });
        } finally {
            if (this.#details === details) {
                this.#details = null;
            }
            details.root.unmount();
        }
    }

    /** Closes the dialog: the host and the dialog of the browser both close on this event */
    #closeDetails(): void {
        this.#details?.content.dispatchEvent(
            new CustomEvent(DIALOG_CLOSE_EVENT, { detail: null, bubbles: true, composed: true }),
        );
    }
}

defineWebComponent(TAG, WitMotionOrientationElement);
