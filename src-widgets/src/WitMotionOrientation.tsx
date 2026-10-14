/**
 * vis-2 widget of the WitMotion orientation.
 *
 * Picks its layout from its size unless one is chosen: the values only for flat widgets, the picture with
 * the value (or both axes) for wide ones, one axis for square ones and big pictures once there is room for
 * them. A click on the smaller layouts opens the big view in a dialog. The views are the shared ones in
 * `../src-shared`, the same as in the devices tile.
 */
import React from 'react';
import { Card, Dialog, DialogContent, IconButton } from '@mui/material';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import type VisRxWidget from '@iobroker/types-vis-2/visRxWidget';

import {
    DEFAULT_INSTANCE,
    getAngleStateId,
    toAngle,
    type AxisType,
    type IconType,
    type OrientationSettings,
    type ValueMode,
    type ViewType,
} from '../../src-shared/orientation';
import {
    OrientationBarView,
    OrientationCompactView,
    OrientationFullView,
    OrientationWideView,
    getFullViewSize,
    type OrientationViewProps,
} from '../../src-shared/OrientationView';
import { I18N_PREFIX } from '../../src-shared/translations';

type Layout = 'auto' | 'compact' | 'bar' | 'wide' | 'full';

interface WitMotionOrientationRxData {
    instance: string;
    valueMode: ValueMode;
    name: string;
    layout: Layout;
    card: boolean;
    openDialog: boolean;
    iconType: IconType;
    icon1: string;
    icon2: string;
    axis1: AxisType;
    view1: ViewType;
    multiplier1: number | string;
    axis2: AxisType | '';
    view2: ViewType;
    multiplier2: number | string;
}

interface WitMotionOrientationState extends VisRxWidgetState {
    angle1: number | null;
    angle2: number | null;
    /** Measured size of the widget, for the automatic layout. `width`/`height` belong to vis-2 */
    boxWidth: number;
    boxHeight: number;
    dialogOpen: boolean;
}

/** The part of the socket connection this widget uses */
interface AngleSocket {
    subscribeState(id: string | string[], cb: (id: string, state: ioBroker.State | null | undefined) => void): unknown;
    unsubscribeState(id: string | string[], cb: (id: string, state: ioBroker.State | null | undefined) => void): void;
}

const CLOSE_ICON =
    'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

/** Inner padding of the widget in pixels */
const PADDING = 12;

const AXIS_OPTIONS = [
    { value: 'x', label: 'wit_X (Roll)' },
    { value: 'y', label: 'wit_Y (Pitch)' },
    { value: 'z', label: 'wit_Z (Yaw)' },
];

const VIEW_OPTIONS = [
    { value: 'side', label: 'wit_Side' },
    { value: 'top', label: 'wit_Top' },
    { value: 'back', label: 'wit_Back' },
];

export default class WitMotionOrientation extends (window.visRxWidget as typeof VisRxWidget)<
    WitMotionOrientationRxData,
    WitMotionOrientationState
> {
    private readonly rootRef = React.createRef<HTMLDivElement>();
    private resizeObserver: ResizeObserver | null = null;
    /** The root element is rendered anew when the layout changes, so it is observed after every update */
    private observedElement: HTMLDivElement | null = null;
    /** state ID -> angle of the view it feeds */
    private subscribed: Record<string, 'angle1' | 'angle2'> = {};
    /** Key of the current subscription, to see if the settings changed it */
    private subscribedKey = '';

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            angle1: null,
            angle2: null,
            boxWidth: 0,
            boxHeight: 0,
            dialogOpen: false,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplWitMotionOrientation',
            visSet: 'witmotion',
            visSetLabel: 'wit_set_label',
            visSetColor: '#1976d2',
            visSetIcon: 'widgets/witmotion/img/witmotion.png',
            visName: 'WitMotionOrientation',
            visWidgetLabel: 'wit_widget_label',
            visHelp: 'wit_widget_help',
            visAttrs: [
                {
                    name: 'common',
                    label: 'wit_Common',
                    fields: [
                        {
                            name: 'instance',
                            type: 'instance',
                            label: 'wit_Instance',
                            adapter: 'witmotion',
                            default: DEFAULT_INSTANCE,
                        },
                        {
                            name: 'valueMode',
                            type: 'select',
                            label: 'wit_Value mode',
                            options: [
                                { value: 'instant', label: 'wit_Instant' },
                                { value: 'average', label: 'wit_Average' },
                            ],
                            default: 'instant',
                        },
                        {
                            name: 'name',
                            type: 'text',
                            label: 'wit_Name',
                        },
                        {
                            name: 'layout',
                            type: 'select',
                            label: 'wit_Layout',
                            options: [
                                { value: 'auto', label: 'wit_layout_auto' },
                                { value: 'compact', label: 'wit_layout_compact' },
                                { value: 'bar', label: 'wit_layout_bar' },
                                { value: 'wide', label: 'wit_layout_wide' },
                                { value: 'full', label: 'wit_layout_full' },
                            ],
                            default: 'auto',
                        },
                        {
                            name: 'card',
                            type: 'checkbox',
                            label: 'wit_Card',
                            default: true,
                        },
                        {
                            name: 'openDialog',
                            type: 'checkbox',
                            label: 'wit_Open dialog',
                            default: true,
                        },
                    ],
                },
                {
                    name: 'icon',
                    label: 'wit_Icon',
                    fields: [
                        {
                            name: 'iconType',
                            type: 'select',
                            label: 'wit_Icon',
                            options: [
                                { value: 'boat', label: 'wit_Boat' },
                                { value: 'car', label: 'wit_Car' },
                                { value: 'custom', label: 'wit_Custom' },
                            ],
                            default: 'boat',
                        },
                        {
                            name: 'icon1',
                            type: 'image',
                            label: 'wit_Icon top',
                            hidden: "data.iconType !== 'custom'",
                        },
                        {
                            name: 'icon2',
                            type: 'image',
                            label: 'wit_Icon side',
                            hidden: "data.iconType !== 'custom' || !data.axis2",
                        },
                    ],
                },
                {
                    name: 'axes',
                    label: 'wit_Primary axis',
                    fields: [
                        {
                            name: 'axis1',
                            type: 'select',
                            label: 'wit_Primary axis',
                            options: AXIS_OPTIONS,
                            default: 'x',
                        },
                        {
                            name: 'view1',
                            type: 'select',
                            label: 'wit_Primary view',
                            options: VIEW_OPTIONS,
                            default: 'side',
                        },
                        {
                            name: 'multiplier1',
                            type: 'number',
                            label: 'wit_Visual multiplier',
                            tooltip: 'wit_Multiplier help',
                            min: 0.1,
                            max: 50,
                            step: 0.1,
                            default: 1,
                        },
                        {
                            name: 'axis2',
                            type: 'select',
                            label: 'wit_Secondary axis',
                            options: [{ value: '', label: 'wit_None' }, ...AXIS_OPTIONS],
                            default: '',
                        },
                        {
                            name: 'view2',
                            type: 'select',
                            label: 'wit_Secondary view',
                            options: VIEW_OPTIONS,
                            default: 'back',
                            hidden: '!data.axis2',
                        },
                        {
                            name: 'multiplier2',
                            type: 'number',
                            label: 'wit_Visual multiplier 2',
                            min: 0.1,
                            max: 50,
                            step: 0.1,
                            default: 1,
                            hidden: '!data.axis2',
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                width: 240,
                height: 140,
            },
            visPrev: 'widgets/witmotion/img/prev_witmotion.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return WitMotionOrientation.getWidgetInfo();
    }

    static getI18nPrefix(): string {
        return I18N_PREFIX;
    }

    private get socket(): AngleSocket {
        return this.props.context.socket as unknown as AngleSocket;
    }

    private getSettings(): OrientationSettings {
        const rx = this.state.rxData;
        return {
            iconType: rx.iconType || 'boat',
            axis1: rx.axis1 || 'x',
            view1: rx.view1 || 'side',
            multiplier1: parseFloat(rx.multiplier1 as string) || 1,
            icon1: rx.icon1 || undefined,
            axis2: rx.axis2 || '',
            view2: rx.view2 || 'back',
            multiplier2: parseFloat(rx.multiplier2 as string) || 1,
            icon2: rx.icon2 || undefined,
        };
    }

    componentDidMount(): void {
        super.componentDidMount();
        this.subscribe();
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(entries => {
                const rect = entries[0]?.contentRect;
                if (rect) {
                    const width = Math.round(rect.width);
                    const height = Math.round(rect.height);
                    if (width !== this.state.boxWidth || height !== this.state.boxHeight) {
                        this.setState({ boxWidth: width, boxHeight: height });
                    }
                }
            });
            this.observe();
        }
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        this.observe();
    }

    componentWillUnmount(): void {
        super.componentWillUnmount();
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.unsubscribe();
    }

    onRxDataChanged(): void {
        if (this.getSubscriptionKey() !== this.subscribedKey) {
            this.unsubscribe();
            this.setState({ angle1: null, angle2: null });
            this.subscribe();
        }
    }

    private observe(): void {
        const el = this.rootRef.current;
        if (this.resizeObserver && el && el !== this.observedElement) {
            if (this.observedElement) {
                this.resizeObserver.unobserve(this.observedElement);
            }
            this.observedElement = el;
            this.resizeObserver.observe(el);
        }
    }

    private getSubscriptionKey(): string {
        const rx = this.state.rxData;
        return [rx.instance || DEFAULT_INSTANCE, rx.valueMode, rx.axis1 || 'x', rx.axis2 || ''].join('|');
    }

    private onAngleState = (id: string, state: ioBroker.State | null | undefined): void => {
        const field = this.subscribed[id];
        if (field) {
            this.setState({ [field]: toAngle(state?.val) } as Pick<WitMotionOrientationState, typeof field>);
        }
    };

    private subscribe(): void {
        const rx = this.state.rxData;
        this.subscribedKey = this.getSubscriptionKey();
        this.subscribed = {};
        this.subscribed[getAngleStateId(rx.instance, rx.axis1 || 'x', rx.valueMode)] = 'angle1';
        if (rx.axis2) {
            this.subscribed[getAngleStateId(rx.instance, rx.axis2, rx.valueMode)] = 'angle2';
        }
        void this.socket.subscribeState(Object.keys(this.subscribed), this.onAngleState);
    }

    private unsubscribe(): void {
        const ids = Object.keys(this.subscribed);
        if (ids.length) {
            this.socket.unsubscribeState(ids, this.onAngleState);
        }
        this.subscribed = {};
        this.subscribedKey = '';
    }

    private getLayout(): Exclude<Layout, 'auto'> {
        const layout = this.state.rxData.layout || 'auto';
        if (layout !== 'auto') {
            return layout;
        }
        const width = this.state.boxWidth;
        const height = this.state.boxHeight;
        if (!width || !height) {
            return 'compact';
        }
        if (width >= 480 && height >= 360) {
            return 'full';
        }
        if (height <= 110 && width >= height * 2.5) {
            return 'bar';
        }
        if (width >= height * 1.5) {
            return 'wide';
        }
        return 'compact';
    }

    private canOpenDialog(layout: Exclude<Layout, 'auto'>): boolean {
        return !this.props.editMode && this.state.rxData.openDialog !== false && layout !== 'full';
    }

    private onClick = (): void => {
        if (this.canOpenDialog(this.getLayout())) {
            this.setState({ dialogOpen: true });
        }
    };

    private renderView(layout: Exclude<Layout, 'auto'>, width: number, height: number): React.JSX.Element {
        const settings = this.getSettings();
        const props: OrientationViewProps = {
            settings,
            values: { angle1: this.state.angle1, angle2: this.state.angle2 },
            name: this.state.rxData.name,
            isFloatComma: this.props.context.systemConfig?.common?.isFloatComma,
        };
        // Sizes of the pictures follow the widget; before the first measurement the defaults of the views apply
        const w = Math.max(0, width - 2 * PADDING);
        const h = Math.max(0, height - 2 * PADDING);
        const measured = w > 0 && h > 0;
        switch (layout) {
            case 'full':
                return (
                    <OrientationFullView
                        {...props}
                        size={getFullViewSize(settings, w || 400, h || 300)}
                    />
                );
            case 'bar':
                return (
                    <OrientationBarView
                        {...props}
                        fontSize={measured ? Math.max(12, Math.min(40, Math.round(h * 0.4))) : undefined}
                    />
                );
            case 'wide':
                return (
                    <OrientationWideView
                        {...props}
                        size={
                            measured
                                ? Math.max(
                                      32,
                                      Math.floor(
                                          settings.axis2 ? Math.min((w - 8) / 2, h * 0.6) : Math.min(w * 0.45, h * 0.9),
                                      ),
                                  )
                                : undefined
                        }
                    />
                );
            default:
                return (
                    <OrientationCompactView
                        {...props}
                        size={measured ? Math.max(32, Math.floor(Math.min(w * 0.8, h * 0.55))) : undefined}
                    />
                );
        }
    }

    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        const close = (): void => this.setState({ dialogOpen: false });
        return (
            <Dialog
                open
                onClose={close}
                maxWidth={false}
                fullWidth
                slotProps={{
                    paper: {
                        sx: { width: '95vw', height: '90vh', maxWidth: '95vw', maxHeight: '90vh', m: 1 },
                    },
                }}
            >
                <IconButton
                    onClick={close}
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                >
                    <svg
                        viewBox="0 0 24 24"
                        style={{ width: 24, height: 24 }}
                    >
                        <path
                            fill="currentColor"
                            d={CLOSE_ICON}
                        />
                    </svg>
                </IconButton>
                <DialogContent sx={{ p: 4, overflow: 'hidden' }}>
                    {this.renderView('full', window.innerWidth * 0.9, window.innerHeight * 0.85)}
                </DialogContent>
            </Dialog>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const layout = this.getLayout();
        const style: React.CSSProperties = {
            width: '100%',
            height: '100%',
            boxSizing: 'border-box',
            padding: layout === 'bar' ? `0 ${PADDING}px` : PADDING,
            overflow: 'hidden',
            cursor: this.canOpenDialog(layout) ? 'pointer' : undefined,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        };
        const content = this.renderView(layout, this.state.boxWidth, this.state.boxHeight);

        return (
            <>
                {this.state.rxData.card !== false ? (
                    <Card
                        ref={this.rootRef}
                        style={style}
                        onClick={this.onClick}
                    >
                        {content}
                    </Card>
                ) : (
                    <div
                        ref={this.rootRef}
                        style={style}
                        onClick={this.onClick}
                    >
                        {content}
                    </div>
                )}
                {this.renderDialog()}
            </>
        );
    }
}
