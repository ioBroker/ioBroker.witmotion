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
        sock.close();
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

            await setup.setAdapterConfig(config.common, config.native);

            setup.startController((_objects, _states) => {
                objects = _objects;
                states = _states;
                _done();
            });
        });
    });

    it('witmotion: Check if connected', done => {
        sendDataToImitateConnection();
        checkConnection(() => {
            clearInterval(interval);
            interval = null;
            done();
        });
    }).timeout(10000);

    it('witmotion: It must see position and other values', async () => {
        const sock = createSocket('udp4');
        for (let i = 0; i < data.data.length; i++) {
            const testData = data.data[i];
            const arr = [];
            for (let j = 0; j < testData.length; j++) {
                arr.push(parseInt(testData[j], 16));
            }
            const buf = Buffer.from(arr);

            sock.send(buf, 0, buf.length, 50547, '127.0.0.1', err => {
                sock.close();
                if (err) {
                    console.log('Cannot send data to imitate connection', err);
                }
            });
        }

        sock.on('error', err => {
            sock.close();
            console.log('Cannot send data to imitate connection', err);
        });
        sock.close();
        // check the values
        let state = await new Promise(resolve =>
            states.getState('witmotion.0.angle.x', (_err, state) => resolve(state)),
        );
        if (state.val !== 0) {
            throw new Error(`State witmotion.0.angle.x expected to be "0" but found ${state.val}`);
        }
        state = await new Promise(resolve => states.getState('witmotion.0.angle.y', (_err, state) => resolve(state)));
        if (state.val !== 15.96399) {
            throw new Error(`State witmotion.0.angle.y expected to be "15.96399" but found ${state.val}`);
        }
    }).timeout(5000);


    after('witmotion Server: Stop js-controller', function (_done) {
        // let FUNCTION and not => here
        this.timeout(5000);
        setup.stopController(() => _done());
    });
});
