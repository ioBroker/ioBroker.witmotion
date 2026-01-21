"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WitMotionAdapter = void 0;
const node_dgram_1 = require("node:dgram");
const serialport_1 = require("serialport");
const adapter_core_1 = require("@iobroker/adapter-core"); // Get common adapter utils
class WitMotionAdapter extends adapter_core_1.Adapter {
    serialPort;
    reconnectTimer = null;
    lastStates = new Map();
    tempBytes = [];
    isPortOpen = false;
    udpServer;
    constructor(options = {}) {
        super({
            ...options,
            name: 'witmotion',
            unload: async (callback) => {
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                await this.closePort();
                callback();
            },
            message: async (obj) => {
                // read all serial ports and give them back to GUI
                if (obj) {
                    switch (obj.command) {
                        case 'list':
                            if (obj.callback) {
                                try {
                                    // read all found serial ports
                                    const ports = await serialport_1.SerialPort.list();
                                    this.log.info(`List of serialPort: ${JSON.stringify(ports)}`);
                                    this.sendTo(obj.from, obj.command, ports.map(item => ({
                                        label: item.path,
                                        value: item.path,
                                    })), obj.callback);
                                }
                                catch (e) {
                                    this.log.error(`Cannot list ports: ${e}`);
                                    this.sendTo(obj.from, obj.command, [{ label: 'Not available', value: '' }], obj.callback);
                                }
                            }
                            break;
                        case 'test':
                            if (obj.callback) {
                                try {
                                    const result = await this.test(obj.message.serialPort, obj.message.baudRate);
                                    this.sendTo(obj.from, obj.command, {
                                        result: result ? 'Sensor detected' : 'Sensor not detected',
                                        error: !result ? 'Sensor not detected' : undefined,
                                    }, obj.callback);
                                }
                                catch (e) {
                                    this.sendTo(obj.from, obj.command, { error: `Test failed: ${e.message || e}` }, obj.callback);
                                }
                            }
                            break;
                    }
                }
            },
            ready: () => this.main(),
        });
    }
    async test(serialPort, baudRate) {
        let portClosed = false;
        if (this.config.serialPort === serialPort) {
            portClosed = true;
            await this.closePort();
            if (this.reconnectTimer) {
                clearInterval(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        }
        const result = await this.testPort(serialPort, baudRate);
        if (portClosed) {
            this.retryOpenPort();
        }
        return result;
    }
    async testPort(serialPort, baudRate) {
        this.log.info(`Testing serialPort ${serialPort} with baud rate ${baudRate}`);
        const testPort = new serialport_1.SerialPort({
            path: serialPort,
            baudRate: parseInt(baudRate, 10),
            autoOpen: false,
        });
        await new Promise((resolve, reject) => {
            testPort.open(err => {
                if (err) {
                    this.log.error(`Failed to open serial serialPort ${serialPort} at ${baudRate}: ${err.message || err}`);
                    reject(err);
                    return;
                }
                this.log.info(`Serial serialPort opened for testing: ${serialPort} @ ${baudRate}`);
                resolve();
            });
        });
        let receivedData = false;
        const tempBytes = [];
        // test data listener
        testPort.on('data', (data) => {
            const tempData = Buffer.from(data);
            for (const byte of tempData) {
                console.log(`0x${byte.toString(16).padStart(2, '0')}`);
                tempBytes.push(byte);
                if (tempBytes.length === 2 && (tempBytes[0] !== 0x55 || tempBytes[1] !== 0x61)) {
                    tempBytes.shift();
                    continue;
                }
                if (tempBytes.length === 20) {
                    receivedData = true;
                }
            }
        });
        // Wait up to 2 seconds for data
        await new Promise(resolve => setTimeout(() => resolve(), 2000));
        await new Promise(resolve => {
            testPort.close(err => {
                if (err) {
                    this.log.error(`Error closing test serialPort: ${err.message || err}`);
                }
                this.log.info(`Test serial serialPort closed: ${serialPort} @ ${baudRate}`);
                resolve();
            });
        });
        if (receivedData) {
            this.log.info(`Detected baud rate: ${baudRate}`);
            return true;
        }
        return false;
    }
    openUdpServer(port = 50547) {
        try {
            const sock = (0, node_dgram_1.createSocket)('udp4');
            sock.on('message', async (data) => {
                await this.setStateAsync('info.connection', true);
                // Just push the data to handler
                await this.process(data);
            });
            sock.on('error', (err) => this.log.error(`UDP server error: ${err.message || err}`));
            sock.on('listening', () => {
                const address = sock.address();
                this.log.debug(`UDP server listening on ${typeof address === 'string' ? address : `${address.address}:${address.port} for test purposes`}`);
            });
            sock.bind(port);
            this.udpServer = sock;
        }
        catch (e) {
            this.log.error(`Failed to start UDP server: ${e.message || e}`);
        }
    }
    closeUdpServer() {
        if (!this.udpServer) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            try {
                this.udpServer.close(() => {
                    this.log.info('UDP server closed');
                    this.udpServer = undefined;
                    resolve();
                });
            }
            catch (e) {
                this.log.warn(`Error closing UDP server: ${e.message || e}`);
                this.udpServer = undefined;
                resolve();
            }
        });
    }
    async openPort() {
        await this.closePort();
        this.serialPort = new serialport_1.SerialPort({
            path: this.config.serialPort,
            baudRate: parseInt(this.config.baudRate, 10),
        });
        this.serialPort.on('open', () => {
            this.tempBytes = [];
            this.isPortOpen = true;
            this.log.debug(`Serial port ${this.config.serialPort} opened`);
            this.setState('info.connection', true, true).catch(err => this.log.error(`Cannot set info.connection state: ${err.message || err}`));
        });
        this.serialPort.on('data', async (data) => this.process(data));
        this.serialPort.on('error', err => {
            this.tempBytes = [];
            this.log.error(`Serial error: ${err.message}`);
            if (this.isPortOpen) {
                this.setState('info.connection', false, true).catch(err => {
                    this.log.error(`Cannot set info.connection state: ${err.message || err}`);
                });
            }
            this.isPortOpen = false;
            this.retryOpenPort();
        });
        this.serialPort.on('close', () => {
            if (this.isPortOpen) {
                this.setState('info.connection', false, true).catch(err => {
                    this.log.error(`Cannot set info.connection state: ${err.message || err}`);
                });
            }
            this.tempBytes = [];
            this.isPortOpen = false;
            this.serialPort = null;
            this.retryOpenPort();
        });
    }
    async process(data) {
        const tempData = Buffer.from(data);
        for (const byte of tempData) {
            this.tempBytes.push(byte);
            if (this.tempBytes.length === 2 && (this.tempBytes[0] !== 0x55 || this.tempBytes[1] !== 0x61)) {
                this.tempBytes.shift();
                continue;
            }
            if (this.tempBytes.length === 20) {
                const decodedData = WitMotionAdapter.processData(this.tempBytes.slice(2));
                if (this.config.accelerometer) {
                    await this.setStateIfChangedAsync('acceleration.x', decodedData.acceleration.x, this.config.accelerometerUpdate, this.config.accelerometerAverageInterval);
                    await this.setStateIfChangedAsync('acceleration.y', decodedData.acceleration.y, this.config.accelerometerUpdate, this.config.accelerometerAverageInterval);
                    await this.setStateIfChangedAsync('acceleration.z', decodedData.acceleration.z, this.config.accelerometerUpdate, this.config.accelerometerAverageInterval);
                }
                if (this.config.gyroscope) {
                    await this.setStateIfChangedAsync('gyroscope.x', decodedData.gyroscope.x, this.config.gyroscopeUpdate, this.config.gyroscopeAverageInterval);
                    await this.setStateIfChangedAsync('gyroscope.y', decodedData.gyroscope.y, this.config.gyroscopeUpdate, this.config.gyroscopeAverageInterval);
                    await this.setStateIfChangedAsync('gyroscope.z', decodedData.gyroscope.z, this.config.gyroscopeUpdate, this.config.gyroscopeAverageInterval);
                }
                if (this.config.magnetometer) {
                    await this.setStateIfChangedAsync('angle.x', decodedData.angle.x, this.config.magnetometerUpdate, this.config.magnetometerAverageInterval, this.config.magnetometer360x);
                    await this.setStateIfChangedAsync('angle.y', decodedData.angle.y, this.config.magnetometerUpdate, this.config.magnetometerAverageInterval, this.config.magnetometer360y);
                    await this.setStateIfChangedAsync('angle.z', decodedData.angle.z, this.config.magnetometerUpdate, this.config.magnetometerAverageInterval, this.config.magnetometer360z);
                }
                this.tempBytes = [];
            }
        }
    }
    closePort() {
        if (this.serialPort) {
            return new Promise(resolve => {
                try {
                    if (this.serialPort.isOpen) {
                        this.serialPort.close(err => {
                            if (err) {
                                this.log.error(`Error closing serial serialPort: ${err.message || err}`);
                            }
                            this.log.info('Serial serialPort closed');
                            resolve();
                        });
                        return;
                    }
                }
                catch (e) {
                    this.log.warn(`Error while closing serialPort: ${e.message || e}`);
                }
                this.serialPort = undefined;
                resolve();
            });
        }
        return Promise.resolve();
    }
    retryOpenPort() {
        this.closePort().catch((err) => this.log.error(`Error closing serial serialPort: ${err.message || err}`));
        this.reconnectTimer ||= setInterval(() => {
            if (!this.isPortOpen) {
                this.openPort().catch(err => {
                    this.log.warn(`Error reopening serial serialPort: ${err.message || err}`);
                });
            }
            else if (this.reconnectTimer) {
                clearInterval(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        }, 3000); // Alle 3 Sekunde prüfen
    }
    async setStateIfChangedAsync(id, value, updateInterval, averageInterval, magnetometer360) {
        const now = Date.now();
        const prev = this.lastStates.get(id);
        const changed = !prev || value !== prev.value;
        if (!changed && prev && now - prev.ts < 60000) {
            // unchanged and not older than 60s -> skip
            return;
        }
        prev?.avg.push({ val: value, ts: now });
        if (prev && now - prev.ts < updateInterval) {
            // ignore too often update
            return;
        }
        if (prev) {
            // remove all values older than averageInterval
            const ts = now - averageInterval;
            for (let i = prev.avg.length - 1; i >= 0; i--) {
                if (prev.avg[i].ts < ts) {
                    // Delete all elements from i to 0
                    prev.avg.splice(0, i + 1);
                    break;
                }
            }
            // Calculate average value
            let avg = 0;
            for (let i = prev.avg.length - 1; i >= 0; i--) {
                avg += prev.avg[i].val;
            }
            avg /= prev.avg.length;
            await this.setStateAsync(`${id}Avg`, magnetometer360 ? (avg < 0 ? avg + 360 : avg) : avg, true);
        }
        const newPrev = prev || { value, ts: now, avg: [] };
        newPrev.value = value;
        newPrev.ts = now;
        this.lastStates.set(id, newPrev);
        await this.setStateAsync(id, magnetometer360 ? (value < 0 ? value + 360 : value) : value, true);
    }
    static processData(bytes) {
        const Ax = (WitMotionAdapter.getSignInt16((bytes[1] << 8) | bytes[0]) / 32768) * 16;
        const Ay = (WitMotionAdapter.getSignInt16((bytes[3] << 8) | bytes[2]) / 32768) * 16;
        const Az = (WitMotionAdapter.getSignInt16((bytes[5] << 8) | bytes[4]) / 32768) * 16;
        const Gx = (WitMotionAdapter.getSignInt16((bytes[7] << 8) | bytes[6]) / 32768) * 2000;
        const Gy = (WitMotionAdapter.getSignInt16((bytes[9] << 8) | bytes[8]) / 32768) * 2000;
        const Gz = (WitMotionAdapter.getSignInt16((bytes[11] << 8) | bytes[10]) / 32768) * 2000;
        const AngX = (WitMotionAdapter.getSignInt16((bytes[13] << 8) | bytes[12]) / 32768) * 180;
        const AngY = (WitMotionAdapter.getSignInt16((bytes[15] << 8) | bytes[14]) / 32768) * 180;
        const AngZ = (WitMotionAdapter.getSignInt16((bytes[17] << 8) | bytes[16]) / 32768) * 180;
        return {
            acceleration: { x: Ax, y: Ay, z: Az },
            gyroscope: { x: Gx, y: Gy, z: Gz },
            angle: { x: AngX, y: AngY, z: AngZ },
        };
    }
    // Hilfsfunktion zur Umwandlung von 16-Bit-Werten
    static getSignInt16(value) {
        return value > 0x7fff ? value - 0x10000 : value;
    }
    async syncAccelerationObjects() {
        const channel = {
            _id: 'acceleration',
            type: 'channel',
            common: {
                name: 'Acceleration Data',
            },
            native: {},
        };
        const states = [
            {
                _id: 'acceleration.x',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Acceleration X',
                    type: 'number',
                    unit: 'g',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'acceleration.xAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average acceleration X',
                    type: 'number',
                    unit: 'g',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'acceleration.y',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Acceleration Y',
                    type: 'number',
                    unit: 'g',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'acceleration.yAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average acceleration Y',
                    type: 'number',
                    unit: 'g',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'acceleration.z',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Acceleration Z',
                    type: 'number',
                    unit: 'g',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'acceleration.zAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average acceleration Z',
                    type: 'number',
                    unit: 'g',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
        ];
        if (this.config.accelerometer) {
            const channelObj = await this.getObjectAsync(channel._id);
            if (!channelObj) {
                await this.setObjectAsync(channel._id, channel);
                for (const state of states) {
                    await this.setObjectAsync(state._id, state);
                }
            }
        }
        else {
            // Remove objects
            const channelObj = await this.getObjectAsync(channel._id);
            if (channelObj) {
                await this.delObjectAsync(channel._id);
                for (const state of states) {
                    await this.delObjectAsync(state._id);
                }
            }
        }
    }
    async syncGyroscopeObjects() {
        const channel = {
            _id: 'gyroscope',
            type: 'channel',
            common: {
                name: 'Gyroscope Data',
            },
            native: {},
        };
        const states = [
            {
                _id: 'gyroscope.x',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Gyroscope X',
                    type: 'number',
                    unit: '°/s',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'gyroscope.xAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average gyroscope X',
                    type: 'number',
                    unit: '°/s',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'gyroscope.y',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Gyroscope Y',
                    type: 'number',
                    unit: '°/s',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'gyroscope.yAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average gyroscope Y',
                    type: 'number',
                    unit: '°/s',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'gyroscope.z',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Gyroscope Z',
                    type: 'number',
                    unit: '°/s',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'gyroscope.zAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average gyroscope Z',
                    type: 'number',
                    unit: '°/s',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
        ];
        if (this.config.gyroscope) {
            const channelObj = await this.getObjectAsync(channel._id);
            if (!channelObj) {
                await this.setObjectAsync(channel._id, channel);
                for (const state of states) {
                    await this.setObjectAsync(state._id, state);
                }
            }
        }
        else {
            // Remove objects
            const channelObj = await this.getObjectAsync(channel._id);
            if (channelObj) {
                await this.delObjectAsync(channel._id);
                for (const state of states) {
                    await this.delObjectAsync(state._id);
                }
            }
        }
    }
    async syncAngleObjects() {
        const channel = {
            _id: 'angle',
            type: 'channel',
            common: {
                name: 'Magnetometer Data',
            },
            native: {},
        };
        const states = [
            {
                _id: 'angle.x',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Magnetometer X',
                    type: 'number',
                    unit: '°',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'angle.xAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Magnetometer angle X',
                    type: 'number',
                    unit: '°',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'angle.y',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Magnetometer Y',
                    type: 'number',
                    unit: '°',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'angle.yAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average angle Y',
                    type: 'number',
                    unit: '°',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'angle.z',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Magnetometer Z',
                    type: 'number',
                    unit: '°',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
            {
                _id: 'angle.zAvg',
                type: 'state',
                common: {
                    role: 'value',
                    name: 'Average angle Z',
                    type: 'number',
                    unit: '°',
                    read: true,
                    write: false,
                    def: 0,
                },
                native: {},
            },
        ];
        if (this.config.magnetometer) {
            const channelObj = await this.getObjectAsync(channel._id);
            if (!channelObj) {
                await this.setObjectAsync(channel._id, channel);
                for (const state of states) {
                    await this.setObjectAsync(state._id, state);
                }
            }
        }
        else {
            // Remove objects
            const channelObj = await this.getObjectAsync(channel._id);
            if (channelObj) {
                await this.delObjectAsync(channel._id);
                for (const state of states) {
                    await this.delObjectAsync(state._id);
                }
            }
        }
    }
    async main() {
        await this.setStateAsync('info.connection', false, true);
        if (this.config.test) {
            // Open UDP port 50547 for test purposes
            this.openUdpServer(50547);
        }
        if (!this.config.serialPort) {
            return;
        }
        await this.syncAccelerationObjects();
        await this.syncGyroscopeObjects();
        await this.syncAngleObjects();
        this.openPort().catch((err) => this.log.error(`Error opening serial serialPort: ${err.message || err}`));
    }
}
exports.WitMotionAdapter = WitMotionAdapter;
if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options) => new WitMotionAdapter(options);
}
else {
    // otherwise start the instance directly
    (() => new WitMotionAdapter())();
}
//# sourceMappingURL=main.js.map