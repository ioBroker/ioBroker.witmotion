import { type Socket, createSocket } from 'node:dgram';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import { SerialPort } from 'serialport';
import { Adapter, type AdapterOptions } from '@iobroker/adapter-core'; // Get common adapter utils
import type { WitMotionAdapterConfig } from './types';

interface Value {
    value: number;
    ts: number;
    avg: { val: number; ts: number }[];
}

interface SerialPortInfo {
    path: string;
    manufacturer?: string;
    serialNumber?: string;
    pnpId?: string;
    locationId?: string;
    vendorId?: string;
    productId?: string;
    /** Stable physical-USB-port identifier from /dev/serial/by-path (Linux only) */
    byPath?: string;
}

export class WitMotionAdapter extends Adapter {
    declare config: WitMotionAdapterConfig;
    private serialPort?: SerialPort | null;
    private reconnectTimer: ReturnType<typeof setInterval> | null = null;
    private lastStates = new Map<string, Value>();
    private tempBytes: number[] = [];
    private isPortOpen = false;
    private udpServer?: Socket;
    /** Path of the currently opened serial port (resolved from config; may differ from config.serialPort in USB device mode) */
    private openedPath = '';

    public constructor(options: Partial<AdapterOptions> = {}) {
        super({
            ...options,
            name: 'witmotion',
            unload: async callback => {
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
                await this.closePort();
                await this.closeUdpServer();
                callback();
            },
            message: async obj => {
                // read all serial ports and give them back to GUI
                if (obj) {
                    switch (obj.command) {
                        case 'list':
                            if (obj.callback) {
                                try {
                                    // read all found serial ports
                                    const ports = await SerialPort.list();
                                    this.log.info(`List of serialPort: ${JSON.stringify(ports)}`);
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        ports.map(item => ({
                                            label: item.path,
                                            value: item.path,
                                        })),
                                        obj.callback,
                                    );
                                } catch (e) {
                                    this.log.error(`Cannot list ports: ${e}`);
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        [{ label: 'Not available', value: '' }],
                                        obj.callback,
                                    );
                                }
                            }

                            break;

                        case 'listDevices':
                            if (obj.callback) {
                                try {
                                    // read all found serial ports and expose them by their stable USB ID.
                                    // Keep USB devices: either VID/PID was parsed, or the pnpId is a USB path
                                    // (this excludes Bluetooth/BTHENUM virtual COM ports).
                                    const ports = await WitMotionAdapter.listSerialDevices();
                                    const devices = ports
                                        .filter(
                                            port =>
                                                (port.vendorId && port.productId) ||
                                                port.pnpId?.toUpperCase().startsWith('USB'),
                                        )
                                        .map(port => ({
                                            label: WitMotionAdapter.makeDeviceLabel(port),
                                            value: WitMotionAdapter.makeDeviceId(port),
                                        }));
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        devices.length ? devices : [{ label: 'No USB devices found', value: '' }],
                                        obj.callback,
                                    );
                                } catch (e) {
                                    this.log.error(`Cannot list USB devices: ${e}`);
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        [{ label: 'Not available', value: '' }],
                                        obj.callback,
                                    );
                                }
                            }

                            break;

                        case 'test':
                            if (obj.callback) {
                                try {
                                    // In USB device mode resolve the stable device ID to the current port path
                                    let serialPort: string = obj.message.serialPort;
                                    if (obj.message.selectBy === 'device' && obj.message.serialPortDeviceId) {
                                        serialPort = await WitMotionAdapter.findPortByDeviceId(
                                            obj.message.serialPortDeviceId,
                                        );
                                        if (!serialPort) {
                                            this.sendTo(
                                                obj.from,
                                                obj.command,
                                                { error: 'USB device not found' },
                                                obj.callback,
                                            );
                                            break;
                                        }
                                    }
                                    const result = await this.test(serialPort, obj.message.baudRate);
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        {
                                            result: result ? 'Sensor detected' : 'Sensor not detected',
                                            error: !result ? 'Sensor not detected' : undefined,
                                        },
                                        obj.callback,
                                    );
                                } catch (e) {
                                    this.sendTo(
                                        obj.from,
                                        obj.command,
                                        { error: `Test failed: ${e.message || e}` },
                                        obj.callback,
                                    );
                                }
                            }
                            break;
                    }
                }
            },
            ready: () => this.main(),
        });
    }

    private async test(serialPort: string, baudRate: string | number): Promise<boolean> {
        let portClosed = false;
        if (this.openedPath && this.openedPath === serialPort) {
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

    private async testPort(serialPort: string, baudRate: number | string): Promise<boolean> {
        this.log.info(`Testing serialPort ${serialPort} with baud rate ${baudRate}`);
        const testPort = new SerialPort({
            path: serialPort,
            baudRate: parseInt(baudRate as string, 10),
            autoOpen: false,
        });

        await new Promise<void>((resolve, reject) => {
            testPort.open(err => {
                if (err) {
                    this.log.error(
                        `Failed to open serial serialPort ${serialPort} at ${baudRate}: ${err.message || err}`,
                    );
                    reject(err);
                    return;
                }
                this.log.info(`Serial serialPort opened for testing: ${serialPort} @ ${baudRate}`);
                resolve();
            });
        });

        let receivedData = false;
        const tempBytes: number[] = [];

        // test data listener
        testPort.on('data', (data: Buffer): void => {
            const tempData: Buffer = Buffer.from(data);
            for (const byte of tempData) {
                tempBytes.push(byte as unknown as number);
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
        await new Promise<void>(resolve => setTimeout(() => resolve(), 2000));

        await new Promise<void>(resolve => {
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

    private openUdpServer(port: number = 50547): void {
        try {
            const sock = createSocket('udp4');

            sock.on('message', async (data: Buffer): Promise<void> => {
                await this.setStateAsync('info.connection', true, true);
                // Just push the data to handler
                await this.process(data);
            });

            sock.on('error', (err: Error) => this.log.error(`UDP server error: ${err.message || err}`));

            sock.on('listening', () => {
                const address = sock.address();
                this.log.debug(
                    `UDP server listening on ${typeof address === 'string' ? address : `${address.address}:${address.port} for test purposes`}`,
                );
            });

            sock.bind(port);
            this.udpServer = sock;
        } catch (e) {
            this.log.error(`Failed to start UDP server: ${(e as Error).message || e}`);
        }
    }

    private closeUdpServer(): Promise<void> {
        if (!this.udpServer) {
            return Promise.resolve();
        }
        return new Promise(resolve => {
            try {
                this.udpServer!.close(() => {
                    this.log.info('UDP server closed');
                    this.udpServer = undefined;
                    resolve();
                });
            } catch (e) {
                this.log.warn(`Error closing UDP server: ${(e as Error).message || e}`);
                this.udpServer = undefined;
                resolve();
            }
        });
    }

    /**
     * Map each real serial device path (e.g. /dev/ttyUSB0) to its stable physical-USB-port name
     * from /dev/serial/by-path (Linux only). Unlike pnpId (derived from VID/PID, identical for
     * identical chips), by-path encodes the actual USB topology and differs per socket.
     * Returns an empty map on non-Linux systems or when the directory is unavailable.
     */
    static getByPathMap(): Record<string, string> {
        const dir = '/dev/serial/by-path';
        const map: Record<string, string> = {};
        try {
            if (!existsSync(dir)) {
                return map;
            }
            for (const name of readdirSync(dir)) {
                try {
                    map[realpathSync(`${dir}/${name}`)] = name;
                } catch {
                    // ignore broken symlink
                }
            }
        } catch {
            // ignore (non-Linux or no permission)
        }
        return map;
    }

    /** List serial ports, enriched with a stable physical-USB-port id (by-path) where available */
    static async listSerialDevices(): Promise<SerialPortInfo[]> {
        const ports = await SerialPort.list();
        const byPath = WitMotionAdapter.getByPathMap();
        return ports.map(port => ({ ...port, byPath: byPath[port.path] }));
    }

    /**
     * Build a stable, port-name-independent identifier for a USB serial device.
     * Prefers the programmed serial number (unique per chip, survives re-plugging into any port).
     * For identical chips without a unique serial number it falls back to the physical USB
     * location (by-path on Linux, pnpId/locationId elsewhere) — this distinguishes them but binds
     * to the USB socket, so it stays stable only while the chip remains in the same physical port.
     */
    static makeDeviceId(port: SerialPortInfo): string {
        const base = `${port.vendorId || ''}:${port.productId || ''}`;
        if (port.serialNumber) {
            return `${base}:${port.serialNumber}`;
        }
        // No unique serial number: pick the most stable identifier that still differs between two
        // identical chips. On Linux pnpId comes from /dev/serial/by-id and is the SAME for identical
        // chips, so it must NOT be used there — prefer by-path; if even that is missing fall back to
        // the (less stable) device path. On Windows pnpId encodes the physical port and is reliable.
        const isPosix = port.path.startsWith('/dev/');
        const location = port.byPath || port.locationId || (isPosix ? port.path : port.pnpId) || port.path;
        return `${base}@${location}`;
    }

    /** Build a human-readable label for the USB device dropdown */
    static makeDeviceLabel(port: SerialPortInfo): string {
        const parts: string[] = [];
        if (port.manufacturer) {
            parts.push(port.manufacturer);
        }
        parts.push(`${port.vendorId}:${port.productId}`);
        if (port.serialNumber) {
            parts.push(`SN:${port.serialNumber}`);
        }
        if (port.path) {
            parts.push(`(${port.path})`);
        }
        // Physical USB location — the only way to tell identical chips (no unique serial) apart
        const location = port.byPath || port.locationId || port.pnpId;
        if (location) {
            parts.push(`@ ${location}`);
        }
        return parts.join(' ');
    }

    /** Resolve a stored stable USB device ID to its current port path (empty string if not found) */
    static async findPortByDeviceId(deviceId: string): Promise<string> {
        if (!deviceId) {
            return '';
        }
        const ports = await WitMotionAdapter.listSerialDevices();
        const match = ports.find(port => WitMotionAdapter.makeDeviceId(port) === deviceId);
        return match?.path || '';
    }

    /** Resolve the serial port path to open, honoring the configured selection method */
    private async resolveSerialPortPath(): Promise<string> {
        if (this.config.selectBy === 'device') {
            if (!this.config.serialPortDeviceId) {
                return '';
            }
            const path = await WitMotionAdapter.findPortByDeviceId(this.config.serialPortDeviceId);
            if (!path) {
                this.log.warn(`No serial port found for USB device "${this.config.serialPortDeviceId}"`);
                return '';
            }
            this.log.debug(`Resolved USB device "${this.config.serialPortDeviceId}" to port "${path}"`);
            return path;
        }
        return this.config.serialPort;
    }

    /** True if the user configured a serial device (by port or by USB ID) */
    private isPortConfigured(): boolean {
        return this.config.selectBy === 'device' ? !!this.config.serialPortDeviceId : !!this.config.serialPort;
    }

    private async openPort(): Promise<void> {
        await this.closePort();

        const path = await this.resolveSerialPortPath();
        if (!path) {
            // Nothing to connect to (e.g. USB device currently not plugged in) -> keep retrying
            this.retryOpenPort();
            return;
        }
        this.openedPath = path;

        this.serialPort = new SerialPort({
            path,
            baudRate: parseInt(this.config.baudRate as string, 10),
        });

        this.serialPort.on('open', () => {
            this.tempBytes = [];
            this.isPortOpen = true;
            this.log.debug(`Serial port ${path} opened`);
            this.setState('info.connection', true, true).catch(err =>
                this.log.error(`Cannot set info.connection state: ${err.message || err}`),
            );
        });

        this.serialPort.on('data', async (data: Buffer): Promise<void> => this.process(data));

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
            this.openedPath = '';
            this.serialPort = null;
            this.retryOpenPort();
        });
    }

    async process(data: Buffer): Promise<void> {
        const tempData: Buffer = Buffer.from(data);
        for (const byte of tempData) {
            this.tempBytes.push(byte as unknown as number);
            if (this.tempBytes.length === 2 && (this.tempBytes[0] !== 0x55 || this.tempBytes[1] !== 0x61)) {
                this.tempBytes.shift();
                continue;
            }
            if (this.tempBytes.length === 20) {
                const decodedData = WitMotionAdapter.processData(this.tempBytes.slice(2));
                if (this.config.accelerometer) {
                    await this.setStateIfChangedAsync(
                        'acceleration.x',
                        decodedData.acceleration.x,
                        this.config.accelerometerUpdate as number,
                        this.config.accelerometerAverageInterval as number,
                    );
                    await this.setStateIfChangedAsync(
                        'acceleration.y',
                        decodedData.acceleration.y,
                        this.config.accelerometerUpdate as number,
                        this.config.accelerometerAverageInterval as number,
                    );
                    await this.setStateIfChangedAsync(
                        'acceleration.z',
                        decodedData.acceleration.z,
                        this.config.accelerometerUpdate as number,
                        this.config.accelerometerAverageInterval as number,
                    );
                }
                if (this.config.gyroscope) {
                    await this.setStateIfChangedAsync(
                        'gyroscope.x',
                        decodedData.gyroscope.x,
                        this.config.gyroscopeUpdate as number,
                        this.config.gyroscopeAverageInterval as number,
                    );
                    await this.setStateIfChangedAsync(
                        'gyroscope.y',
                        decodedData.gyroscope.y,
                        this.config.gyroscopeUpdate as number,
                        this.config.gyroscopeAverageInterval as number,
                    );
                    await this.setStateIfChangedAsync(
                        'gyroscope.z',
                        decodedData.gyroscope.z,
                        this.config.gyroscopeUpdate as number,
                        this.config.gyroscopeAverageInterval as number,
                    );
                }
                if (this.config.magnetometer) {
                    await this.setStateIfChangedAsync(
                        'angle.x',
                        decodedData.angle.x + ((this.config.magnetometerOffsetX as number) || 0),
                        this.config.magnetometerUpdate as number,
                        this.config.magnetometerAverageInterval as number,
                        this.config.magnetometer360x,
                    );
                    await this.setStateIfChangedAsync(
                        'angle.y',
                        decodedData.angle.y + ((this.config.magnetometerOffsetY as number) || 0),
                        this.config.magnetometerUpdate as number,
                        this.config.magnetometerAverageInterval as number,
                        this.config.magnetometer360y,
                    );
                    await this.setStateIfChangedAsync(
                        'angle.z',
                        decodedData.angle.z + ((this.config.magnetometerOffsetZ as number) || 0),
                        this.config.magnetometerUpdate as number,
                        this.config.magnetometerAverageInterval as number,
                        this.config.magnetometer360z,
                    );
                }

                this.tempBytes = [];
            }
        }
    }

    private closePort(): Promise<void> {
        if (this.serialPort) {
            return new Promise(resolve => {
                try {
                    if (this.serialPort!.isOpen) {
                        this.serialPort!.close(err => {
                            if (err) {
                                this.log.error(`Error closing serial serialPort: ${err.message || err}`);
                            }
                            this.log.info('Serial serialPort closed');
                            resolve();
                        });
                        return;
                    }
                } catch (e) {
                    this.log.warn(`Error while closing serialPort: ${(e as Error).message || e}`);
                }
                this.serialPort = undefined;
                resolve();
            });
        }

        return Promise.resolve();
    }

    retryOpenPort(): void {
        this.closePort().catch((err: Error) =>
            this.log.error(`Error closing serial serialPort: ${err.message || err}`),
        );

        this.reconnectTimer ||= setInterval(() => {
            if (!this.isPortOpen) {
                this.openPort().catch(err => {
                    this.log.warn(`Error reopening serial serialPort: ${err.message || err}`);
                });
            } else if (this.reconnectTimer) {
                clearInterval(this.reconnectTimer);
                this.reconnectTimer = null;
            }
        }, 3000); // Alle 3 Sekunde prüfen
    }

    private async setStateIfChangedAsync(
        id: string,
        value: number,
        updateInterval: number,
        averageInterval: number,
        magnetometer360?: boolean,
    ): Promise<void> {
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

        const newPrev: Value = prev || { value, ts: now, avg: [] };
        newPrev.value = value;
        newPrev.ts = now;

        this.lastStates.set(id, newPrev);
        await this.setStateAsync(id, magnetometer360 ? (value < 0 ? value + 360 : value) : value, true);
    }

    static processData(bytes: number[]): {
        acceleration: { x: number; y: number; z: number };
        gyroscope: { x: number; y: number; z: number };
        angle: { x: number; y: number; z: number };
    } {
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

    // Helper function to read 16bit values
    static getSignInt16(value: number): number {
        return value > 0x7fff ? value - 0x10000 : value;
    }

    async syncAccelerationObjects(): Promise<void> {
        const channel: ioBroker.ChannelObject = {
            _id: 'acceleration',
            type: 'channel',
            common: {
                name: 'Acceleration Data',
            },
            native: {},
        };

        const states: ioBroker.StateObject[] = [
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
        } else {
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

    async syncGyroscopeObjects(): Promise<void> {
        const channel: ioBroker.ChannelObject = {
            _id: 'gyroscope',
            type: 'channel',
            common: {
                name: 'Gyroscope Data',
            },
            native: {},
        };

        const states: ioBroker.StateObject[] = [
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
        } else {
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

    async syncAngleObjects(): Promise<void> {
        const channel: ioBroker.ChannelObject = {
            _id: 'angle',
            type: 'channel',
            common: {
                name: 'Magnetometer Data',
            },
            native: {},
        };

        const states: ioBroker.StateObject[] = [
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
        } else {
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

    async main(): Promise<void> {
        await this.setStateAsync('info.connection', false, true);

        if (this.config.test) {
            this.log.info('This is a test, so start UDP server on port 50547');
            // Open UDP port 50547 for test purposes
            this.openUdpServer(50547);
        }

        await this.syncAccelerationObjects();
        await this.syncGyroscopeObjects();
        await this.syncAngleObjects();

        if (!this.isPortConfigured()) {
            return;
        }

        this.openPort().catch((err: Error) => this.log.error(`Error opening serial serialPort: ${err.message || err}`));
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new WitMotionAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new WitMotionAdapter())();
}
