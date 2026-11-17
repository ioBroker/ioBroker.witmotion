'use strict';

const assert = require('node:assert');
const { analyzeHeave, verticalAcceleration, HeaveRecorder, GRAVITY } = require('../build/lib/waves');
const data = require('./data.json');

const OPTIONS = { minPeriod: 2, maxPeriod: 20 };

/** Deterministic noise, so the tests do not flap */
function noise(seed) {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648 - 0.5;
    };
}

/**
 * Vertical acceleration (m/s², with gravity) of a heave that is the sum of sine waves
 *
 * @param {{ amplitude: number; period: number; phase?: number }[]} components heave amplitude in m, period in s
 */
function record(components, { rate = 10, seconds = 300, noiseLevel = 0.02, drift = 0 } = {}) {
    const rnd = noise(42);
    const values = [];
    for (let i = 0; i < rate * seconds; i++) {
        const t = i / rate;
        let a = GRAVITY + (drift * t) / seconds + noiseLevel * rnd();
        for (const { amplitude, period, phase = 0 } of components) {
            const omega = (2 * Math.PI) / period;
            a -= amplitude * omega * omega * Math.sin(omega * t + phase);
        }
        values.push(a);
    }
    return values;
}

function near(actual, expected, tolerance, what) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: expected ${expected} ± ${tolerance}, got ${actual}`);
}

describe('waves: vertical acceleration', () => {
    it('is 1 g at rest in any orientation', () => {
        for (const [roll, pitch] of [
            [0, 0],
            [25, 0],
            [0, -15],
            [-30, 12],
        ]) {
            const r = (roll * Math.PI) / 180;
            const p = (pitch * Math.PI) / 180;
            const acc = { x: -Math.sin(p), y: Math.sin(r) * Math.cos(p), z: Math.cos(r) * Math.cos(p) };
            near(verticalAcceleration(acc, roll, pitch), 1, 1e-12, `roll ${roll}, pitch ${pitch}`);
        }
    });

    it('matches the recorded packets of the sensor', () => {
        const int16 = v => (v > 0x7fff ? v - 0x10000 : v);
        for (const packet of data.data) {
            const b = packet.slice(2).map(h => parseInt(h, 16));
            const value = i => int16((b[i + 1] << 8) | b[i]);
            const acc = { x: (value(0) / 32768) * 16, y: (value(2) / 32768) * 16, z: (value(4) / 32768) * 16 };
            const roll = (value(12) / 32768) * 180;
            const pitch = (value(14) / 32768) * 180;
            const vertical = verticalAcceleration(acc, roll, pitch);
            const magnitude = Math.hypot(acc.x, acc.y, acc.z);
            // at rest all of the measured acceleration points up
            near(vertical, magnitude, 1e-4, 'vertical part of the packet');
        }
    });
});

describe('waves: analysis of the heave', () => {
    it('measures a regular wave', () => {
        // 1 m high (amplitude 0.5 m), 6 s
        const result = analyzeHeave(record([{ amplitude: 0.5, period: 6 }], { drift: 0.05 }), 10, OPTIONS);
        near(result.height, 4 * (0.5 / Math.SQRT2), 0.03, 'Hs');
        near(result.heightMax, 1, 0.03, 'Hmax');
        near(result.period, 6, 0.1, 'Tz');
        near(result.periodPeak, 6, 0.3, 'Tp');
    });

    it('measures swell and wind sea together', () => {
        const result = analyzeHeave(
            record([
                { amplitude: 0.3, period: 10 },
                { amplitude: 0.4, period: 4, phase: 1 },
            ]),
            10,
            OPTIONS,
        );
        near(result.height, 4 * Math.sqrt(0.3 ** 2 / 2 + 0.4 ** 2 / 2), 0.04, 'Hs');
        // the wind sea carries more energy
        near(result.periodPeak, 4, 0.2, 'Tp');
        assert.ok(result.heightMax > 1 && result.heightMax <= 1.41, `Hmax ${result.heightMax}`);
    });

    it('ignores vibration', () => {
        // engine vibration of 0.5 m/s² at 1.3 Hz, no waves
        const values = record([], { noiseLevel: 0 }).map((a, i) => a + 0.5 * Math.sin(2 * Math.PI * 1.3 * (i / 10)));
        const result = analyzeHeave(values, 10, OPTIONS);
        assert.ok(result.height < 0.005, `Hs ${result.height}`);
    });

    it('stays calm in the harbour', () => {
        // sensor noise about twice that of the MPU9250 (300 µg/√Hz)
        const result = analyzeHeave(record([], { noiseLevel: 0.05 }), 10, OPTIONS);
        assert.ok(result.height < 0.05, `Hs ${result.height}`);
    });

    it('needs a record longer than the longest period', () => {
        assert.strictEqual(analyzeHeave(record([], { seconds: 60 }), 10, OPTIONS), null);
    });
});

describe('waves: recorder', () => {
    it('collects packets and analyses the last window', () => {
        const recorder = new HeaveRecorder(300000);
        const values = record([{ amplitude: 0.5, period: 5 }], { rate: 50, seconds: 400 });
        values.forEach((a, i) => recorder.add(i * 20, { x: 0, y: 0, z: a / GRAVITY }, { x: 0, y: 0, z: 0 }));
        const result = recorder.analyze(OPTIONS);
        near(recorder.duration, 300000, 100, 'window');
        near(recorder.sampleRate, 50, 0.01, 'rate');
        // 50 Hz is averaged down to 10 Hz
        near(result.sampleRate, 10, 0.01, 'analysed rate');
        near(result.height, 4 * (0.5 / Math.SQRT2), 0.03, 'Hs');
        near(result.period, 5, 0.1, 'Tz');
    });

    it('starts again after a gap', () => {
        const recorder = new HeaveRecorder(300000);
        for (let i = 0; i < 100; i++) {
            recorder.add(i * 100, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
        }
        recorder.add(100 * 100 + 5000, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 0 });
        assert.strictEqual(recorder.duration, 0);
    });
});
