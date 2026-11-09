/**
 * What `<iob-witmotion-orientation>` draws: the views of the vis-2 widget and the tile of the devices app - compact,
 * bar, wide and full - with the same pictures (`Compass` and `ObjectIcon` of `src-shared/OrientationView.tsx`).
 *
 * Those views size themselves in pixels the widget measures. A web component never measures itself, so the views
 * are laid out here again, with sizes in container units of the box (`styles.ts`). For the automatic layout all of
 * them are drawn, and the container queries of `styles.ts` show the one that fits the box.
 */
import type { JSX, KeyboardEvent } from 'react';

import {
    formatAngle,
    type AxisType,
    type OrientationSettings,
    type OrientationValues,
    type ViewType,
} from '../../src-shared/orientation';
import { Compass, ObjectIcon } from '../../src-shared/OrientationView';
import type { Layout } from './constants';

export type View = Exclude<Layout, 'auto'>;

/** The views of the automatic layout, in the order of `styles.ts` */
const AUTO_VIEWS: View[] = ['compact', 'wide', 'bar', 'full'];

/** A compass needle, the icon of the hints */
const COMPASS_ICON =
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16m-5.5-2.5 7.51-3.49L17.5 6.5 9.99 9.99zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1';

/** What the views show */
export interface OrientationData {
    settings: Required<OrientationSettings>;
    values: OrientationValues;
    /** Shown below or next to the values; nothing if empty */
    name: string;
    isFloatComma: boolean;
}

/** The axis, view and multiplier of the primary or the secondary axis */
function getAxis(
    settings: Required<OrientationSettings>,
    isSecond: boolean,
): { axis: AxisType; view: ViewType; multiplier: number } {
    return isSecond
        ? { axis: settings.axis2 || 'x', view: settings.view2, multiplier: settings.multiplier2 }
        : { axis: settings.axis1, view: settings.view1, multiplier: settings.multiplier1 };
}

/** A compass for the top view, otherwise the object rotated by the angle - in the size of `.picture` */
function Picture(props: { data: OrientationData; isSecond: boolean }): JSX.Element {
    const { settings, values } = props.data;
    const { view, multiplier } = getAxis(settings, props.isSecond);
    const angle = props.isSecond ? values.angle2 : values.angle1;
    const visual = angle !== null ? angle * multiplier : null;
    let picture: JSX.Element;
    if (view === 'top') {
        picture = (
            <Compass
                settings={settings}
                isSecond={props.isSecond}
                angle={visual}
                size="100%"
            />
        );
    } else if (visual === null) {
        picture = <div className="no-value">—</div>;
    } else {
        picture = (
            <ObjectIcon
                settings={settings}
                isSecond={props.isSecond}
                view={view}
                angle={visual}
                size="100%"
            />
        );
    }
    return <div className="picture">{picture}</div>;
}

/** The value with its axis next to it */
function Value(props: { data: OrientationData; isSecond: boolean }): JSX.Element {
    const { settings, values, isFloatComma } = props.data;
    const { axis } = getAxis(settings, props.isSecond);
    return (
        <div className="inline">
            <span className="value">{formatAngle(props.isSecond ? values.angle2 : values.angle1, isFloatComma)}</span>
            <span className="axis">{axis}</span>
        </div>
    );
}

function Name(props: { name: string }): JSX.Element | null {
    return props.name ? <div className="name">{props.name}</div> : null;
}

/** Picture, value and axis of one axis, one below the other */
function AnglePanel(props: { data: OrientationData; isSecond: boolean }): JSX.Element {
    const { settings, values, isFloatComma } = props.data;
    const { axis } = getAxis(settings, props.isSecond);
    return (
        <div className="panel">
            <Picture {...props} />
            <div className="value">{formatAngle(props.isSecond ? values.angle2 : values.angle1, isFloatComma)}</div>
            <div className="axis">{axis}</div>
        </div>
    );
}

/**
 * One view of the orientation
 *
 * @param props the properties
 * @param props.data what to show
 * @param props.view which view
 */
export function OrientationViewOf(props: { data: OrientationData; view: View }): JSX.Element {
    const { data } = props;
    const two = !!data.settings.axis2;
    switch (props.view) {
        case 'bar':
            return (
                <>
                    <Name name={data.name} />
                    <Value
                        data={data}
                        isSecond={false}
                    />
                    {two ? (
                        <Value
                            data={data}
                            isSecond
                        />
                    ) : null}
                </>
            );

        case 'wide':
            if (!two) {
                return (
                    <>
                        <Picture
                            data={data}
                            isSecond={false}
                        />
                        <div className="text">
                            <Value
                                data={data}
                                isSecond={false}
                            />
                            <Name name={data.name} />
                        </div>
                    </>
                );
            }
            return (
                <>
                    <div className="row">
                        <AnglePanel
                            data={data}
                            isSecond={false}
                        />
                        <AnglePanel
                            data={data}
                            isSecond
                        />
                    </div>
                    <Name name={data.name} />
                </>
            );

        case 'full':
            return (
                <>
                    <div className="row">
                        <AnglePanel
                            data={data}
                            isSecond={false}
                        />
                        {two ? (
                            <AnglePanel
                                data={data}
                                isSecond
                            />
                        ) : null}
                    </div>
                    <Name name={data.name} />
                </>
            );

        default:
            return (
                <>
                    <AnglePanel
                        data={data}
                        isSecond={false}
                    />
                    <Name name={data.name} />
                </>
            );
    }
}

/**
 * The class of the box of a view: its sizes depend on the view and on the number of axes, see `styles.ts`
 *
 * @param view the view
 * @param data what it shows
 */
export function getViewClass(view: View, data: OrientationData): string {
    return `view ${view}${data.settings.axis2 ? ' two' : ''}`;
}

export interface OrientationWidgetProps {
    layout: Layout;
    data: OrientationData;
    /** Opens the big view in a dialog; missing in edit mode and when the settings switch it off */
    onDetails?: () => void;
}

export function OrientationWidget(props: OrientationWidgetProps): JSX.Element {
    const { layout, data, onDetails } = props;
    const views = layout === 'auto' ? AUTO_VIEWS : [layout];

    return (
        <div className={layout === 'auto' ? 'orientation auto' : 'orientation'}>
            {views.map(view => {
                // the full view shows everything already
                const onClick = view !== 'full' ? onDetails : undefined;
                return (
                    <div
                        key={view}
                        className={`${getViewClass(view, data)}${onClick ? ' clickable' : ''}`}
                        role={onClick ? 'button' : undefined}
                        tabIndex={onClick ? 0 : undefined}
                        onClick={onClick}
                        onKeyDown={
                            onClick
                                ? (e: KeyboardEvent) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault();
                                          onClick();
                                      }
                                  }
                                : undefined
                        }
                    >
                        <OrientationViewOf
                            view={view}
                            data={data}
                        />
                    </div>
                );
            })}
        </div>
    );
}

/** A hint instead of the orientation: no instance chosen, or the instance writes no angles */
export function Hint({ text, warning }: { text: string; warning?: boolean }): JSX.Element {
    return (
        <div className={warning ? 'hint warning' : 'hint'}>
            <svg viewBox="0 0 24 24">
                <path d={COMPASS_ICON} />
            </svg>
            <span>{text}</span>
        </div>
    );
}
