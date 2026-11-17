/**
 * Wave statistics from the vertical motion (heave) of the sensor.
 *
 * The sensor delivers its acceleration in its own frame and its orientation (roll = angle X, pitch = angle Y).
 * The acceleration is turned into the earth frame and its vertical part is integrated twice in the frequency
 * domain, band-limited to the wave periods of interest, so the drift of the integration is cut off. The
 * resulting heave is evaluated like the record of a wave buoy: significant wave height Hs = 4·σ, the highest
 * single wave, the periods by zero-up-crossing and from the spectral peak, and for the peak its frequency and
 * the length of such waves in deep water.
 *
 * On a boat the result is the motion of the boat: waves much shorter than the hull are damped, and while the
 * boat moves the periods are encounter periods, not the periods of the waves.
 */

export const GRAVITY = 9.80665;

/**
 * Below this significant wave height (m) the water counts as calm: the noise of the sensor alone gives a few
 * centimetres, so the periods, the length and the frequency are 0 then.
 */
export const CALM_HEIGHT = 0.05;

/**
 * Length of a wave of the given period in deep water, m: L = g·T²/(2π). In water shallower than half of that,
 * the waves are shorter.
 */
export function deepWaterLength(period: number): number {
    return (GRAVITY * period * period) / (2 * Math.PI);
}

export interface Vector {
    x: number;
    y: number;
    z: number;
}

export interface WaveOptions {
    /** Shortest wave period that is counted, s */
    minPeriod: number;
    /** Longest wave period that is counted, s */
    maxPeriod: number;
}

export interface WaveResult {
    /** Significant wave height Hs = 4·σ of the heave, m */
    height: number;
    /** Highest single wave (trough to crest) in the analysed record, m */
    heightMax: number;
    /** Mean zero-up-crossing period, s; 0 in calm water */
    period: number;
    /** Period of the spectral peak, s; 0 in calm water */
    periodPeak: number;
    /** Deep-water length of the waves of the peak period, m; 0 in calm water */
    length: number;
    /** Frequency of the spectral peak, Hz; 0 in calm water */
    frequency: number;
    /** Number of waves counted by zero-up-crossing */
    waves: number;
    /** Sample rate of the analysed record, Hz */
    sampleRate: number;
    /** Length of the analysed record (without the margins cut off), s */
    duration: number;
}

/**
 * Vertical (earth frame, pointing up) component of the measured acceleration, in the unit of `acc`.
 *
 * The sensor uses the aerospace Z-Y-X convention: at rest it measures `[-sin(pitch), sin(roll)·cos(pitch),
 * cos(roll)·cos(pitch)]` g, so a sensor at rest gives 1 g in any orientation.
 *
 * @param acc acceleration in the sensor frame
 * @param rollDeg angle X in degrees
 * @param pitchDeg angle Y in degrees
 */
export function verticalAcceleration(acc: Vector, rollDeg: number, pitchDeg: number): number {
    const roll = (rollDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cosPitch = Math.cos(pitch);
    return -Math.sin(pitch) * acc.x + Math.sin(roll) * cosPitch * acc.y + Math.cos(roll) * cosPitch * acc.z;
}

/** In-place radix-2 FFT. The length must be a power of two. The inverse transform is scaled by 1/n */
function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1;
        while (j & bit) {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if (i < j) {
            let tmp = re[i];
            re[i] = re[j];
            re[j] = tmp;
            tmp = im[i];
            im[i] = im[j];
            im[j] = tmp;
        }
    }
    for (let len = 2; len <= n; len <<= 1) {
        const half = len >> 1;
        const angle = ((inverse ? 2 : -2) * Math.PI) / len;
        for (let k = 0; k < half; k++) {
            const wRe = Math.cos(angle * k);
            const wIm = Math.sin(angle * k);
            for (let i = k; i < n; i += len) {
                const j = i + half;
                const bRe = re[j] * wRe - im[j] * wIm;
                const bIm = re[j] * wIm + im[j] * wRe;
                re[j] = re[i] - bRe;
                im[j] = im[i] - bIm;
                re[i] += bRe;
                im[i] += bIm;
            }
        }
    }
    if (inverse) {
        for (let i = 0; i < n; i++) {
            re[i] /= n;
            im[i] /= n;
        }
    }
}

/**
 * Pass band with smooth edges: 0 below 0.8·fLow, 1 from fLow to fHigh, 0 above 1.5·fHigh.
 * The lower edge is kept steep, because the double integration amplifies the sensor noise there by 1/f⁴.
 */
function bandGain(f: number, fLow: number, fHigh: number): number {
    if (f <= fLow * 0.8 || f >= fHigh * 1.5) {
        return 0;
    }
    if (f < fLow) {
        return Math.sin(((f - fLow * 0.8) / (fLow * 0.2)) * (Math.PI / 2)) ** 2;
    }
    if (f > fHigh) {
        return Math.cos(((f - fHigh) / (fHigh / 2)) * (Math.PI / 2)) ** 2;
    }
    return 1;
}

/**
 * Heave and wave statistics from a record of vertical acceleration.
 *
 * @param acceleration vertical acceleration in m/s², equally spaced; a constant offset (gravity) does not matter
 * @param sampleRate samples per second
 * @param options band of the wave periods
 * @returns null if the record is too short for the longest period
 */
export function analyzeHeave(
    acceleration: ArrayLike<number>,
    sampleRate: number,
    options: WaveOptions,
): WaveResult | null {
    const n = acceleration.length;
    if (!(sampleRate > 0) || !(options.minPeriod > 0) || !(options.maxPeriod > options.minPeriod)) {
        return null;
    }
    const fLow = 1 / options.maxPeriod;
    // The upper edge of the band must stay below the Nyquist frequency
    const fHigh = Math.min(1 / options.minPeriod, sampleRate / 3);
    if (fHigh <= fLow) {
        return null;
    }

    // The ends of the record are tapered and carry the transients of the filter, so they are not evaluated
    const margin = Math.max(Math.round(n * 0.1), Math.round(options.maxPeriod * sampleRate));
    const start = margin;
    const end = n - margin;
    if (end - start < 2 * options.maxPeriod * sampleRate) {
        return null;
    }

    // Remove offset and linear trend (least squares)
    const meanX = (n - 1) / 2;
    let meanY = 0;
    for (let i = 0; i < n; i++) {
        meanY += acceleration[i];
    }
    meanY /= n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
        sxy += (i - meanX) * (acceleration[i] - meanY);
        sxx += (i - meanX) ** 2;
    }
    const slope = sxx ? sxy / sxx : 0;

    // Zero padding to at least twice the length keeps the wrap-around of the filter away from the record
    let size = 1;
    while (size < n * 2) {
        size <<= 1;
    }
    const re = new Float64Array(size);
    const im = new Float64Array(size);
    for (let i = 0; i < n; i++) {
        let w = 1;
        if (i < margin) {
            w = 0.5 * (1 - Math.cos((Math.PI * i) / margin));
        } else if (i >= n - margin) {
            w = 0.5 * (1 - Math.cos((Math.PI * (n - 1 - i)) / margin));
        }
        re[i] = (acceleration[i] - meanY - slope * (i - meanX)) * w;
    }

    fft(re, im, false);

    // Double integration: heave = -acceleration / ω², only inside the band
    const power = new Float64Array(size / 2 + 1);
    re[0] = 0;
    im[0] = 0;
    for (let k = 1; k <= size / 2; k++) {
        const f = (k * sampleRate) / size;
        const omega = 2 * Math.PI * f;
        const gain = -bandGain(f, fLow, fHigh) / (omega * omega);
        re[k] *= gain;
        im[k] *= gain;
        power[k] = re[k] * re[k] + im[k] * im[k];
        if (k < size / 2) {
            re[size - k] *= gain;
            im[size - k] *= gain;
        }
    }

    // Peak period from the smoothed spectrum of the heave (a raw periodogram is too noisy)
    const halfWidth = Math.max(1, Math.round((2 * size) / n));
    let peakPower = 0;
    let peakFrequency = 0;
    let sum = 0;
    let count = 0;
    const kMax = size / 2;
    for (let k = 1; k <= Math.min(kMax, halfWidth); k++) {
        sum += power[k];
        count++;
    }
    for (let k = 1; k <= kMax; k++) {
        const add = k + halfWidth;
        if (add <= kMax) {
            sum += power[add];
            count++;
        }
        const remove = k - halfWidth - 1;
        if (remove >= 1) {
            sum -= power[remove];
            count--;
        }
        const f = (k * sampleRate) / size;
        if (f >= fLow && f <= fHigh && sum / count > peakPower) {
            peakPower = sum / count;
            peakFrequency = f;
        }
    }

    fft(re, im, true);
    const heave = re;

    // Significant wave height from the standard deviation of the heave
    let mean = 0;
    for (let i = start; i < end; i++) {
        mean += heave[i];
    }
    mean /= end - start;
    let variance = 0;
    for (let i = start; i < end; i++) {
        variance += (heave[i] - mean) ** 2;
    }
    variance /= end - start;

    // Single waves by zero-up-crossing
    let lastCrossing = -1;
    let crest = -Infinity;
    let trough = Infinity;
    let heightMax = 0;
    let periodSum = 0;
    let waves = 0;
    for (let i = start + 1; i < end; i++) {
        const prev = heave[i - 1] - mean;
        const cur = heave[i] - mean;
        if (prev < 0 && cur >= 0) {
            const crossing = i - 1 - prev / (cur - prev);
            if (lastCrossing >= 0) {
                heightMax = Math.max(heightMax, crest - trough);
                periodSum += (crossing - lastCrossing) / sampleRate;
                waves++;
            }
            lastCrossing = crossing;
            crest = -Infinity;
            trough = Infinity;
        }
        if (lastCrossing >= 0) {
            crest = Math.max(crest, cur);
            trough = Math.min(trough, cur);
        }
    }

    const height = 4 * Math.sqrt(variance);
    // In calm water the record is the noise of the sensor, and its periods mean nothing
    const frequency = height >= CALM_HEIGHT ? peakFrequency : 0;
    return {
        height,
        heightMax,
        period: frequency && waves ? periodSum / waves : 0,
        periodPeak: frequency ? 1 / frequency : 0,
        length: frequency ? deepWaterLength(1 / frequency) : 0,
        frequency,
        waves,
        sampleRate,
        duration: (end - start) / sampleRate,
    };
}

/**
 * Collects the vertical acceleration of every sensor packet for the last `windowMs` and analyses it on demand.
 *
 * The sensor sends at a fixed rate, but the packets arrive in chunks, so the arrival times jitter. The record
 * is therefore taken as equally spaced, with the mean rate over the window. A gap longer than `maxGapMs`
 * breaks that assumption and starts a new record.
 */
export class HeaveRecorder {
    private times: number[] = [];
    private values: number[] = [];

    public constructor(
        private readonly windowMs: number,
        private readonly maxGapMs = 2000,
    ) {}

    /** Adds one packet of the sensor */
    public add(ts: number, acceleration: Vector, angle: Vector): void {
        const last = this.times[this.times.length - 1];
        if (last !== undefined && (ts < last || ts - last > this.maxGapMs)) {
            this.clear();
        }
        this.times.push(ts);
        this.values.push(verticalAcceleration(acceleration, angle.x, angle.y) * GRAVITY);
        // Cut off old values in blocks, not on every packet
        if (ts - this.times[0] > this.windowMs * 1.1) {
            this.trim(ts);
        }
    }

    public clear(): void {
        this.times = [];
        this.values = [];
    }

    /** Time span of the collected record in ms */
    public get duration(): number {
        return this.times.length > 1 ? this.times[this.times.length - 1] - this.times[0] : 0;
    }

    /** Mean number of packets per second */
    public get sampleRate(): number {
        const duration = this.duration;
        return duration ? ((this.times.length - 1) * 1000) / duration : 0;
    }

    /** Analyses the record of the last window. Above 20 Hz it is averaged down to about 10 Hz first */
    public analyze(options: WaveOptions): WaveResult | null {
        const last = this.times[this.times.length - 1];
        if (last === undefined) {
            return null;
        }
        this.trim(last);
        let rate = this.sampleRate;
        let values = this.values;
        if (rate > 20) {
            const factor = Math.floor(rate / 10);
            const reduced: number[] = [];
            for (let i = 0; i + factor <= values.length; i += factor) {
                let sum = 0;
                for (let j = i; j < i + factor; j++) {
                    sum += values[j];
                }
                reduced.push(sum / factor);
            }
            values = reduced;
            rate /= factor;
        }
        return analyzeHeave(values, rate, options);
    }

    private trim(now: number): void {
        const oldest = now - this.windowMs;
        // binary search for the first value inside the window
        let lo = 0;
        let hi = this.times.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.times[mid] < oldest) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if (lo) {
            this.times.splice(0, lo);
            this.values.splice(0, lo);
        }
    }
}
