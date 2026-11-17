/**
 * Settings and helpers of the orientation views, shared by the tile of the devices app and the vis-2 widget.
 */

export type AxisType = 'x' | 'y' | 'z';
export type IconType = 'boat' | 'car' | 'custom';
export type ViewType = 'top' | 'side' | 'back';
export type ValueMode = 'instant' | 'average';

/** What the views show and how */
export interface OrientationSettings {
    /** Object to draw */
    iconType?: IconType;
    /** Primary axis */
    axis1?: AxisType;
    /** Primary view angle */
    view1?: ViewType;
    /** Visual multiplier for the primary axis (e.g. 3 means 1° shows as 3° rotation) */
    multiplier1?: number;
    /** Custom icon of the primary axis */
    icon1?: string;
    /** Secondary axis (shown in the wide views only) */
    axis2?: AxisType | '';
    /** Secondary view angle */
    view2?: ViewType;
    /** Visual multiplier for the secondary axis */
    multiplier2?: number;
    /** Custom icon of the secondary axis */
    icon2?: string;
    /**
     * Show the wave height, in the wide and big views with the length and frequency of the waves, if the
     * instance measures the waves. Default true
     */
    showWaves?: boolean;
}

/** The measured angles, null while unknown */
export interface OrientationValues {
    angle1: number | null;
    angle2: number | null;
    /** Significant wave height in m; null while unknown or if the instance does not measure the waves */
    waveHeight?: number | null;
    /** Deep-water length of the waves of the peak period in m; 0 in calm water */
    waveLength?: number | null;
    /** Frequency of the spectral peak in Hz; 0 in calm water */
    waveFrequency?: number | null;
}

/** The wave states the views show, by the last part of their ID */
export type WaveValue = 'height' | 'length' | 'frequency';

export const WAVE_VALUES: readonly WaveValue[] = ['height', 'length', 'frequency'];

/** The field of `OrientationValues` of a wave state */
export const WAVE_FIELDS: Record<WaveValue, 'waveHeight' | 'waveLength' | 'waveFrequency'> = {
    height: 'waveHeight',
    length: 'waveLength',
    frequency: 'waveFrequency',
};

export const DEFAULT_INSTANCE = 'witmotion.0';

/** State ID of an angle, e.g. `witmotion.0.angle.zAvg` */
export function getAngleStateId(instance: string | undefined, axis: AxisType, valueMode?: ValueMode): string {
    return `${instance || DEFAULT_INSTANCE}.angle.${axis}${valueMode === 'average' ? 'Avg' : ''}`;
}

/** State ID of a wave value, e.g. `witmotion.0.waves.height` */
export function getWaveStateId(instance: string | undefined, value: WaveValue): string {
    return `${instance || DEFAULT_INSTANCE}.waves.${value}`;
}

/** Number of a state value, null if it is not a finite number */
export function toAngle(val: ioBroker.StateValue | undefined): number | null {
    if (val === null || val === undefined || val === '') {
        return null;
    }
    const num = Number(val);
    return Number.isFinite(num) ? num : null;
}

/** Angle with one decimal and the degree sign, respecting `isFloatComma` */
export function formatAngle(val: number | null, isFloatComma?: boolean): string {
    if (val === null) {
        return '—';
    }
    const str = val.toFixed(1);
    return `${isFloatComma ? str.replace('.', ',') : str}°`;
}

function formatNumber(val: number | null | undefined, digits: number, unit: string, isFloatComma?: boolean): string {
    if (val === null || val === undefined) {
        return '—';
    }
    const str = val.toFixed(digits);
    return `${isFloatComma ? str.replace('.', ',') : str} ${unit}`;
}

/** Wave height in metres with two decimals (one from 10 m on), respecting `isFloatComma` */
export function formatWaveHeight(val: number | null | undefined, isFloatComma?: boolean): string {
    return formatNumber(val, val != null && Math.abs(val) >= 10 ? 1 : 2, 'm', isFloatComma);
}

/** Wave length in metres with one decimal (none from 10 m on), respecting `isFloatComma` */
export function formatWaveLength(val: number | null | undefined, isFloatComma?: boolean): string {
    return formatNumber(val, val != null && Math.abs(val) >= 10 ? 0 : 1, 'm', isFloatComma);
}

/** Wave frequency in Hz with two decimals, respecting `isFloatComma` */
export function formatWaveFrequency(val: number | null | undefined, isFloatComma?: boolean): string {
    return formatNumber(val, 2, 'Hz', isFloatComma);
}
