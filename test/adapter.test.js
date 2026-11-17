'use strict';

const setup = require('@iobroker/legacy-testing');
const { createSocket } = require('node:dgram');
const data = require('./data.json');

let objects = null;
let states = null;

function checkConnection(done, counter) {
    counter ||= 0;
    if (counter > 20) {
        done?.('Cannot check connection after 20 attempts');
        return;
    }

    states.getState('witmotion.0.info.connection', (err, state) => {
        if (err) {
            console.error(err);
        }
        if (state?.val) {
            done();
        } else {
            setTimeout(() => checkConnection(done, counter + 1), 1000);
        }
    });
}

let interval = null;

function sendDataToImitateConnection() {
    interval ||= setInterval(() => {
        const sock = createSocket('udp4');
        const testData = data.data[0];
        const arr = [];
        for (let j = 0; j < testData.length; j++) {
            arr.push(parseInt(testData[j], 16));
        }
        const buf = Buffer.from(arr);

        console.log('Send test data');
        sock.send(buf, 0, buf.length, 50547, '127.0.0.1', err => {
            sock.close();
            if (err) {
                console.log('Cannot send data to imitate connection', err);
            }
        });

        sock.on('error', (err) => {
            sock.close();
            console.log('Cannot send data to imitate connection', err);
        });
    }, 1000);
}

describe.only('witmotion: Test parser', () => {
    before('witmotion: Start js-controller', function (_done) {
        //
        this.timeout(600000); // because of the first installation from npm
        setup.adapterStarted = false;

        setup.setupController(async () => {
            const config = await setup.getAdapterConfig();
            // enable adapter
            config.common.enabled = true;
            config.common.loglevel = 'debug';
            config.native.test = true;
            // short window, so the wave test is done in half a minute
            config.native.waves = true;
            config.native.wavesWindow = 40;
            config.native.wavesUpdate = 5;
            config.native.wavesMinPeriod = 1;
            config.native.wavesMaxPeriod = 5;

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController(true, (_objects, _states) => {
                objects = _objects;
                states = _states;
                _done();
            });
        });
    });

    it('witmotion: Check if connected', done => {
        sendDataToImitateConnection();
        console.log('Start check connection');
        checkConnection(() => {
            clearInterval(interval);
            interval = null;
            done();
        });
    }).timeout(10000);

    it('witmotion: It must see values', async () => {
        sendDataToImitateConnection();
        // check the values
        let state = await new Promise(resolve =>
            states.getState('witmotion.0.angle.x', (_err, state) => resolve(state)),
        );
        if (!state || state.val !== 0) {
            throw new Error(`State witmotion.0.angle.x expected to be "0" but found ${state?.val}`);
        }
        state = await new Promise(resolve => states.getState('witmotion.0.angle.y', (_err, state) => resolve(state)));
        if (state.val !== 0.5548095703125) {
            throw new Error(`State witmotion.0.angle.y expected to be "0.5548095703125" but found ${state.val}`);
        }
    }).timeout(5000);

    it('witmotion: It must measure waves', async () => {
        clearInterval(interval);
        interval = null;

        // 10 packets per second of a heave of 1 m (trough to crest) and 3 s, sensor level
        const amplitude = 0.5;
        const omega = (2 * Math.PI) / 3;
        const int16 = value => {
            const raw = Math.round(value) & 0xffff;
            return [raw & 0xff, raw >> 8];
        };
        const sock = createSocket('udp4');
        // The timers do not keep 100 ms exactly (on Windows rather 110 ms), so the wave follows the real time
        const start = Date.now();
        const sender = setInterval(() => {
            const t = (Date.now() - start) / 1000;
            const az = 1 - (amplitude * omega * omega * Math.sin(omega * t)) / 9.80665;
            const packet = Buffer.from([
                0x55,
                0x61,
                ...int16(0),
                ...int16(0),
                ...int16((az / 16) * 32768),
                ...new Array(12).fill(0),
            ]);
            sock.send(packet, 50547, '127.0.0.1');
        }, 100);

        try {
            // the first values come after half of the window (20 s) at the next update (every 5 s)
            let height = null;
            for (let attempt = 0; attempt < 40 && height === null; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const state = await states.getStateAsync('witmotion.0.waves.height');
                height = state?.val ?? null;
            }
            const period = (await states.getStateAsync('witmotion.0.waves.period'))?.val;
            console.log(`Waves: Hs ${height} m, Tz ${period} s`);
            const expected = 4 * (amplitude / Math.SQRT2);
            if (height === null || Math.abs(height - expected) > 0.15 * expected) {
                throw new Error(`State witmotion.0.waves.height expected to be about ${expected} but found ${height}`);
            }
            if (!period || Math.abs(period - 3) > 0.3) {
                throw new Error(`State witmotion.0.waves.period expected to be about 3 but found ${period}`);
            }
        } finally {
            clearInterval(sender);
            sock.close();
        }
    }).timeout(60000);


    after('witmotion Server: Stop js-controller', function (_done) {
        // let FUNCTION and not => here
        this.timeout(5000);
        setup.stopController(() => _done());
    });
});
