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
}

/** The measured angles, null while unknown */
export interface OrientationValues {
    angle1: number | null;
    angle2: number | null;
}

export const DEFAULT_INSTANCE = 'witmotion.0';

/** State ID of an angle, e.g. `witmotion.0.angle.zAvg` */
export function getAngleStateId(instance: string | undefined, axis: AxisType, valueMode?: ValueMode): string {
    return `${instance || DEFAULT_INSTANCE}.angle.${axis}${valueMode === 'average' ? 'Avg' : ''}`;
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
