/**
 * The styles of the shadow roots. The element fills the box of the host; it has a transparent background and
 * inherits `color` and `font`, so it follows the theme of the host. The pictures of `src-shared/OrientationView.tsx`
 * take their colors from `currentColor` and fixed signal colors (north, water), so they fit a light and a dark theme
 * alike; the secondary texts are only dimmed, like in the native widgets.
 *
 * All sizes are container units of the box (`.mount`, or `.details` in the dialog): `--w` and `--h` are its inner
 * width and height, `--size` the size of a picture, with the proportions of the native views.
 *
 * The automatic layout is chosen by container queries on the box, with the limits of the vis-2 widget: `full` from
 * 480 x 360 px, `bar` when it is flat (at most 110 px high and 2.5 times as wide as high), `wide` from 1.5 times as
 * wide as high, `compact` otherwise. All candidate views are in the DOM; only the matching one is shown.
 */
const VIEW_STYLES = `
.orientation {
    width: 100%;
    height: 100%;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.view {
    --pad: clamp(4px, 4cqmin, 12px);
    --w: calc(100cqw - 2 * var(--pad));
    --h: calc(100cqh - 2 * var(--pad));
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: var(--pad);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    overflow: hidden;
    min-width: 0;
}
.view.clickable {
    cursor: pointer;
}
.view.clickable:focus-visible {
    outline: 2px solid var(--iob-primary);
    outline-offset: -2px;
    border-radius: var(--iob-border-radius);
}
.picture {
    flex: none;
    width: var(--size);
    height: var(--size);
    position: relative;
}
.no-value {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: calc(var(--size) * 0.5);
    opacity: 0.38;
}
.panel {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}
.row {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 0;
}
.inline {
    display: flex;
    align-items: baseline;
    gap: 0.25em;
    white-space: nowrap;
}
.value {
    font-weight: 700;
    line-height: 1.2;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}
.axis {
    font-weight: 500;
    line-height: 1.2;
    text-transform: uppercase;
    opacity: 0.7;
}
.name {
    font-weight: 600;
    line-height: 1.3;
    opacity: 0.7;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    max-width: 100%;
    text-align: center;
}

/* one axis: the picture, the value and the axis below it, the name at the bottom */
.compact {
    --size: max(24px, min(var(--w) * 0.8, var(--h) * 0.5));
}
.compact .value {
    font-size: calc(var(--size) * 0.3);
}
.compact .axis {
    font-size: max(10px, calc(var(--size) * 0.16));
}
.compact .name {
    font-size: clamp(10px, calc(var(--h) * 0.09), 14px);
}

/* flat: the name and the values in a row, no pictures */
.bar {
    --h: 100cqh;
    --fs: clamp(12px, min(var(--h) * 0.4, var(--w) * 0.09), 40px);
    flex-direction: row;
    gap: var(--fs);
    padding-top: 0;
    padding-bottom: 0;
}
.bar .value {
    font-size: var(--fs);
    line-height: 1;
}
.bar .axis {
    font-size: max(10px, calc(var(--fs) * 0.45));
}
.bar .name {
    flex: 0 1 auto;
    min-width: 0;
    font-size: clamp(10px, calc(var(--h) * 0.2), 14px);
}

/* wide, one axis: the picture with the value and the name next to it; the value leaves room for -179.9° */
.wide {
    --size: max(32px, min(var(--w) * 0.42, var(--h) * 0.9));
    flex-direction: row;
    gap: clamp(8px, 5cqw, 16px);
}
.wide .text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}
.wide .value {
    font-size: min(var(--size) * 0.4, var(--w) * 0.13);
    line-height: 1;
}
.wide .axis {
    font-size: max(10px, calc(var(--size) * 0.18));
}
.wide .name {
    font-size: clamp(10px, calc(var(--size) * 0.16), 14px);
    text-align: left;
}

/* wide, two axes: both side by side, the name below */
.wide.two {
    --size: max(32px, min((var(--w) - 8px) / 2, var(--h) * 0.5));
    flex-direction: column;
    gap: 4px;
}
.wide.two .row {
    gap: 8px;
}
.wide.two .value {
    font-size: calc(var(--size) * 0.29);
    line-height: 1.2;
}
.wide.two .axis {
    font-size: max(10px, calc(var(--size) * 0.16));
}
.wide.two .name {
    font-size: clamp(10px, calc(var(--h) * 0.08), 12px);
    text-align: center;
}

/* big: one or both axes with big pictures, the name below */
.full {
    --cols: 1;
    --gap: clamp(8px, 4cqw, 32px);
    --size: max(32px, min((var(--w) - var(--gap) * (var(--cols) - 1)) * 0.9 / var(--cols), var(--h) * 0.55));
    gap: clamp(8px, 3cqmin, 16px);
}
.full.two {
    --cols: 2;
}
.full .row {
    gap: var(--gap);
}
.full .value {
    font-size: calc(var(--size) * 0.22);
}
.full.two .value {
    font-size: calc(var(--size) * 0.2);
}
.full .axis {
    font-size: max(10px, calc(var(--size) * 0.12));
}
.full .name {
    font-size: clamp(12px, 4cqmin, 20px);
}
`;

export const STYLES = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it */
    container-type: size;
    container-name: witmotion;
}
${VIEW_STYLES}
.auto > .view {
    display: none;
}
.auto > .view.compact {
    display: flex;
}
@container witmotion (aspect-ratio >= 3 / 2) {
    .auto > .view.compact {
        display: none;
    }
    .auto > .view.wide {
        display: flex;
    }
}
@container witmotion (aspect-ratio >= 5 / 2) and (height <= 110px) {
    .auto > .view.wide {
        display: none;
    }
    .auto > .view.bar {
        display: flex;
    }
}
@container witmotion (width >= 480px) and (height >= 360px) {
    .auto > .view.compact,
    .auto > .view.wide,
    .auto > .view.bar {
        display: none;
    }
    .auto > .view.full {
        display: flex;
    }
}
.hint {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    text-align: center;
    font-size: clamp(11px, 6cqmin, 15px);
}
.hint span {
    opacity: 0.7;
}
.hint svg {
    width: clamp(18px, 14cqmin, 36px);
    height: clamp(18px, 14cqmin, 36px);
    fill: currentColor;
    opacity: 0.7;
}
.hint.warning svg {
    fill: var(--iob-warning);
    opacity: 1;
}
`;

/** The big view in a dialog of the host: a box of its own to size the pictures by, in the colors of the dialog */
export const DIALOG_STYLES = `
:host {
    display: block;
}
.details {
    width: 100%;
    height: min(70vh, 600px);
    color: inherit;
    font: inherit;
    container-type: size;
    container-name: witmotion;
}
${VIEW_STYLES}
`;
