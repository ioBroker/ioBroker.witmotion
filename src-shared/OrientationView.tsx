/**
 * Views of the WitMotion orientation: a boat or car (or a custom picture) rotated by the measured angle,
 * a compass for the top view and the values.
 *
 * Shared by the tile of the devices app and the vis-2 widget. They use plain elements and no hooks, so it
 * does not matter which copy of React renders them, and they take all colors from their parent: the
 * secondary texts are only dimmed.
 */
import type React from 'react';

import boatTopPng from './assets/boat_top.png';
import boatSidePng from './assets/boat_side.png';
import boatBackPng from './assets/boat_back.png';
import carTopPng from './assets/car_top.png';
import carSidePng from './assets/car_side.png';
import carBackPng from './assets/back_back.png';

import { formatAngle, type AxisType, type OrientationSettings, type OrientationValues, type ViewType } from './orientation';

const OBJECT_IMAGES: Record<string, Record<ViewType, string>> = {
    boat: { top: boatTopPng, side: boatSidePng, back: boatBackPng },
    car: { top: carTopPng, side: carSidePng, back: carBackPng },
};

/** Fallback outlines if a picture is missing */
const ICON_PATHS: Record<ViewType, string> = {
    // Top view — car body from above with windshield and rear window
    top: 'M8 2 Q6 2 6 4 L6 20 Q6 22 8 22 L16 22 Q18 22 18 20 L18 4 Q18 2 16 2 Z M7 6 L17 6 M7 18 L17 18 M7 9 L17 9 L17 15 L7 15 Z',
    // Side view — sedan profile with wheels
    side: 'M3 15 L3 11 L7 11 L9 7 L17 7 L19 11 L21 11 L21 15 M6 16.5 A2 2 0 1 0 10 16.5 A2 2 0 1 0 6 16.5 M14 16.5 A2 2 0 1 0 18 16.5 A2 2 0 1 0 14 16.5',
    // Back view — rear with tail lights and bumper
    back: 'M5 18 L5 10 Q5 8 7 8 L17 8 Q19 8 19 10 L19 18 Q19 20 17 20 L7 20 Q5 20 5 18 Z M7 10 L11 10 L11 14 L7 14 Z M13 10 L17 10 L17 14 L13 14 Z M8 17 L10 17 M14 17 L16 17',
};

const WATER = '#1976d2';
const NORTH = '#f44336';
const SECONDARY_OPACITY = 0.7;
const DISABLED_OPACITY = 0.38;

export interface OrientationViewProps {
    settings: OrientationSettings;
    values: OrientationValues;
    /** Shown below or next to the values. Nothing if empty */
    name?: string;
    /** Color of the values. Inherited if not set */
    accent?: string;
    isFloatComma?: boolean;
}

function rotation(angle: number): React.CSSProperties {
    return { transform: `rotate(${angle}deg)`, transition: 'transform 0.3s ease' };
}

/** Animated waves over the lower part of the boat */
function Water(props: { view: ViewType }): React.JSX.Element {
    return (
        <svg
            style={{
                position: 'absolute',
                left: 0,
                // Side view: water higher up to overlap the hull; back view: just slightly higher
                top: props.view === 'side' ? '50%' : '58%',
                width: '100%',
                height: '35%',
                pointerEvents: 'none',
            }}
            viewBox="0 0 400 120"
            preserveAspectRatio="none"
        >
            <path
                fill={WATER}
                fillOpacity={0.22}
                d="M0,36 Q60,6 100,36 T200,36 T300,36 T400,36 L400,120 L0,120 Z"
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
                fill={WATER}
                fillOpacity={0.14}
                d="M0,54 Q80,24 120,54 T240,54 T360,54 T480,54 L400,120 L0,120 Z"
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
                y1="36"
                x2="400"
                y2="36"
                stroke={WATER}
                strokeWidth="1"
                opacity="0.3"
                vectorEffect="non-scaling-stroke"
            />
        </svg>
    );
}

/** The object of the settings in the given view, rotated by `angle` */
export function ObjectIcon(props: {
    settings: OrientationSettings;
    isSecond: boolean;
    view: ViewType;
    angle: number;
    /** Pixels or any CSS length */
    size: number | string;
}): React.JSX.Element {
    const iconType = props.settings.iconType || 'boat';
    const box: React.CSSProperties = { width: props.size, height: props.size };

    if (iconType === 'custom') {
        const src = props.isSecond ? props.settings.icon2 : props.settings.icon1;
        if (src) {
            return (
                <img
                    src={src}
                    alt=""
                    style={{ ...box, objectFit: 'contain', display: 'block', ...rotation(props.angle) }}
                />
            );
        }
    }

    const images = OBJECT_IMAGES[iconType];
    if (images) {
        const img = (
            <img
                src={images[props.view] || images.side}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', ...rotation(props.angle) }}
            />
        );
        return (
            <div style={{ ...box, position: 'relative', flexShrink: 0 }}>
                {img}
                {iconType === 'boat' && props.view !== 'top' ? <Water view={props.view} /> : null}
            </div>
        );
    }

    return (
        <svg
            viewBox="0 0 24 24"
            style={{ ...box, display: 'block', ...rotation(props.angle) }}
        >
            <path
                fill="currentColor"
                fillOpacity={0.15}
                stroke="currentColor"
                strokeWidth={1.2}
                strokeLinejoin="round"
                strokeLinecap="round"
                fillRule="evenodd"
                d={ICON_PATHS[props.view]}
            />
        </svg>
    );
}

/** A "—" in a box of the icon's size, while the angle is unknown */
function NoValue(props: { size: number | string }): React.JSX.Element {
    return (
        <div
            style={{
                width: props.size,
                height: props.size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: DISABLED_OPACITY,
                fontSize: typeof props.size === 'number' ? props.size * 0.5 : '2em',
                flexShrink: 0,
            }}
        >
            —
        </div>
    );
}

/** Compass ring with N/E/S/W and the object from above, rotated by the heading */
export function Compass(props: {
    settings: OrientationSettings;
    isSecond: boolean;
    angle: number | null;
    size: number | string;
}): React.JSX.Element {
    const label = (text: string, x: number, y: number, north?: boolean): React.JSX.Element => (
        <text
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={12}
            fontWeight={north ? 700 : 500}
            fill={north ? NORTH : 'currentColor'}
            fillOpacity={north ? 1 : 0.45}
        >
            {text}
        </text>
    );

    return (
        <div style={{ position: 'relative', width: props.size, height: props.size, flexShrink: 0 }}>
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
                {label('N', 50, 12, true)}
                {label('S', 50, 88)}
                {label('E', 88, 50)}
                {label('W', 12, 50)}
            </svg>
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    width: '45%',
                    height: '45%',
                    transform: 'translate(-50%, -50%)',
                }}
            >
                {props.angle !== null ? (
                    <ObjectIcon
                        settings={props.settings}
                        isSecond={props.isSecond}
                        view="top"
                        angle={props.angle}
                        size="100%"
                    />
                ) : (
                    <NoValue size="100%" />
                )}
            </div>
        </div>
    );
}

/** Compass for the top view, otherwise the rotated object */
function Picture(props: {
    settings: OrientationSettings;
    isSecond: boolean;
    view: ViewType;
    angle: number | null;
    multiplier: number;
    size: number | string;
}): React.JSX.Element {
    const visual = props.angle !== null ? props.angle * props.multiplier : null;
    if (props.view === 'top') {
        return (
            <Compass
                settings={props.settings}
                isSecond={props.isSecond}
                angle={visual}
                size={props.size}
            />
        );
    }
    if (visual === null) {
        return <NoValue size={props.size} />;
    }
    return (
        <ObjectIcon
            settings={props.settings}
            isSecond={props.isSecond}
            view={props.view}
            angle={visual}
            size={props.size}
        />
    );
}

/** The value with its axis next to it */
function Value(props: {
    angle: number | null;
    axis: AxisType;
    fontSize: number;
    accent?: string;
    isFloatComma?: boolean;
}): React.JSX.Element {
    return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: props.fontSize * 0.25, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: props.fontSize, fontWeight: 700, lineHeight: 1, color: props.accent }}>
                {formatAngle(props.angle, props.isFloatComma)}
            </span>
            <span style={{ fontSize: Math.max(10, props.fontSize * 0.45), fontWeight: 500, opacity: SECONDARY_OPACITY }}>
                {props.axis.toUpperCase()}
            </span>
        </div>
    );
}

function Name(props: { name?: string; fontSize: number; style?: React.CSSProperties }): React.JSX.Element | null {
    if (!props.name) {
        return null;
    }
    return (
        <div
            style={{
                fontSize: props.fontSize,
                fontWeight: 600,
                opacity: SECONDARY_OPACITY,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
                textAlign: 'center',
                ...props.style,
            }}
        >
            {props.name}
        </div>
    );
}

/** Picture, value and axis of one axis, one below the other */
function AnglePanel(props: {
    settings: OrientationSettings;
    isSecond: boolean;
    angle: number | null;
    size: number;
    fontSize: number;
    accent?: string;
    isFloatComma?: boolean;
}): React.JSX.Element {
    const s = props.settings;
    const axis = (props.isSecond ? s.axis2 : s.axis1) || 'x';
    const view = (props.isSecond ? s.view2 || 'back' : s.view1) || 'side';
    const multiplier = (props.isSecond ? s.multiplier2 : s.multiplier1) || 1;
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
                flex: 1,
                minWidth: 0,
            }}
        >
            <Picture
                settings={s}
                isSecond={props.isSecond}
                view={view}
                angle={props.angle}
                multiplier={multiplier}
                size={props.size}
            />
            <div style={{ fontSize: props.fontSize, fontWeight: 700, lineHeight: 1.2, color: props.accent }}>
                {formatAngle(props.angle, props.isFloatComma)}
            </div>
            <div
                style={{
                    fontSize: Math.max(10, props.fontSize * 0.55),
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    opacity: SECONDARY_OPACITY,
                }}
            >
                {axis}
            </div>
        </div>
    );
}

/** One axis with its picture, the name below. `size` is the size of the picture in pixels */
export function OrientationCompactView(props: OrientationViewProps & { size?: number }): React.JSX.Element {
    const size = props.size || 64;
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                width: '100%',
                minWidth: 0,
            }}
        >
            <AnglePanel
                settings={props.settings}
                isSecond={false}
                angle={props.values.angle1}
                size={size}
                fontSize={Math.round(size * 0.28)}
                accent={props.accent}
                isFloatComma={props.isFloatComma}
            />
            <Name
                name={props.name}
                fontSize={14}
            />
        </div>
    );
}

/** Thin bar: name and the values only, no pictures */
export function OrientationBarView(props: OrientationViewProps & { fontSize?: number }): React.JSX.Element {
    const fontSize = props.fontSize || 28;
    const s = props.settings;
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: fontSize,
                width: '100%',
                minWidth: 0,
            }}
        >
            <Name
                name={props.name}
                fontSize={14}
                style={{ flexShrink: 1, width: 'auto' }}
            />
            <Value
                angle={props.values.angle1}
                axis={s.axis1 || 'x'}
                fontSize={fontSize}
                accent={props.accent}
                isFloatComma={props.isFloatComma}
            />
            {s.axis2 ? (
                <Value
                    angle={props.values.angle2}
                    axis={s.axis2}
                    fontSize={fontSize}
                    accent={props.accent}
                    isFloatComma={props.isFloatComma}
                />
            ) : null}
        </div>
    );
}

/**
 * Twice as wide as high: one axis as picture with the value next to it, or both axes side by side.
 * `size` is the size of one picture in pixels.
 */
export function OrientationWideView(props: OrientationViewProps & { size?: number }): React.JSX.Element {
    const s = props.settings;
    if (!s.axis2) {
        const size = props.size || 90;
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 16,
                    width: '100%',
                    minWidth: 0,
                }}
            >
                <Picture
                    settings={s}
                    isSecond={false}
                    view={s.view1 || 'side'}
                    angle={props.values.angle1}
                    multiplier={s.multiplier1 || 1}
                    size={size}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <Value
                        angle={props.values.angle1}
                        axis={s.axis1 || 'x'}
                        fontSize={Math.round(size * 0.4)}
                        accent={props.accent}
                        isFloatComma={props.isFloatComma}
                    />
                    <Name
                        name={props.name}
                        fontSize={14}
                        style={{ textAlign: 'left' }}
                    />
                </div>
            </div>
        );
    }

    const size = props.size || 70;
    const fontSize = Math.round(size * 0.29);
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                width: '100%',
                minWidth: 0,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <AnglePanel
                    settings={s}
                    isSecond={false}
                    angle={props.values.angle1}
                    size={size}
                    fontSize={fontSize}
                    accent={props.accent}
                    isFloatComma={props.isFloatComma}
                />
                <AnglePanel
                    settings={s}
                    isSecond
                    angle={props.values.angle2}
                    size={size}
                    fontSize={fontSize}
                    accent={props.accent}
                    isFloatComma={props.isFloatComma}
                />
            </div>
            <Name
                name={props.name}
                fontSize={12}
            />
        </div>
    );
}

/** Size of a picture in the full view for a box of the given size */
export function getFullViewSize(settings: OrientationSettings, width: number, height: number): number {
    const columns = settings.axis2 ? 2 : 1;
    // room for the value and the name below the picture
    return Math.max(80, Math.floor(Math.min((width * 0.9) / columns, height * 0.65)));
}

/** Big pictures and values for a dialog or a large widget. `size` is the size of one picture in pixels */
export function OrientationFullView(props: OrientationViewProps & { size: number }): React.JSX.Element {
    const s = props.settings;
    const fontSize = Math.round(props.size * (s.axis2 ? 0.2 : 0.22));
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
                width: '100%',
                height: '100%',
                minWidth: 0,
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, width: '100%' }}>
                <AnglePanel
                    settings={s}
                    isSecond={false}
                    angle={props.values.angle1}
                    size={props.size}
                    fontSize={fontSize}
                    accent={props.accent}
                    isFloatComma={props.isFloatComma}
                />
                {s.axis2 ? (
                    <AnglePanel
                        settings={s}
                        isSecond
                        angle={props.values.angle2}
                        size={props.size}
                        fontSize={fontSize}
                        accent={props.accent}
                        isFloatComma={props.isFloatComma}
                    />
                ) : null}
            </div>
            <Name
                name={props.name}
                fontSize={20}
            />
        </div>
    );
}
