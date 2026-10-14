/**
 * The WitMotion orientation as a tile in the devices app.
 *
 * 1x1 shows the primary axis, 2x½ the values only, 2x1 the primary axis with its value or both axes side
 * by side. A click opens a dialog with big pictures.
 *
 * The class draws only the frame of the devices app; the views are the shared ones in `../src-shared`.
 */
// Use host's React and MUI via dm-widgets window globals to avoid dual-instance issues
import WidgetGeneric, {
    MuiMaterial,
    MuiIcons,
    getTileStyles,
    isNeumorphicTheme,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type React from 'react';
import type { BoxProps, DialogProps, IconButtonProps, Theme } from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/json-config';

import {
    DEFAULT_INSTANCE,
    getAngleStateId,
    toAngle,
    type AxisType,
    type OrientationSettings,
    type ValueMode,
} from '../../src-shared/orientation';
import {
    OrientationBarView,
    OrientationCompactView,
    OrientationFullView,
    OrientationWideView,
    getFullViewSize,
} from '../../src-shared/OrientationView';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogContent: React.ComponentType<any> = MuiMaterial?.DialogContent;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const CloseIcon: React.ComponentType<any> = MuiIcons?.Close;

interface WidgetWitmotionSettings extends CustomWidgetPlugin, OrientationSettings {
    /** Base instance path, e.g. "witmotion.0" */
    instance?: string;
    /** Value mode */
    valueMode?: ValueMode;
}

interface WidgetWitmotionState extends WidgetGenericState {
    angle1: number | null;
    angle2: number | null;
    dialogOpen: boolean;
}

export class WidgetWitmotion extends WidgetGeneric<WidgetWitmotionState, WidgetWitmotionSettings> {
    /** State IDs this tile is subscribed to, with their handlers */
    private subscribed: { id: string; handler: (id: string, state: ioBroker.State) => void }[] = [];

    constructor(props: WidgetGenericProps<WidgetWitmotionSettings>) {
        super(props);
        this.state = {
            ...this.state,
            angle1: null,
            angle2: null,
            dialogOpen: false,
        };
    }

    static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
        return {
            name: 'WitMotion',
            schema: {
                type: 'panel',
                items: {
                    instance: {
                        type: 'instance',
                        adapter: 'witmotion',
                        label: 'wit_Instance',
                        default: DEFAULT_INSTANCE,
                        help: 'wit_Instance help',
                    },
                    iconType: {
                        type: 'select',
                        label: 'wit_Icon',
                        options: [
                            {
                                value: 'car',
                                label: 'wit_Car',
                                icon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22currentColor%22%20stroke%3D%22currentColor%22%20stroke-width%3D%220.5%22%20fill-rule%3D%22evenodd%22%20d%3D%22M3%2015%20L3%2011%20L7%2011%20L9%207%20L17%207%20L19%2011%20L21%2011%20L21%2015%20M6%2016.5%20A2%202%200%201%200%2010%2016.5%20A2%202%200%201%200%206%2016.5%20M14%2016.5%20A2%202%200%201%200%2018%2016.5%20A2%202%200%201%200%2014%2016.5%22%2F%3E%3C%2Fsvg%3E',
                            },
                            {
                                value: 'boat',
                                label: 'wit_Boat',
                                icon: 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22currentColor%22%20stroke%3D%22currentColor%22%20stroke-width%3D%220.5%22%20fill-rule%3D%22evenodd%22%20d%3D%22M12%203%20L12%2016%20M12%203%20L19%2014%20L12%2014%20Z%20M4%2017%20Q6%2015%208%2016%20Q10%2017%2012%2016%20Q14%2015%2016%2016%20Q18%2017%2020%2017%20L19%2020%20Q17%2022%2012%2022%20Q7%2022%205%2020%20Z%22%2F%3E%3C%2Fsvg%3E',
                            },
                            { value: 'custom', label: 'wit_Custom' },
                        ],
                        default: 'boat',
                        format: 'radio',
                        horizontal: true,
                    },
                    axis1: {
                        newLine: true,
                        type: 'select',
                        label: 'wit_Primary axis',
                        options: [
                            { value: 'x', label: 'wit_X (Roll)' },
                            { value: 'y', label: 'wit_Y (Pitch)' },
                            { value: 'z', label: 'wit_Z (Yaw)' },
                        ],
                        default: 'x',
                        format: 'radio',
                        horizontal: true,
                        sm: 6,
                    },
                    view1: {
                        type: 'select',
                        label: 'wit_Primary view',
                        options: [
                            { value: 'side', label: 'wit_Side' },
                            { value: 'top', label: 'wit_Top' },
                            { value: 'back', label: 'wit_Back' },
                        ],
                        default: 'side',
                        format: 'radio',
                        horizontal: true,
                        hidden: "data.size === '2x0.5'",
                        sm: 6,
                    },
                    multiplier1: {
                        type: 'number',
                        label: 'wit_Visual multiplier',
                        default: 1,
                        min: 0.1,
                        max: 50,
                        help: 'wit_Multiplier help',
                        hidden: "data.size === '2x0.5'",
                        sm: 6,
                    },
                    icon1: {
                        type: 'component',
                        subType: 'iconSelect',
                        label: 'wit_Icon top',
                        hidden: "data.iconType !== 'custom'",
                        sm: 4,
                    },
                    axis2: {
                        newLine: true,
                        type: 'select',
                        label: 'wit_Secondary axis',
                        options: [
                            { value: '', label: 'wit_None' },
                            { value: 'x', label: 'wit_X (Roll)' },
                            { value: 'y', label: 'wit_Y (Pitch)' },
                            { value: 'z', label: 'wit_Z (Yaw)' },
                        ],
                        default: '',
                        format: 'radio',
                        horizontal: true,
                        hidden: "data.size === '1x1'",
                        sm: 6,
                    },
                    view2: {
                        type: 'select',
                        label: 'wit_Secondary view',
                        options: [
                            { value: 'side', label: 'wit_Side' },
                            { value: 'top', label: 'wit_Top' },
                            { value: 'back', label: 'wit_Back' },
                        ],
                        default: 'side',
                        format: 'radio',
                        horizontal: true,
                        hidden: "data.size === '1x1' || !data.axis2",
                        sm: 6,
                    },
                    multiplier2: {
                        type: 'number',
                        label: 'wit_Visual multiplier 2',
                        default: 1,
                        min: 0.1,
                        max: 50,
                        hidden: "data.size !== '2x1' || !data.axis2",
                        sm: 6,
                    },
                    icon2: {
                        type: 'component',
                        subType: 'iconSelect',
                        label: 'wit_Icon side',
                        hidden: "data.iconType !== 'custom' || data.size !== '2x1'",
                        sm: 4,
                    },
                    valueMode: {
                        newLine: true,
                        type: 'select',
                        label: 'wit_Value mode',
                        options: [
                            { value: 'instant', label: 'wit_Instant' },
                            { value: 'average', label: 'wit_Average' },
                        ],
                        default: 'instant',
                        format: 'radio',
                        horizontal: true,
                    },
                },
            },
        };
    }

    componentDidMount(): void {
        super.componentDidMount?.();
        this.subscribe();
    }

    componentDidUpdate(
        prevProps: Readonly<WidgetGenericProps<WidgetWitmotionSettings>>,
        prevState: Readonly<WidgetWitmotionState>,
    ): void {
        super.componentDidUpdate?.(prevProps, prevState);
        const s = this.props.settings;
        const ps = prevProps.settings;
        if (
            s.instance !== ps.instance ||
            s.axis1 !== ps.axis1 ||
            s.axis2 !== ps.axis2 ||
            s.valueMode !== ps.valueMode ||
            s.size !== ps.size
        ) {
            this.unsubscribeAngles();
            this.setState({ angle1: null, angle2: null });
            this.subscribe();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeAngles();
    }

    private subscribeAngle(axis: AxisType, field: 'angle1' | 'angle2'): void {
        const id = getAngleStateId(this.props.settings.instance, axis, this.props.settings.valueMode);
        const handler = (_id: string, state: ioBroker.State): void =>
            this.setState({ [field]: toAngle(state?.val) } as Pick<WidgetWitmotionState, typeof field>);
        this.subscribed.push({ id, handler });
        this.props.stateContext.getState(id, handler);
    }

    private subscribe(): void {
        this.subscribeAngle(this.props.settings.axis1 || 'x', 'angle1');
        const axis2 = this.props.settings.axis2;
        const isWide = this.props.settings.size === '2x1' || this.props.settings.size === '2x0.5';
        if (axis2 && isWide) {
            this.subscribeAngle(axis2, 'angle2');
        }
    }

    private unsubscribeAngles(): void {
        for (const { id, handler } of this.subscribed) {
            this.props.stateContext.removeState(id, handler);
        }
        this.subscribed = [];
    }

    protected isTileActive(): boolean {
        return this.state.angle1 != null;
    }

    private getViewProps(): React.ComponentProps<typeof OrientationCompactView> {
        return {
            settings: this.props.settings,
            values: { angle1: this.state.angle1, angle2: this.state.angle2 },
            name: this.props.settings.name,
            accent: this.getAccentColor(),
            isFloatComma: this.props.stateContext.isFloatComma,
        };
    }

    private onClick = (): void => this.setState({ dialogOpen: true });

    /** The tile's frame in the style of the devices app */
    private renderFrame(
        outer: (theme: Theme) => React.CSSProperties,
        inner: (theme: Theme) => React.CSSProperties,
        content: React.JSX.Element,
    ): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const indicators = this.renderIndicators(this.renderSettingsButton());
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => outer(theme)}
            >
                <Box
                    onClick={this.onClick}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: 'pointer',
                        color: 'text.primary',
                        ...(getTileStyles(theme, isActive, accent) as React.CSSProperties),
                        ...inner(theme),
                    })}
                >
                    {indicators}
                    {content}
                </Box>
            </Box>
        );
    }

    renderCompact(): React.JSX.Element {
        return this.renderFrame(
            theme => WidgetGeneric.getStyleCompact(theme),
            theme => ({
                aspectRatio: '1',
                padding: isNeumorphicTheme(theme) ? 'max(12px, 8cqi)' : 'max(16px, 10cqi)',
            }),
            <OrientationCompactView
                {...this.getViewProps()}
                size={64}
            />,
        );
    }

    /** 2x0.5 — thin bar, numbers only, no icons */
    renderWide(): React.JSX.Element {
        return this.renderFrame(
            theme => ({ ...WidgetGeneric.getStyleWide(theme), height: 80 }),
            () => ({ height: '100%', paddingLeft: 16, paddingRight: 16 }),
            <OrientationBarView {...this.getViewProps()} />,
        );
    }

    /** 2x1 — full wide with icons */
    renderWideTall(): React.JSX.Element {
        return this.renderFrame(
            theme => WidgetGeneric.getStyleWide(theme),
            theme => ({ aspectRatio: '2', padding: isNeumorphicTheme(theme) ? '12px' : '16px' }),
            <OrientationWideView
                {...this.getViewProps()}
                size={this.props.settings.axis2 ? 70 : 90}
            />,
        );
    }

    /** Render a fullscreen dialog with large icons and values */
    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        const close = (): void => this.setState({ dialogOpen: false });
        const viewProps = this.getViewProps();
        // The second axis is subscribed in the wide tiles only
        if (this.subscribed.length < 2) {
            viewProps.settings = { ...viewProps.settings, axis2: '' };
        }
        return (
            <Dialog
                open
                onClose={close}
                maxWidth={false}
                fullWidth
                slotProps={{
                    paper: {
                        sx: {
                            width: '95vw',
                            height: '90vh',
                            maxWidth: '95vw',
                            maxHeight: '90vh',
                            m: 1,
                        },
                    },
                }}
            >
                <IconButton
                    onClick={close}
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                >
                    <CloseIcon />
                </IconButton>
                <DialogContent sx={{ p: 4, overflow: 'hidden', color: 'text.primary' }}>
                    <OrientationFullView
                        {...viewProps}
                        size={getFullViewSize(viewProps.settings, window.innerWidth * 0.9, window.innerHeight * 0.85)}
                    />
                </DialogContent>
            </Dialog>
        );
    }

    render(): React.JSX.Element {
        const widget = super.render();
        const dialog = this.renderDialog();
        if (dialog) {
            return (
                <>
                    {widget}
                    {dialog}
                </>
            );
        }
        return widget;
    }
}

export default WidgetWitmotion;
