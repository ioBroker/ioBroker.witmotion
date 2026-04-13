// Use host's React and MUI via dm-widgets window globals to avoid dual-instance issues
import WidgetGeneric, {
    React,
    MuiMaterial,
    MuiIcons,
    getTileStyles,
    isNeumorphicTheme,
    type WidgetGenericProps,
    type WidgetGenericState,
    type CustomWidgetPlugin,
} from '@iobroker/dm-widgets';
import type { BoxProps, TypographyProps, DialogProps, IconButtonProps } from '@mui/material';
import type { ConfigItemPanel, ConfigItemTabs } from '@iobroker/json-config';

const Box: React.ComponentType<BoxProps> = MuiMaterial?.Box;
const Typography: React.ComponentType<TypographyProps> = MuiMaterial?.Typography;
const Dialog: React.ComponentType<DialogProps> = MuiMaterial?.Dialog;
const DialogContent: React.ComponentType<any> = MuiMaterial?.DialogContent;
const IconButton: React.ComponentType<IconButtonProps> = MuiMaterial?.IconButton;
const CloseIcon: React.ComponentType<any> = MuiIcons?.Close;

// PNG assets — imported as URLs by Vite
import boatTopPng from './assets/boat_top.png';
import boatSidePng from './assets/boat_side.png';
import boatBackPng from './assets/boat_back.png';
import carTopPng from './assets/car_top.png';
import carSidePng from './assets/car_side.png';
import carBackPng from './assets/back_back.png';

const OBJECT_IMAGES: Record<string, Record<string, string>> = {
    boat: { top: boatTopPng, side: boatSidePng, back: boatBackPng },
    car: { top: carTopPng, side: carSidePng, back: carBackPng },
};

/** Format angle value respecting isFloatComma */
function formatAngle(val: number, decimals: number, isFloatComma?: boolean): string {
    const str = val.toFixed(decimals);
    return isFloatComma ? str.replace('.', ',') : str;
}

let waterLevelIdCounter = 0;

/** Animated water level SVG overlay */
function WaterLevel({ size, view }: { size: number; view: 'side' | 'back' }): React.JSX.Element {
    const gradId = React.useMemo(() => `waterGrad_${++waterLevelIdCounter}`, []);
    const w = size;
    const h = size * 0.35;
    // Side view: water higher up to overlap hull; back view: just slightly higher
    const y = view === 'side' ? size * 0.5 : size * 0.58;
    return (
        <svg
            style={{
                position: 'absolute',
                left: 0,
                top: y,
                width: w,
                height: h,
                pointerEvents: 'none',
            }}
            viewBox={`0 0 ${w} ${h}`}
        >
            <defs>
                <linearGradient
                    id={gradId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stopColor="#1976d2"
                        stopOpacity="0.15"
                    />
                    <stop
                        offset="100%"
                        stopColor="#1976d2"
                        stopOpacity="0.35"
                    />
                </linearGradient>
            </defs>
            {/* Animated wave */}
            <path
                fill={`url(#${gradId})`}
                d={`M0,${h * 0.3} Q${w * 0.15},${h * 0.05} ${w * 0.25},${h * 0.3} T${w * 0.5},${h * 0.3} T${w * 0.75},${h * 0.3} T${w},${h * 0.3} L${w},${h} L0,${h} Z`}
            >
                <animateTransform
                    attributeName="transform"
                    type="translate"
                    values={`0,0; ${w * 0.05},0; 0,0`}
                    dur="3s"
                    repeatCount="indefinite"
                />
            </path>
            {/* Second wave layer offset */}
            <path
                fill={`url(#${gradId})`}
                opacity="0.5"
                d={`M0,${h * 0.45} Q${w * 0.2},${h * 0.2} ${w * 0.3},${h * 0.45} T${w * 0.6},${h * 0.45} T${w * 0.9},${h * 0.45} T${w * 1.2},${h * 0.45} L${w},${h} L0,${h} Z`}
            >
                <animateTransform
                    attributeName="transform"
                    type="translate"
                    values={`0,0; -${w * 0.05},0; 0,0`}
                    dur="2.5s"
                    repeatCount="indefinite"
                />
            </path>
            {/* Water line */}
            <line
                x1="0"
                y1={h * 0.3}
                x2={w}
                y2={h * 0.3}
                stroke="#1976d2"
                strokeWidth="1"
                opacity="0.3"
            />
        </svg>
    );
}

type AxisType = 'x' | 'y' | 'z';
type IconType = 'boat' | 'car' | 'custom';
type ViewType = 'top' | 'side' | 'back';
type ValueMode = 'instant' | 'average';

interface WidgetWitmotionSettings extends CustomWidgetPlugin {
    /** Base instance path, e.g. "witmotion.0" */
    instance?: string;
    /** Icon type */
    iconType?: IconType;
    /** Primary axis */
    axis1?: AxisType;
    /** Primary view angle */
    view1?: ViewType;
    /** Custom icon for top view */
    icon1?: string;
    /** Secondary axis (shown in wide mode) */
    axis2?: AxisType;
    /** Secondary view angle */
    view2?: ViewType;
    /** Visual multiplier for primary axis (e.g. 3 means 1° shows as 3° rotation) */
    multiplier1?: number;
    /** Visual multiplier for secondary axis */
    multiplier2?: number;
    /** Custom icon for side view */
    icon2?: string;
    /** Value mode */
    valueMode?: ValueMode;
}

interface WidgetWitmotionState extends WidgetGenericState {
    angle1: number | null;
    angle2: number | null;
    dialogOpen: boolean;
}

// --- SVG icon paths per object type and view ---
// Each object has 3 views: top (yaw), side (pitch), back (roll)

// Each icon uses multiple paths for better detail — joined with space, rendered via single <path>
const ICON_PATHS: Record<string, Record<ViewType, string>> = {
    car: {
        // Top view — car body from above with windshield and rear window
        top: 'M8 2 Q6 2 6 4 L6 20 Q6 22 8 22 L16 22 Q18 22 18 20 L18 4 Q18 2 16 2 Z M7 6 L17 6 M7 18 L17 18 M7 9 L17 9 L17 15 L7 15 Z',
        // Side view — sedan profile with wheels
        side: 'M3 15 L3 11 L7 11 L9 7 L17 7 L19 11 L21 11 L21 15 M6 16.5 A2 2 0 1 0 10 16.5 A2 2 0 1 0 6 16.5 M14 16.5 A2 2 0 1 0 18 16.5 A2 2 0 1 0 14 16.5',
        // Back view — rear with tail lights and bumper
        back: 'M5 18 L5 10 Q5 8 7 8 L17 8 Q19 8 19 10 L19 18 Q19 20 17 20 L7 20 Q5 20 5 18 Z M7 10 L11 10 L11 14 L7 14 Z M13 10 L17 10 L17 14 L13 14 Z M8 17 L10 17 M14 17 L16 17',
    },
};

function RotatedIcon({
    path,
    angle,
    size,
    color,
}: {
    path: string;
    angle: number;
    size: number;
    color?: string;
}): React.JSX.Element {
    return (
        <svg
            viewBox="0 0 24 24"
            style={{
                width: size,
                height: size,
                transform: `rotate(${angle}deg)`,
                transition: 'transform 0.3s ease',
                color: color || undefined,
            }}
        >
            <path
                fill="currentColor"
                fillOpacity={0.15}
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fillRule="evenodd"
                d={path}
            />
        </svg>
    );
}

export class WidgetWitmotion extends WidgetGeneric<WidgetWitmotionState, WidgetWitmotionSettings> {
    private handler1: ((id: string, state: ioBroker.State) => void) | null = null;
    private handler2: ((id: string, state: ioBroker.State) => void) | null = null;

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
                        default: 'witmotion.0',
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
            s.valueMode !== ps.valueMode
        ) {
            this.unsubscribeAngles();
            this.subscribe();
        }
    }

    componentWillUnmount(): void {
        super.componentWillUnmount?.();
        this.unsubscribeAngles();
    }

    private getStateId(axis: AxisType): string {
        const instance = this.props.settings.instance || 'witmotion.0';
        const suffix = this.props.settings.valueMode === 'average' ? 'Avg' : '';
        // witmotion.0.angle.zAvg
        return `${instance}.angle.${axis}${suffix}`;
    }

    private subscribe(): void {
        const ctx = this.props.stateContext;
        const axis1 = this.props.settings.axis1 || 'x';
        const id1 = this.getStateId(axis1);

        this.handler1 = (_id, state) => {
            this.setState({ angle1: state?.val != null ? Number(state.val) : null });
        };
        ctx.getState(id1, this.handler1);

        const axis2 = this.props.settings.axis2;
        const isWide = this.props.settings.size === '2x1' || this.props.settings.size === '2x0.5';
        if (axis2 && isWide) {
            const id2 = this.getStateId(axis2);
            this.handler2 = (_id, state) => {
                this.setState({ angle2: state?.val != null ? Number(state.val) : null });
            };
            ctx.getState(id2, this.handler2);
        }
    }

    private unsubscribeAngles(): void {
        const ctx = this.props.stateContext;
        const axis1 = this.props.settings.axis1 || 'x';
        if (this.handler1) {
            ctx.removeState(this.getStateId(axis1), this.handler1);
            this.handler1 = null;
        }
        const axis2 = this.props.settings.axis2;
        if (this.handler2 && axis2) {
            ctx.removeState(this.getStateId(axis2), this.handler2);
            this.handler2 = null;
        }
        this.setState({ angle1: null, angle2: null });
    }

    protected isTileActive(): boolean {
        return this.state.angle1 != null;
    }

    private renderIcon(
        isSecond: boolean,
        angle: number,
        size: number,
        view: ViewType,
        color?: string,
    ): React.JSX.Element {
        const iconType = this.props.settings.iconType || 'boat';

        // Custom icons from settings
        if (iconType === 'custom') {
            const customSrc = isSecond ? this.props.settings.icon2 : this.props.settings.icon1;
            if (customSrc) {
                return (
                    <img
                        src={customSrc}
                        alt=""
                        style={{
                            width: size,
                            height: size,
                            transform: `rotate(${angle}deg)`,
                            transition: 'transform 0.3s ease',
                            objectFit: 'contain',
                        }}
                    />
                );
            }
        }

        // Use PNG images for boat and car
        const images = OBJECT_IMAGES[iconType];
        if (images) {
            const showWater = iconType === 'boat' && (view === 'side' || view === 'back');
            const img = (
                <img
                    src={images[view] || images.side}
                    alt=""
                    style={{
                        width: size,
                        height: size,
                        transform: `rotate(${angle}deg)`,
                        transition: 'transform 0.3s ease',
                        objectFit: 'contain',
                        display: 'block',
                    }}
                />
            );
            if (showWater) {
                return (
                    <div
                        style={{
                            position: 'relative',
                            width: size,
                            height: size,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {img}
                        <WaterLevel
                            size={size}
                            view={view}
                        />
                    </div>
                );
            }
            return img;
        }

        // Fallback to SVG paths
        const paths = ICON_PATHS[iconType] || ICON_PATHS.car;
        return (
            <RotatedIcon
                path={paths[view]}
                angle={angle}
                size={size}
                color={color}
            />
        );
    }

    /** Render a compass ring with N/E/S/W labels and the icon in the center */
    private renderCompass(
        isSecond: boolean,
        angle: number | null,
        iconSize: number,
        accent?: string,
    ): React.JSX.Element {
        const ringSize = iconSize;
        const labelSize = Math.max(8, iconSize * 0.12);
        return (
            <Box sx={{ position: 'relative', width: ringSize, height: ringSize }}>
                {/* Compass circle */}
                <svg
                    viewBox="0 0 100 100"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                >
                    <circle
                        cx="50"
                        cy="50"
                        r="48"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        opacity={0.2}
                    />
                    {/* Tick marks every 30° */}
                    {Array.from({ length: 12 }, (_, i) => {
                        const a = (i * 30 - 90) * (Math.PI / 180);
                        const major = i % 3 === 0;
                        const r1 = major ? 42 : 44;
                        return (
                            <line
                                key={i}
                                x1={50 + Math.cos(a) * r1}
                                y1={50 + Math.sin(a) * r1}
                                x2={50 + Math.cos(a) * 48}
                                y2={50 + Math.sin(a) * 48}
                                stroke="currentColor"
                                strokeWidth={major ? 2 : 1}
                                opacity={0.3}
                            />
                        );
                    })}
                </svg>
                {/* N/E/S/W labels */}
                <Typography
                    sx={{
                        position: 'absolute',
                        top: 0,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: labelSize,
                        fontWeight: 700,
                        color: 'error.main',
                    }}
                >
                    N
                </Typography>
                <Typography
                    sx={{
                        position: 'absolute',
                        bottom: 0,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        fontSize: labelSize,
                        fontWeight: 500,
                        color: 'text.disabled',
                    }}
                >
                    S
                </Typography>
                <Typography
                    sx={{
                        position: 'absolute',
                        right: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: labelSize,
                        fontWeight: 500,
                        color: 'text.disabled',
                    }}
                >
                    E
                </Typography>
                <Typography
                    sx={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: labelSize,
                        fontWeight: 500,
                        color: 'text.disabled',
                    }}
                >
                    W
                </Typography>
                {/* Icon in center */}
                <Box sx={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                    {angle != null ? (
                        this.renderIcon(isSecond, angle, iconSize * 0.45, 'top', accent)
                    ) : (
                        <Typography sx={{ color: 'text.disabled', fontSize: iconSize * 0.4 }}>—</Typography>
                    )}
                </Box>
            </Box>
        );
    }

    private renderAnglePanel(
        angle: number | null,
        axis: string,
        view: ViewType,
        iconSize: number,
        fontSize: number,
        multiplier = 1,
        isSecond: boolean,
    ): React.JSX.Element {
        const accent = this.getAccentColor();
        const visualAngle = angle != null ? angle * multiplier : null;
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, flex: 1 }}>
                {view === 'top' ? (
                    this.renderCompass(isSecond, visualAngle, iconSize, accent)
                ) : visualAngle != null ? (
                    this.renderIcon(isSecond, visualAngle, iconSize, view, accent)
                ) : (
                    <Box
                        sx={{
                            width: iconSize,
                            height: iconSize,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Typography sx={{ color: 'text.disabled', fontSize: iconSize * 0.6 }}>—</Typography>
                    </Box>
                )}
                <Typography sx={{ fontSize, fontWeight: 700, color: accent || 'text.primary' }}>
                    {angle != null ? `${formatAngle(angle, 1, this.props.stateContext.isFloatComma)}°` : '—'}
                </Typography>
                <Typography
                    variant="caption"
                    sx={{
                        color: 'text.secondary',
                        fontWeight: 500,
                        textTransform: 'uppercase',
                        fontSize: fontSize * 0.55,
                    }}
                >
                    {axis.toUpperCase()}
                </Typography>
            </Box>
        );
    }

    renderCompact(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const axis1 = this.props.settings.axis1 || 'x';

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleCompact(theme)}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true } as any)}
                    sx={theme => ({
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        width: '100%',
                        aspectRatio: '1',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? 'max(12px, 8cqi)' : 'max(16px, 10cqi)',
                        gap: 0.5,
                    })}
                >
                    {this.renderAnglePanel(
                        this.state.angle1,
                        axis1,
                        this.props.settings.view1 || 'side',
                        64,
                        18,
                        this.props.settings.multiplier1 || 1,
                        false,
                    )}
                    {this.props.settings.name ? (
                        <Typography
                            ref={this.nameRef}
                            variant="body2"
                            sx={{
                                fontWeight: 600,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%',
                                textAlign: 'center',
                            }}
                        >
                            {this.props.settings.name}
                        </Typography>
                    ) : null}
                </Box>
                {this.renderSettingsButton()}
            </Box>
        );
    }

    /** 2x0.5 — thin bar, numbers only, no icons */
    renderWide(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const axis1 = this.props.settings.axis1 || 'x';
        const axis2 = this.props.settings.axis2;
        const { angle1, angle2 } = this.state;

        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => ({ ...WidgetGeneric.getStyleWide(theme), height: 80 })}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true } as any)}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        px: 2,
                        gap: 3,
                    })}
                >
                    {/* Name on the left */}
                    {this.props.settings.name ? (
                        <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: 'text.secondary', whiteSpace: 'nowrap' }}
                        >
                            {this.props.settings.name}
                        </Typography>
                    ) : null}
                    {/* Primary value */}
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                        <Typography
                            sx={{ fontSize: 28, fontWeight: 700, color: accent || 'text.primary', lineHeight: 1 }}
                        >
                            {angle1 != null ? `${formatAngle(angle1, 1, this.props.stateContext.isFloatComma)}°` : '—'}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontWeight: 500 }}
                        >
                            {axis1.toUpperCase()}
                        </Typography>
                    </Box>
                    {/* Secondary value */}
                    {axis2 ? (
                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                            <Typography
                                sx={{ fontSize: 28, fontWeight: 700, color: accent || 'text.primary', lineHeight: 1 }}
                            >
                                {angle2 != null
                                    ? `${formatAngle(angle2, 1, this.props.stateContext.isFloatComma)}°`
                                    : '—'}
                            </Typography>
                            <Typography
                                variant="caption"
                                sx={{ color: 'text.secondary', fontWeight: 500 }}
                            >
                                {axis2.toUpperCase()}
                            </Typography>
                        </Box>
                    ) : null}
                </Box>
                {this.renderSettingsButton()}
            </Box>
        );
    }

    /** 2x1 — full wide with icons */
    renderWideTall(): React.JSX.Element {
        const isActive = this.isTileActive();
        const accent = this.getAccentColor();
        const axis1 = this.props.settings.axis1 || 'x';
        const axis2 = this.props.settings.axis2;
        const showTwo = !!axis2;
        const view1 = this.props.settings.view1 || 'side';
        const mult1 = this.props.settings.multiplier1 || 1;
        const { angle1, angle2 } = this.state;
        const visualAngle1 = angle1 != null ? angle1 * mult1 : null;

        // Single axis: horizontal layout — icon left, value+name right
        if (!showTwo) {
            return (
                <Box
                    id={String(this.props.widget.id)}
                    className={this.getWidgetClass()}
                    sx={theme => WidgetGeneric.getStyleWide(theme)}
                >
                    <Box
                        onClick={() => this.setState({ dialogOpen: true } as any)}
                        sx={theme => ({
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '100%',
                            aspectRatio: '2',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            ...(getTileStyles(theme, isActive, accent) as any),
                            padding: isNeumorphicTheme(theme) ? '12px' : '16px',
                            gap: 2,
                        })}
                    >
                        {/* Icon / compass on the left */}
                        {view1 === 'top' ? (
                            this.renderCompass(false, visualAngle1, 90, accent)
                        ) : visualAngle1 != null ? (
                            this.renderIcon(false, visualAngle1, 90, view1, accent)
                        ) : (
                            <Box
                                sx={{
                                    width: 90,
                                    height: 90,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <Typography sx={{ color: 'text.disabled', fontSize: 40 }}>—</Typography>
                            </Box>
                        )}
                        {/* Value + axis + name on the right */}
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                                <Typography
                                    sx={{
                                        fontSize: 36,
                                        fontWeight: 700,
                                        color: accent || 'text.primary',
                                        lineHeight: 1,
                                    }}
                                >
                                    {angle1 != null
                                        ? `${formatAngle(angle1, 1, this.props.stateContext.isFloatComma)}°`
                                        : '—'}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary', fontWeight: 500, fontSize: 14 }}
                                >
                                    {axis1.toUpperCase()}
                                </Typography>
                            </Box>
                            {this.props.settings.name ? (
                                <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 600, color: 'text.secondary' }}
                                >
                                    {this.props.settings.name}
                                </Typography>
                            ) : null}
                        </Box>
                    </Box>
                    {this.renderSettingsButton()}
                </Box>
            );
        }

        // Two axes: side by side panels
        return (
            <Box
                id={String(this.props.widget.id)}
                className={this.getWidgetClass()}
                sx={theme => WidgetGeneric.getStyleWide(theme)}
            >
                <Box
                    onClick={() => this.setState({ dialogOpen: true } as any)}
                    sx={theme => ({
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        aspectRatio: '2',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        position: 'relative',
                        ...(getTileStyles(theme, isActive, accent) as any),
                        padding: isNeumorphicTheme(theme) ? '12px' : '16px',
                        gap: 1,
                    })}
                >
                    {this.renderAnglePanel(angle1, axis1, view1, 70, 20, mult1, false)}
                    {this.renderAnglePanel(
                        angle2,
                        axis2,
                        this.props.settings.view2 || 'back',
                        70,
                        20,
                        this.props.settings.multiplier2 || 1,
                        true,
                    )}
                    {this.props.settings.name ? (
                        <Box sx={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center' }}>
                            <Typography
                                variant="caption"
                                sx={{ fontWeight: 600, color: 'text.secondary' }}
                            >
                                {this.props.settings.name}
                            </Typography>
                        </Box>
                    ) : null}
                </Box>
                {this.renderSettingsButton()}
            </Box>
        );
    }

    /** Render fullscreen dialog with large icons and values */
    private renderDialog(): React.JSX.Element | null {
        if (!this.state.dialogOpen) {
            return null;
        }
        const axis1 = this.props.settings.axis1 || 'x';
        const axis2 = this.props.settings.axis2;
        const view1 = this.props.settings.view1 || 'side';
        const mult1 = this.props.settings.multiplier1 || 1;
        const { angle1, angle2 } = this.state;
        const showTwo = !!axis2;

        return (
            <Dialog
                open
                onClose={() => this.setState({ dialogOpen: false } as any)}
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
                    onClick={() => this.setState({ dialogOpen: false } as any)}
                    sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}
                >
                    <CloseIcon />
                </IconButton>
                <DialogContent
                    sx={{
                        display: 'flex',
                        flexDirection: showTwo ? 'row' : 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        p: 4,
                        overflow: 'hidden',
                    }}
                >
                    {showTwo ? (
                        <>
                            {this.renderDialogPanel(angle1, axis1, view1, mult1, false, true)}
                            {this.renderDialogPanel(
                                angle2,
                                axis2,
                                this.props.settings.view2 || 'back',
                                this.props.settings.multiplier2 || 1,
                                true,
                                true,
                            )}
                        </>
                    ) : (
                        this.renderDialogPanel(angle1, axis1, view1, mult1, false, false)
                    )}
                    {this.props.settings.name ? (
                        <Typography
                            sx={{
                                position: 'absolute',
                                bottom: 16,
                                left: 0,
                                right: 0,
                                textAlign: 'center',
                                fontSize: 20,
                                fontWeight: 600,
                                color: 'text.secondary',
                            }}
                        >
                            {this.props.settings.name}
                        </Typography>
                    ) : null}
                </DialogContent>
            </Dialog>
        );
    }

    /** Single axis panel for the dialog — large icon + value */
    private renderDialogPanel(
        angle: number | null,
        axis: string,
        view: ViewType,
        multiplier: number,
        isSecond: boolean,
        showTwo: boolean,
    ): React.JSX.Element {
        const accent = this.getAccentColor();
        const visualAngle = angle != null ? angle * multiplier : null;
        const valueFontCss = showTwo ? 'min(8vw, 12vh)' : 'min(14vw, 16vh)';
        const axisLabelCss = showTwo ? 'min(3vw, 5vh)' : 'min(6vw, 7vh)';

        return (
            <Box
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                <Box
                    sx={{
                        flex: 1,
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: 0,
                    }}
                >
                    {view === 'top' ? (
                        this.renderDialogIcon(isSecond, visualAngle, view, accent)
                    ) : visualAngle != null ? (
                        this.renderDialogIcon(isSecond, visualAngle, view, accent)
                    ) : (
                        <Typography sx={{ color: 'text.disabled', fontSize: valueFontCss }}>—</Typography>
                    )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, py: 2, flexShrink: 0 }}>
                    <Typography
                        sx={{ fontSize: valueFontCss, fontWeight: 700, color: accent || 'text.primary', lineHeight: 1 }}
                    >
                        {angle != null ? `${formatAngle(angle, 1, this.props.stateContext.isFloatComma)}°` : '—'}
                    </Typography>
                    <Typography sx={{ fontSize: axisLabelCss, color: 'text.secondary', fontWeight: 500 }}>
                        {axis.toUpperCase()}
                    </Typography>
                </Box>
            </Box>
        );
    }

    /** Render an icon for the dialog that fills its container */
    private renderDialogIcon(
        isSecond: boolean,
        angle: number | null,
        view: ViewType,
        accent?: string,
    ): React.JSX.Element {
        const iconType = this.props.settings.iconType || 'boat';
        const rotateAngle = angle ?? 0;

        if (view === 'top') {
            // Compass needs a pixel size — compute from window
            const compassSize = Math.min(window.innerWidth * 0.7, window.innerHeight * 0.6);
            return this.renderCompass(isSecond, angle, compassSize, accent);
        }

        // Custom icon
        if (iconType === 'custom') {
            const customSrc = isSecond ? this.props.settings.icon2 : this.props.settings.icon1;
            if (customSrc) {
                return (
                    <img
                        src={customSrc}
                        alt=""
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                            transform: `rotate(${rotateAngle}deg)`,
                            transition: 'transform 0.3s ease',
                        }}
                    />
                );
            }
        }

        // PNG images for boat/car
        const images = OBJECT_IMAGES[iconType];
        if (images) {
            const showWater = iconType === 'boat' && (view === 'side' || view === 'back');
            const img = (
                <img
                    src={images[view] || images.side}
                    alt=""
                    style={{
                        maxWidth: '100%',
                        maxHeight: showWater ? '75%' : '100%',
                        objectFit: 'contain',
                        transform: `rotate(${rotateAngle}deg)`,
                        transition: 'transform 0.3s ease',
                        display: 'block',
                    }}
                />
            );
            if (showWater) {
                // Water at the bottom of the container
                const waterH = view === 'side' ? '40%' : '35%';
                const waterTop = view === 'side' ? '55%' : '62%';
                return (
                    <div
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {img}
                        <svg
                            style={{
                                position: 'absolute',
                                left: 0,
                                top: waterTop,
                                width: '100%',
                                height: waterH,
                                pointerEvents: 'none',
                            }}
                            viewBox="0 0 400 120"
                            preserveAspectRatio="none"
                        >
                            <defs>
                                <linearGradient
                                    id="waterGradDialog"
                                    x1="0"
                                    y1="0"
                                    x2="0"
                                    y2="1"
                                >
                                    <stop
                                        offset="0%"
                                        stopColor="#1976d2"
                                        stopOpacity="0.15"
                                    />
                                    <stop
                                        offset="100%"
                                        stopColor="#1976d2"
                                        stopOpacity="0.35"
                                    />
                                </linearGradient>
                            </defs>
                            <path
                                fill="url(#waterGradDialog)"
                                d="M0,30 Q60,5 100,30 T200,30 T300,30 T400,30 L400,120 L0,120 Z"
                            >
                                <animateTransform
                                    attributeName="transform"
                                    type="translate"
                                    values="0,0; 20,0; 0,0"
                                    dur="3s"
                                    repeatCount="indefinite"
                                />
                            </path>
                            <path
                                fill="url(#waterGradDialog)"
                                opacity="0.5"
                                d="M0,45 Q80,20 120,45 T240,45 T360,45 T480,45 L400,120 L0,120 Z"
                            >
                                <animateTransform
                                    attributeName="transform"
                                    type="translate"
                                    values="0,0; -20,0; 0,0"
                                    dur="2.5s"
                                    repeatCount="indefinite"
                                />
                            </path>
                            <line
                                x1="0"
                                y1="30"
                                x2="400"
                                y2="30"
                                stroke="#1976d2"
                                strokeWidth="1"
                                opacity="0.3"
                            />
                        </svg>
                    </div>
                );
            }
            return img;
        }

        // Fallback SVG
        const paths = ICON_PATHS[iconType] || ICON_PATHS.car;
        const fallbackSize = Math.min(window.innerWidth * 0.5, window.innerHeight * 0.5);
        return (
            <RotatedIcon
                path={paths[view]}
                angle={rotateAngle}
                size={fallbackSize}
                color={accent}
            />
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
